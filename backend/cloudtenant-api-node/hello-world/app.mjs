import { randomUUID } from 'crypto';
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ddbDocClient, TABLE_NAME } from './db.mjs';

// Allows injecting a mock client for automated unit & isolation testing
let activeDocClient = ddbDocClient;
export function setDocClient(client) {
  activeDocClient = client;
}

// Standard CORS and JSON response helper
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

// Extract authenticated user identity from verified Cognito claims
function extractUser(event) {
  const claims = event?.requestContext?.authorizer?.claims;
  if (claims && claims.sub) {
    return {
      userId: claims.sub,
      email: claims.email || claims['cognito:username'] || claims.sub,
    };
  }

  // Allow simulated claims for local tests if explicitly provided in request context or test headers
  if (process.env.NODE_ENV === 'test' && event?.headers?.['x-mock-user-id']) {
    return {
      userId: event.headers['x-mock-user-id'],
      email: event.headers['x-mock-user-email'] || `${event.headers['x-mock-user-id']}@example.com`,
    };
  }

  return null;
}

// Server-side verification of tenant membership
// SECURITY: Guarantees that the caller has an existing membership in the tenant.
// Prevents cross-tenant access regardless of any tenant ID supplied by the client.
async function verifyTenantMembership(userId, tenantId) {
  if (!userId || !tenantId) return null;

  const result = await activeDocClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: `TENANT#${tenantId}`,
      },
    })
  );

  return result.Item || null;
}

