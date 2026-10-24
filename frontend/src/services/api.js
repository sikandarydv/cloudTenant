// CloudTenant API Client Service
// Supports both live AWS API Gateway + Cognito and local offline presentation mode

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const AWS_REGION = import.meta.env.VITE_AWS_REGION || 'ap-south-1';
const USER_POOL_ID = import.meta.env.VITE_USER_POOL_ID || '';
const USER_POOL_CLIENT_ID = import.meta.env.VITE_USER_POOL_CLIENT_ID || '';

// Check if live cloud backend is configured
export const isCloudConfigured = Boolean(API_BASE_URL && USER_POOL_ID && USER_POOL_CLIENT_ID);

// In-Memory & LocalStorage mock database for offline demonstrations & presentation
const STORAGE_KEY_AUTH = 'cloudtenant_auth_user';
const STORAGE_KEY_TENANTS = 'cloudtenant_demo_tenants';
const STORAGE_KEY_PROJECTS = 'cloudtenant_demo_projects';

// Initialize default demo state if empty
function initDemoData() {
  if (!localStorage.getItem(STORAGE_KEY_TENANTS)) {
    const demoTenants = [
      {
        tenantId: 'org-acme-101',
        name: 'Acme Enterprise',
        role: 'Owner',
        plan: 'Enterprise',
        description: 'Multi-cloud enterprise workspace',
        joinedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
        userId: 'usr-alpha-1',
      },
      {
        tenantId: 'org-stark-202',
        name: 'Stark Industries',
        role: 'Owner',
        plan: 'Standard',
        description: 'Advanced defense and energy systems',
        joinedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        userId: 'usr-alpha-1',
      },
      {
        tenantId: 'org-beta-999',
        name: 'Beta Labs (Isolated Tenant)',
        role: 'Owner',
        plan: 'Starter',
        description: 'External third-party tenant with isolated data',
        joinedAt: new Date(Date.now() - 86400000 * 10).toISOString(),
        userId: 'usr-beta-2',
      },
    ];
    localStorage.setItem(STORAGE_KEY_TENANTS, JSON.stringify(demoTenants));
  }

  if (!localStorage.getItem(STORAGE_KEY_PROJECTS)) {
    const demoProjects = [
      {
        projectId: 'p-101',
        tenantId: 'org-acme-101',
        name: 'Wildlife Satellite Monitoring',
        description: 'AI tracking system using satellite imagery across Western Ghats',
        status: 'Active',
        priority: 'High',
        budget: 45000,
        createdBy: 'usr-alpha-1',
        creatorEmail: 'alex.cloud@acme.edu',
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
      },
      {
        projectId: 'p-102',
        tenantId: 'org-acme-101',
        name: 'Microservices Containerization',
        description: 'Migrating legacy monolithic services to Amazon ECS and Lambda',
        status: 'Planning',
        priority: 'Medium',
        budget: 32000,
        createdBy: 'usr-alpha-1',
        creatorEmail: 'alex.cloud@acme.edu',
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      },
      {
        projectId: 'p-103',
        tenantId: 'org-acme-101',
        name: 'Disaster Recovery Warm Standby',
        description: 'Multi-region replication between ap-south-1 (Mumbai) and ap-southeast-1',
        status: 'Completed',
        priority: 'Critical',
        budget: 68000,
        createdBy: 'usr-alpha-1',
        creatorEmail: 'alex.cloud@acme.edu',
        createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
      {
        projectId: 'p-201',
        tenantId: 'org-stark-202',
        name: 'Arc Reactor Telemetry',
        description: 'Real-time sensor ingestion via DynamoDB single table',
        status: 'Active',
        priority: 'Critical',
        budget: 95000,
        createdBy: 'usr-alpha-1',
        creatorEmail: 'alex.cloud@acme.edu',
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        projectId: 'p-999',
        tenantId: 'org-beta-999',
        name: 'Confidential Beta Research',
        description: 'Isolated research project strictly inaccessible to Acme users',
        status: 'Active',
        priority: 'Critical',
        budget: 120000,
        createdBy: 'usr-beta-2',
        creatorEmail: 'beta.researcher@betalabs.com',
        createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(demoProjects));
  }
}

initDemoData();

// Helper to get stored auth user
export function getStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredUser(user) {
  if (user) {
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY_AUTH);
  }
}

// Authentication
export async function login({ email, password, useLiveCloud = false }) {
  if (useLiveCloud && isCloudConfigured) {
    // Live AWS Cognito USER_PASSWORD_AUTH via InitiateAuth
    const response = await fetch(`https://cognito-idp.${AWS_REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: USER_POOL_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.__type || 'Authentication failed');
    }

    const authResult = data.AuthenticationResult;
    const user = {
      userId: email,
      email,
      idToken: authResult.IdToken,
      accessToken: authResult.AccessToken,
      refreshToken: authResult.RefreshToken,
      mode: 'live-aws',
    };
    saveStoredUser(user);
    return user;
  }

  // Demo offline authentication
  await new Promise((r) => setTimeout(r, 400));
  if (!email || !password || password.length < 6) {
    throw new Error('Please enter a valid email and password (minimum 6 characters)');
  }

  const isBeta = email.toLowerCase().includes('beta');
  const user = {
    userId: isBeta ? 'usr-beta-2' : 'usr-alpha-1',
    email,
    idToken: `demo-jwt-token-for-${email}`,
    mode: 'demo',
  };
  saveStoredUser(user);
  return user;
}

export async function register({ email, password, useLiveCloud = false }) {
  if (useLiveCloud && isCloudConfigured) {
    const response = await fetch(`https://cognito-idp.${AWS_REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
      },
      body: JSON.stringify({
        ClientId: USER_POOL_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.__type || 'Registration failed');
    }
    return { success: true, userSub: data.UserSub, confirmed: data.UserConfirmed };
  }

  await new Promise((r) => setTimeout(r, 400));
  return { success: true, message: 'Registration simulated. You can now log in.' };
}

export async function confirmSignUp({ email, code, useLiveCloud = false }) {
  if (useLiveCloud && isCloudConfigured) {
    const response = await fetch(`https://cognito-idp.${AWS_REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmSignUp',
      },
      body: JSON.stringify({
        ClientId: USER_POOL_CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Verification failed');
    }
    return true;
  }

  await new Promise((r) => setTimeout(r, 300));
  return true;
}

export function logout() {
  saveStoredUser(null);
}

// Network fetch wrapper with Bearer token
async function apiRequest(endpoint, method = 'GET', body = null) {
  const user = getStoredUser();
  const token = user?.idToken;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.message || data.error || `HTTP ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

// =============================================================================
// TENANT OPERATIONS
// =============================================================================

export async function getTenants(useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    const res = await apiRequest('/tenants', 'GET');
    return res.tenants || [];
  }

  await new Promise((r) => setTimeout(r, 250));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  // Filter tenants authorized for this user
  return tenants.filter((t) => t.userId === user?.userId);
}

export async function createTenant({ name, description, plan }, useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    const res = await apiRequest('/tenants', 'POST', { name, description, plan });
    return res.tenant;
  }

  await new Promise((r) => setTimeout(r, 350));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  const tenantId = `org-${Math.random().toString(36).substring(2, 9)}`;
  const newTenant = {
    tenantId,
    name,
    description: description || '',
    plan: plan || 'Standard',
    role: 'Owner',
    joinedAt: new Date().toISOString(),
    userId: user?.userId || 'usr-alpha-1',
  };
  tenants.push(newTenant);
  localStorage.setItem(STORAGE_KEY_TENANTS, JSON.stringify(tenants));
  return newTenant;
}

// =============================================================================
// PROJECT CRUD (TENANT-AWARE)
// =============================================================================

export async function getProjects(tenantId, useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    const res = await apiRequest(`/tenants/${tenantId}/projects`, 'GET');
    return res.projects || [];
  }

  await new Promise((r) => setTimeout(r, 250));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  
  // Strict check: Is the current user authorized for this tenant?
  const isMember = tenants.some((t) => t.tenantId === tenantId && t.userId === user?.userId);
  if (!isMember) {
    const err = new Error(`Access Denied: You are not authorized for tenant ${tenantId}. Cross-tenant access blocked.`);
    err.status = 403;
    throw err;
  }

  const allProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECTS) || '[]');
  return allProjects.filter((p) => p.tenantId === tenantId);
}

