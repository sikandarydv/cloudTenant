import { expect } from 'chai';
import { lambdaHandler, setDocClient } from '../../app.mjs';
import { MockDynamoDbClient } from './mock-db.mjs';

describe('CloudTenant API & Multi-Tenant Isolation Tests', () => {
  let mockDb;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    mockDb = new MockDynamoDbClient();
    setDocClient(mockDb);
  });

  // Helper to simulate an API Gateway event with verified Cognito claims
  function createCognitoEvent(method, path, body = null, claims = { sub: 'user-alpha', email: 'alpha@example.com' }) {
    return {
      httpMethod: method,
      path,
      body: body ? JSON.stringify(body) : null,
      requestContext: {
        authorizer: claims ? { claims } : undefined,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  describe('1. Health Check & Public Endpoints', () => {
    it('returns 200 OK on /health without authentication', async () => {
      const event = { httpMethod: 'GET', path: '/health' };
      const res = await lambdaHandler(event);
      expect(res.statusCode).to.equal(200);
      const data = JSON.parse(res.body);
      expect(data.status).to.equal('healthy');
      expect(data.service).to.include('CloudTenant');
    });

    it('handles OPTIONS preflight with 200 and CORS headers', async () => {
      const event = { httpMethod: 'OPTIONS', path: '/tenants' };
      const res = await lambdaHandler(event);
      expect(res.statusCode).to.equal(200);
      expect(res.headers['Access-Control-Allow-Origin']).to.equal('*');
    });
  });

  describe('2. Authentication & Authorization Enforcement', () => {
    it('rejects unauthenticated requests without Cognito claims with 401 Unauthorized', async () => {
      const event = { httpMethod: 'GET', path: '/tenants' };
      const res = await lambdaHandler(event);
      expect(res.statusCode).to.equal(401);
      const data = JSON.parse(res.body);
      expect(data.error).to.equal('Unauthorized');
    });
  });

  describe('3. Tenant Creation & Listing', () => {
    it('allows an authenticated user to create a tenant and become Owner', async () => {
      const event = createCognitoEvent('POST', '/tenants', {
        name: 'Acme Corporation',
        description: 'Primary tenant for Acme',
      });

      const res = await lambdaHandler(event);
      expect(res.statusCode).to.equal(201);
      const data = JSON.parse(res.body);
      expect(data.tenant.name).to.equal('Acme Corporation');
      expect(data.tenant.role).to.equal('Owner');
      expect(data.tenant.tenantId).to.match(/^org-/);
    });

    it('rejects tenant creation with empty name', async () => {
      const event = createCognitoEvent('POST', '/tenants', { name: ' ' });
      const res = await lambdaHandler(event);
      expect(res.statusCode).to.equal(400);
    });

    it('lists only tenants that the authenticated user belongs to', async () => {
      // User Alpha creates Tenant Alpha
      const createAlpha = createCognitoEvent('POST', '/tenants', { name: 'Alpha Org' }, { sub: 'user-alpha', email: 'alpha@example.com' });
      await lambdaHandler(createAlpha);

      // User Beta creates Tenant Beta
      const createBeta = createCognitoEvent('POST', '/tenants', { name: 'Beta Org' }, { sub: 'user-beta', email: 'beta@example.com' });
      await lambdaHandler(createBeta);

      // Query as User Alpha
      const listAlpha = createCognitoEvent('GET', '/tenants', null, { sub: 'user-alpha', email: 'alpha@example.com' });
      const resAlpha = await lambdaHandler(listAlpha);
      const dataAlpha = JSON.parse(resAlpha.body);
      expect(dataAlpha.tenants).to.have.lengthOf(1);
      expect(dataAlpha.tenants[0].name).to.equal('Alpha Org');

      // Query as User Beta
      const listBeta = createCognitoEvent('GET', '/tenants', null, { sub: 'user-beta', email: 'beta@example.com' });
      const resBeta = await lambdaHandler(listBeta);
      const dataBeta = JSON.parse(resBeta.body);
      expect(dataBeta.tenants).to.have.lengthOf(1);
      expect(dataBeta.tenants[0].name).to.equal('Beta Org');
    });
  });

  describe('4. Project CRUD within Authorized Tenant', () => {
    let tenantId;

    beforeEach(async () => {
      const createRes = await lambdaHandler(
        createCognitoEvent('POST', '/tenants', { name: 'Tech Innovations' }, { sub: 'user-owner', email: 'owner@tech.com' })
      );
      tenantId = JSON.parse(createRes.body).tenant.tenantId;
    });

    it('creates, reads, updates, and deletes projects within authorized tenant', async () => {
      const user = { sub: 'user-owner', email: 'owner@tech.com' };

      // 1. Create Project
      const createProj = await lambdaHandler(
        createCognitoEvent('POST', `/tenants/${tenantId}/projects`, {
          name: 'Cloud Migration',
          description: 'Migrating legacy apps to AWS',
          status: 'Active',
          priority: 'High',
          budget: 50000,
        }, user)
      );
      expect(createProj.statusCode).to.equal(201);
      const proj = JSON.parse(createProj.body).project;
      const projectId = proj.projectId;
      expect(proj.name).to.equal('Cloud Migration');
      expect(proj.tenantId).to.equal(tenantId);

      // 2. List Projects
      const listProj = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantId}/projects`, null, user)
      );
      expect(listProj.statusCode).to.equal(200);
      const listData = JSON.parse(listProj.body);
      expect(listData.projects).to.have.lengthOf(1);
      expect(listData.projects[0].projectId).to.equal(projectId);

      // 3. Get Project Detail
      const getProj = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantId}/projects/${projectId}`, null, user)
      );
      expect(getProj.statusCode).to.equal(200);
      expect(JSON.parse(getProj.body).project.name).to.equal('Cloud Migration');

      // 4. Update Project
      const updateProj = await lambdaHandler(
        createCognitoEvent('PUT', `/tenants/${tenantId}/projects/${projectId}`, {
          name: 'Cloud Migration Phase 2',
          status: 'Completed',
          priority: 'Critical',
          budget: 75000,
        }, user)
      );
      expect(updateProj.statusCode).to.equal(200);
      expect(JSON.parse(updateProj.body).project.name).to.equal('Cloud Migration Phase 2');
      expect(JSON.parse(updateProj.body).project.status).to.equal('Completed');

      // 5. Delete Project
      const deleteProj = await lambdaHandler(
        createCognitoEvent('DELETE', `/tenants/${tenantId}/projects/${projectId}`, null, user)
      );
      expect(deleteProj.statusCode).to.equal(200);

      // 6. Verify Deletion
      const getDeleted = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantId}/projects/${projectId}`, null, user)
      );
      expect(getDeleted.statusCode).to.equal(404);
    });
  });

  describe('5. STRICT MULTI-TENANT ISOLATION (Cross-Tenant Attack Prevention)', () => {
    let tenantAlphaId;
    let tenantBetaId;
    let projectAlphaId;

    const userAlpha = { sub: 'user-alpha-100', email: 'alpha@org-a.com' };
    const userBetaAttacker = { sub: 'user-beta-200', email: 'attacker@org-b.com' };

    beforeEach(async () => {
      // Setup Tenant A and a confidential project for User Alpha
      const tA = await lambdaHandler(
        createCognitoEvent('POST', '/tenants', { name: 'Tenant Alpha (Confidential)' }, userAlpha)
      );
      tenantAlphaId = JSON.parse(tA.body).tenant.tenantId;

      const pA = await lambdaHandler(
        createCognitoEvent('POST', `/tenants/${tenantAlphaId}/projects`, {
          name: 'Alpha Secret Roadmap',
          description: 'Highly confidential corporate strategy',
          status: 'Active',
        }, userAlpha)
      );
      projectAlphaId = JSON.parse(pA.body).project.projectId;

      // Setup Tenant B for User Beta
      const tB = await lambdaHandler(
        createCognitoEvent('POST', '/tenants', { name: 'Tenant Beta' }, userBetaAttacker)
      );
      tenantBetaId = JSON.parse(tB.body).tenant.tenantId;
    });

    it('DENIES cross-tenant project list attempt with 403 Forbidden', async () => {
      // User Beta attempts to list Tenant Alpha's projects
      const res = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantAlphaId}/projects`, null, userBetaAttacker)
      );

      expect(res.statusCode).to.equal(403);
      const data = JSON.parse(res.body);
      expect(data.error).to.equal('Forbidden');
      expect(data.message).to.include('Access Denied');
    });

    it('DENIES cross-tenant single project read with 403 Forbidden', async () => {
      // User Beta attempts to read Tenant Alpha's specific project
      const res = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantAlphaId}/projects/${projectAlphaId}`, null, userBetaAttacker)
      );

      expect(res.statusCode).to.equal(403);
      const data = JSON.parse(res.body);
      expect(data.error).to.equal('Forbidden');
    });

    it('DENIES cross-tenant project creation attempt with 403 Forbidden', async () => {
      // User Beta attempts to inject a project into Tenant Alpha
      const res = await lambdaHandler(
        createCognitoEvent('POST', `/tenants/${tenantAlphaId}/projects`, {
          name: 'Malicious Injected Project',
        }, userBetaAttacker)
      );

      expect(res.statusCode).to.equal(403);
      const data = JSON.parse(res.body);
      expect(data.error).to.equal('Forbidden');
    });

    it('DENIES cross-tenant project modification with 403 Forbidden', async () => {
      // User Beta attempts to tamper with Tenant Alpha's project
      const res = await lambdaHandler(
        createCognitoEvent('PUT', `/tenants/${tenantAlphaId}/projects/${projectAlphaId}`, {
          name: 'Tampered Project Title',
          status: 'On Hold',
        }, userBetaAttacker)
      );

      expect(res.statusCode).to.equal(403);

      // Verify Tenant Alpha's project is completely untouched
      const verifyRes = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantAlphaId}/projects/${projectAlphaId}`, null, userAlpha)
      );
      expect(JSON.parse(verifyRes.body).project.name).to.equal('Alpha Secret Roadmap');
    });

    it('DENIES cross-tenant project deletion with 403 Forbidden', async () => {
      // User Beta attempts to delete Tenant Alpha's project
      const res = await lambdaHandler(
        createCognitoEvent('DELETE', `/tenants/${tenantAlphaId}/projects/${projectAlphaId}`, null, userBetaAttacker)
      );

      expect(res.statusCode).to.equal(403);

      // Verify project is still intact
      const verifyRes = await lambdaHandler(
        createCognitoEvent('GET', `/tenants/${tenantAlphaId}/projects/${projectAlphaId}`, null, userAlpha)
      );
      expect(verifyRes.statusCode).to.equal(200);
      expect(JSON.parse(verifyRes.body).project.name).to.equal('Alpha Secret Roadmap');
    });

    it('DENIES cross-tenant member addition with 403 Forbidden', async () => {
      // User Beta attempts to add themselves to Tenant Alpha
      const res = await lambdaHandler(
        createCognitoEvent('POST', `/tenants/${tenantAlphaId}/members`, {
          userId: userBetaAttacker.sub,
          email: userBetaAttacker.email,
          role: 'Admin',
        }, userBetaAttacker)
      );

      expect(res.statusCode).to.equal(403);
    });
  });
});