export const lambdaHandler = async (event, context) => {
  const method = event?.httpMethod || event?.requestContext?.http?.method || 'GET';
  let path = event?.path || event?.rawPath || '/';

  // Handle API Gateway base path stage stripping (e.g. /Prod/tenants -> /tenants)
  if (path.startsWith('/Prod')) {
    path = path.slice(5) || '/';
  }

  // Preflight CORS handler
  if (method === 'OPTIONS') {
    return buildResponse(200, { message: 'OK' });
  }

  // Unauthenticated Health Check route
  if ((path === '/' || path === '/health') && method === 'GET') {
    return buildResponse(200, {
      status: 'healthy',
      service: 'CloudTenant Multi-Tenant SaaS Management Platform',
      version: '1.0.0',
      region: process.env.AWS_REGION || process.env.REGION || 'ap-south-1',
      timestamp: new Date().toISOString(),
    });
  }

  // Authenticate user identity from Cognito JWT claims
  const user = extractUser(event);
  if (!user) {
    return buildResponse(401, {
      error: 'Unauthorized',
      message: 'Valid Cognito authentication token required',
    });
  }

  let body = {};
  if (event?.body) {
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch {
      return buildResponse(400, { error: 'Bad Request', message: 'Malformed JSON payload' });
    }
  }

  try {
    // =========================================================================
    // ROUTE: POST /tenants — Create Organization/Tenant
    // Automatically designates the creator as Owner
    // =========================================================================
    if (path === '/tenants' && method === 'POST') {
      const name = body?.name?.trim();
      if (!name || name.length < 2 || name.length > 60) {
        return buildResponse(400, {
          error: 'Validation Error',
          message: 'Tenant name must be between 2 and 60 characters',
        });
      }

      const tenantId = `org-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const plan = body?.plan || 'Standard';
      const description = body?.description?.trim() || '';

      // 1. Tenant Metadata
      const tenantRecord = {
        PK: `TENANT#${tenantId}`,
        SK: 'METADATA',
        tenantId,
        name,
        description,
        plan,
        createdBy: user.userId,
        creatorEmail: user.email,
        createdAt: now,
        updatedAt: now,
      };

      // 2. User-to-Tenant Membership Record (for listing user's tenants & authorization)
      const userMembership = {
        PK: `USER#${user.userId}`,
        SK: `TENANT#${tenantId}`,
        tenantId,
        tenantName: name,
        role: 'Owner',
        joinedAt: now,
      };

      // 3. Tenant-to-User Membership Record (for listing members of a tenant)
      const tenantMember = {
        PK: `TENANT#${tenantId}`,
        SK: `USER#${user.userId}`,
        userId: user.userId,
        email: user.email,
        role: 'Owner',
        joinedAt: now,
      };

      await activeDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: tenantRecord,
        })
      );

      await activeDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: userMembership,
        })
      );

      await activeDocClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: tenantMember,
        })
      );

      return buildResponse(201, {
        message: 'Tenant created successfully',
        tenant: {
          tenantId,
          name,
          description,
          plan,
          role: 'Owner',
          createdAt: now,
        },
      });
    }

    // =========================================================================
    // ROUTE: GET /tenants — List Authorized Tenants for Current User
    // =========================================================================
    if (path === '/tenants' && method === 'GET') {
      const result = await activeDocClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: {
            ':pk': `USER#${user.userId}`,
            ':skPrefix': 'TENANT#',
          },
        })
      );

      const tenants = (result.Items || []).map((item) => ({
        tenantId: item.tenantId,
        name: item.tenantName,
        role: item.role,
        joinedAt: item.joinedAt,
      }));

      return buildResponse(200, { tenants });
    }

    // =========================================================================
    // TENANT-SCOPED ROUTES: /tenants/{tenantId}/...
    // Enforces strict server-side authorization check before continuing
    // =========================================================================
    const tenantRouteMatch = path.match(/^\/tenants\/([^/]+)(\/.*)?$/);
    if (tenantRouteMatch) {
      const tenantId = tenantRouteMatch[1];
      const subPath = tenantRouteMatch[2] || '';

      // SECURITY CHECK: Verify caller is authorized for this tenant
      const membership = await verifyTenantMembership(user.userId, tenantId);
      if (!membership) {
        return buildResponse(403, {
          error: 'Forbidden',
          message: `Access Denied: You are not an authorized member of tenant "${tenantId}". Cross-tenant access is prohibited.`,
          tenantId,
        });
      }

      // --- GET /tenants/{tenantId} ---
      if (subPath === '' && method === 'GET') {
        const result = await activeDocClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `TENANT#${tenantId}`,
              SK: 'METADATA',
            },
          })
        );

        if (!result.Item) {
          return buildResponse(404, { error: 'Not Found', message: 'Tenant metadata not found' });
        }

        return buildResponse(200, {
          tenant: {
            tenantId: result.Item.tenantId,
            name: result.Item.name,
            description: result.Item.description,
            plan: result.Item.plan,
            role: membership.role,
            createdAt: result.Item.createdAt,
          },
        });
      }

      // --- GET /tenants/{tenantId}/members ---
      if (subPath === '/members' && method === 'GET') {
        const result = await activeDocClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `TENANT#${tenantId}`,
              ':skPrefix': 'USER#',
            },
          })
        );

        const members = (result.Items || []).map((m) => ({
          userId: m.userId,
          email: m.email,
          role: m.role,
          joinedAt: m.joinedAt,
        }));

        return buildResponse(200, { tenantId, members });
      }

      // --- POST /tenants/{tenantId}/members ---
      if (subPath === '/members' && method === 'POST') {
        if (membership.role !== 'Owner' && membership.role !== 'Admin') {
          return buildResponse(403, {
            error: 'Forbidden',
            message: 'Only tenant Owners and Admins can add members.',
          });
        }

        const newUserId = body?.userId?.trim();
        const newEmail = body?.email?.trim();
        const role = body?.role || 'Member';

        if (!newUserId || !newEmail) {
          return buildResponse(400, {
            error: 'Validation Error',
            message: 'userId and email are required to add a member',
          });
        }

        const now = new Date().toISOString();

        await activeDocClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `USER#${newUserId}`,
              SK: `TENANT#${tenantId}`,
              tenantId,
              tenantName: membership.tenantName || tenantId,
              role,
              joinedAt: now,
            },
          })
        );

        await activeDocClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `TENANT#${tenantId}`,
              SK: `USER#${newUserId}`,
              userId: newUserId,
              email: newEmail,
              role,
              joinedAt: now,
            },
          })
        );

        return buildResponse(201, {
          message: 'Member added successfully',
          member: { userId: newUserId, email: newEmail, role, joinedAt: now },
        });
      }

      // =======================================================================
      // PROJECT CRUD (TENANT DATA ISOLATION VIA PARTITION KEY PK: TENANT#<tenantId>)
      // =======================================================================

      // --- GET /tenants/{tenantId}/projects ---
      if (subPath === '/projects' && method === 'GET') {
        const result = await activeDocClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': `TENANT#${tenantId}`,
              ':skPrefix': 'PROJECT#',
            },
          })
        );

        const projects = (result.Items || []).map((item) => ({
          projectId: item.projectId,
          tenantId: item.tenantId,
          name: item.name,
          description: item.description,
          status: item.status,
          priority: item.priority || 'Medium',
          budget: item.budget || 0,
          createdBy: item.createdBy,
          creatorEmail: item.creatorEmail,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }));

        return buildResponse(200, {
          tenantId,
          totalProjects: projects.length,
          projects,
        });
      }

      // --- POST /tenants/{tenantId}/projects ---
      if (subPath === '/projects' && method === 'POST') {
        const name = body?.name?.trim();
        if (!name || name.length < 2 || name.length > 80) {
          return buildResponse(400, {
            error: 'Validation Error',
            message: 'Project name is required and must be between 2 and 80 characters',
          });
        }

        const validStatuses = ['Planning', 'Active', 'Completed', 'On Hold'];
        const status = validStatuses.includes(body?.status) ? body.status : 'Planning';
        const priority = ['Low', 'Medium', 'High', 'Critical'].includes(body?.priority)
          ? body.priority
          : 'Medium';
        const description = body?.description?.trim() || '';
        const budget = typeof body?.budget === 'number' ? body.budget : Number(body?.budget) || 0;

        const projectId = `proj-${randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();

        const projectItem = {
          PK: `TENANT#${tenantId}`,
          SK: `PROJECT#${projectId}`,
          projectId,
          tenantId,
          name,
          description,
          status,
          priority,
          budget,
          createdBy: user.userId,
          creatorEmail: user.email,
          createdAt: now,
          updatedAt: now,
        };

        await activeDocClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: projectItem,
          })
        );

        return buildResponse(201, {
          message: 'Project created successfully',
          project: projectItem,
        });
      }

      // Project detail match: /tenants/{tenantId}/projects/{projectId}
      const projectDetailMatch = subPath.match(/^\/projects\/([^/]+)$/);
      if (projectDetailMatch) {
        const projectId = projectDetailMatch[1];

        // --- GET /tenants/{tenantId}/projects/{projectId} ---
        if (method === 'GET') {
          const result = await activeDocClient.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: {
                PK: `TENANT#${tenantId}`,
                SK: `PROJECT#${projectId}`,
              },
            })
          );

          if (!result.Item) {
            return buildResponse(404, {
              error: 'Not Found',
              message: `Project "${projectId}" not found in tenant "${tenantId}"`,
            });
          }

          return buildResponse(200, { project: result.Item });
        }

        // --- PUT /tenants/{tenantId}/projects/{projectId} ---
        if (method === 'PUT') {
          const name = body?.name?.trim();
          if (!name || name.length < 2 || name.length > 80) {
            return buildResponse(400, {
              error: 'Validation Error',
              message: 'Project name is required and must be between 2 and 80 characters',
            });
          }

          const validStatuses = ['Planning', 'Active', 'Completed', 'On Hold'];
          const status = validStatuses.includes(body?.status) ? body.status : 'Active';
          const priority = ['Low', 'Medium', 'High', 'Critical'].includes(body?.priority)
            ? body.priority
            : 'Medium';
          const description = body?.description?.trim() || '';
          const budget = typeof body?.budget === 'number' ? body.budget : Number(body?.budget) || 0;
          const now = new Date().toISOString();

          try {
            const updateResult = await activeDocClient.send(
              new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                  PK: `TENANT#${tenantId}`,
                  SK: `PROJECT#${projectId}`,
                },
                UpdateExpression:
                  'SET #name = :name, #desc = :desc, #status = :status, #priority = :priority, #budget = :budget, #updatedAt = :updatedAt',
                ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
                ExpressionAttributeNames: {
                  '#name': 'name',
                  '#desc': 'description',
                  '#status': 'status',
                  '#priority': 'priority',
                  '#budget': 'budget',
                  '#updatedAt': 'updatedAt',
                },
                ExpressionAttributeValues: {
                  ':name': name,
                  ':desc': description,
                  ':status': status,
                  ':priority': priority,
                  ':budget': budget,
                  ':updatedAt': now,
                },
                ReturnValues: 'ALL_NEW',
              })
            );

            return buildResponse(200, {
              message: 'Project updated successfully',
              project: updateResult.Attributes,
            });
          } catch (err) {
            if (err.name === 'ConditionalCheckFailedException') {
              return buildResponse(404, {
                error: 'Not Found',
                message: `Project "${projectId}" not found in tenant "${tenantId}"`,
              });
            }
            throw err;
          }
        }

        // --- DELETE /tenants/{tenantId}/projects/{projectId} ---
        if (method === 'DELETE') {
          try {
            await activeDocClient.send(
              new DeleteCommand({
                TableName: TABLE_NAME,
                Key: {
                  PK: `TENANT#${tenantId}`,
                  SK: `PROJECT#${projectId}`,
                },
                ConditionExpression: 'attribute_exists(PK) AND attribute_exists(SK)',
              })
            );

            return buildResponse(200, {
              message: `Project "${projectId}" deleted successfully from tenant "${tenantId}"`,
              projectId,
              tenantId,
            });
          } catch (err) {
            if (err.name === 'ConditionalCheckFailedException') {
              return buildResponse(404, {
                error: 'Not Found',
                message: `Project "${projectId}" not found in tenant "${tenantId}"`,
              });
            }
            throw err;
          }
        }
      }
    }

    return buildResponse(404, {
      error: 'Not Found',
      message: `Endpoint "${method} ${path}" not found`,
    });
  } catch (error) {
    console.error('Error handling request:', error);
    return buildResponse(500, {
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
    });
  }
};