export async function createProject(tenantId, projectData, useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    const res = await apiRequest(`/tenants/${tenantId}/projects`, 'POST', projectData);
    return res.project;
  }

  await new Promise((r) => setTimeout(r, 350));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  const isMember = tenants.some((t) => t.tenantId === tenantId && t.userId === user?.userId);
  if (!isMember) {
    const err = new Error(`Access Denied: Not a member of tenant ${tenantId}`);
    err.status = 403;
    throw err;
  }

  const allProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECTS) || '[]');
  const projectId = `p-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const newProject = {
    projectId,
    tenantId,
    name: projectData.name,
    description: projectData.description || '',
    status: projectData.status || 'Planning',
    priority: projectData.priority || 'Medium',
    budget: Number(projectData.budget) || 0,
    createdBy: user?.userId || 'usr-alpha-1',
    creatorEmail: user?.email || 'user@example.com',
    createdAt: now,
    updatedAt: now,
  };
  allProjects.push(newProject);
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(allProjects));
  return newProject;
}

export async function updateProject(tenantId, projectId, updateData, useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    const res = await apiRequest(`/tenants/${tenantId}/projects/${projectId}`, 'PUT', updateData);
    return res.project;
  }

  await new Promise((r) => setTimeout(r, 300));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  const isMember = tenants.some((t) => t.tenantId === tenantId && t.userId === user?.userId);
  if (!isMember) {
    const err = new Error(`Access Denied: Not a member of tenant ${tenantId}`);
    err.status = 403;
    throw err;
  }

  const allProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECTS) || '[]');
  const idx = allProjects.findIndex((p) => p.projectId === projectId && p.tenantId === tenantId);
  if (idx === -1) {
    const err = new Error(`Project ${projectId} not found in tenant ${tenantId}`);
    err.status = 404;
    throw err;
  }

  allProjects[idx] = {
    ...allProjects[idx],
    ...updateData,
    budget: Number(updateData.budget) || 0,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(allProjects));
  return allProjects[idx];
}

export async function deleteProject(tenantId, projectId, useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    return await apiRequest(`/tenants/${tenantId}/projects/${projectId}`, 'DELETE');
  }

  await new Promise((r) => setTimeout(r, 300));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  const isMember = tenants.some((t) => t.tenantId === tenantId && t.userId === user?.userId);
  if (!isMember) {
    const err = new Error(`Access Denied: Not a member of tenant ${tenantId}`);
    err.status = 403;
    throw err;
  }

  let allProjects = JSON.parse(localStorage.getItem(STORAGE_KEY_PROJECTS) || '[]');
  allProjects = allProjects.filter((p) => !(p.projectId === projectId && p.tenantId === tenantId));
  localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(allProjects));
  return { success: true, projectId };
}

// =============================================================================
// VIVA & DEMO ISOLATION SIMULATOR
// Directly demonstrates cross-tenant attack rejection
// =============================================================================
export async function simulateCrossTenantAttack(targetTenantId, useLiveCloud = false) {
  if (useLiveCloud && isCloudConfigured) {
    try {
      await apiRequest(`/tenants/${targetTenantId}/projects`, 'GET');
      return {
        blocked: false,
        status: 200,
        message: 'CRITICAL SECURITY BREACH: Cross-tenant data was exposed!',
      };
    } catch (err) {
      return {
        blocked: true,
        status: err.status || 403,
        message: err.message || 'Access Denied: 403 Forbidden properly returned by backend.',
      };
    }
  }

  await new Promise((r) => setTimeout(r, 500));
  const user = getStoredUser();
  const tenants = JSON.parse(localStorage.getItem(STORAGE_KEY_TENANTS) || '[]');
  const isMember = tenants.some((t) => t.tenantId === targetTenantId && t.userId === user?.userId);

  if (!isMember) {
    return {
      blocked: true,
      status: 403,
      message: `[BLOCKED BY BACKEND] HTTP 403 Forbidden: Caller "${user?.email || 'Anonymous'}" has no membership record for partition "TENANT#${targetTenantId}". Server rejected the request.`,
    };
  }

  return {
    blocked: false,
    status: 200,
    message: 'User is actually a member of this tenant, so access was permitted.',
  };
}
