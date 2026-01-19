type ManagementTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type CreatedUser = {
  user_id: string;
  email: string;
};

type Role = 'admin' | 'client';

export class Auth0HttpError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const REQUIRED_ENV = [
  'AUTH0_MGMT_CLIENT_ID',
  'AUTH0_MGMT_CLIENT_SECRET',
  'AUTH0_MGMT_AUDIENCE',
  'AUTH0_DB_CONNECTION',
  'APP_BASE_URL',
];

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

export function getRoleId(role: Role): string {
  const envMap: Record<Role, string | undefined> = {
    admin: process.env.AUTH0_ROLE_ADMIN_ID,
    client: process.env.AUTH0_ROLE_CLIENT_ID,
  };
  const value = envMap[role];
  if (!value) {
    throw new Error(`Missing env: AUTH0_ROLE_${role.toUpperCase()}_ID`);
  }
  return value;
}

function ensureConfig() {
  REQUIRED_ENV.forEach(requireEnv);
}

function getManagementDomain(): string {
  // Use tenant (non-custom) domain for Management API (custom domains are not supported).
  return process.env.AUTH0_MGMT_DOMAIN || requireEnv('AUTH0_DOMAIN');
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getManagementToken(): Promise<string> {
  ensureConfig();

  const body = {
    grant_type: 'client_credentials',
    client_id: process.env.AUTH0_MGMT_CLIENT_ID,
    client_secret: process.env.AUTH0_MGMT_CLIENT_SECRET,
    audience: process.env.AUTH0_MGMT_AUDIENCE,
  };

  const response = await fetch(`https://${getManagementDomain()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw new Auth0HttpError('Failed to obtain Auth0 management token', response.status, errorBody);
  }

  const json = (await response.json()) as ManagementTokenResponse;
  if (!json.access_token) {
    throw new Error('Auth0 management token response missing access_token');
  }
  return json.access_token;
}

export async function createAuth0User(params: {
  email: string;
  firstName: string;
  lastName: string;
  clientSlug?: string;
}): Promise<CreatedUser> {
  const token = await getManagementToken();
  const connection = requireEnv('AUTH0_DB_CONNECTION');
  const payload = {
    connection,
    email: params.email,
    email_verified: true, // create as verified
    verify_email: false, // prevent Auth0 from sending verification email
    given_name: params.firstName,
    family_name: params.lastName,
    name: `${params.firstName} ${params.lastName}`,
    app_metadata: params.clientSlug ? { client_slug: params.clientSlug } : undefined,
    user_metadata: {
      first_name: params.firstName,
      last_name: params.lastName,
    },
  };

  const response = await fetch(`https://${getManagementDomain()}/api/v2/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw new Auth0HttpError('Failed to create Auth0 user', response.status, errorBody);
  }

  const data = (await response.json()) as CreatedUser;
  if (!data.user_id) {
    throw new Error('Auth0 user response missing user_id');
  }
  return data;
}

export async function createPasswordChangeTicket(params: { userId: string }): Promise<string> {
  const token = await getManagementToken();
  const ttlEnv = Number(process.env.AUTH0_INVITE_TTL_SEC ?? 604800);
  const ttlSeconds = Number.isFinite(ttlEnv) && ttlEnv > 0 ? ttlEnv : 604800;
  const payload = {
    user_id: params.userId,
    result_url: `${requireEnv('APP_BASE_URL')}/login`,
    ttl_sec: ttlSeconds,
  };

  const response = await fetch(`https://${getManagementDomain()}/api/v2/tickets/password-change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw new Auth0HttpError('Failed to create password change ticket', response.status, errorBody);
  }

  const data = (await response.json()) as { ticket?: string };
  if (!data.ticket) {
    throw new Error('Auth0 password change ticket missing ticket URL');
  }
  return data.ticket;
}

export async function assignRoleToUser(userId: string, role: Role): Promise<void> {
  const token = await getManagementToken();
  const roleId = getRoleId(role);

  const response = await fetch(`https://${getManagementDomain()}/api/v2/roles/${roleId}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ users: [userId] }),
  });

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw new Auth0HttpError(`Failed to assign role ${role} to user`, response.status, errorBody);
  }
}

export async function deleteAuth0User(userId: string): Promise<void> {
  const token = await getManagementToken();

  const response = await fetch(`https://${getManagementDomain()}/api/v2/users/${userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw new Auth0HttpError('Failed to delete Auth0 user', response.status, errorBody);
  }
}

export async function updateAuth0UserMetadata(params: {
  userId: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}): Promise<void> {
  const token = await getManagementToken();

  const response = await fetch(`https://${getManagementDomain()}/api/v2/users/${params.userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      app_metadata: params.app_metadata,
      user_metadata: params.user_metadata,
    }),
  });

  if (!response.ok) {
    const errorBody = await parseResponseBody(response);
    throw new Auth0HttpError('Failed to update user metadata', response.status, errorBody);
  }
}
















