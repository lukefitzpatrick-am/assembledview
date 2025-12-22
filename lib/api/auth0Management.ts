type ManagementTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type CreatedUser = {
  user_id: string;
  email: string;
};

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

function ensureConfig() {
  REQUIRED_ENV.forEach(requireEnv);
}

function getManagementDomain(): string {
  // Use tenant (non-custom) domain for Management API (custom domains are not supported).
  return process.env.AUTH0_MGMT_DOMAIN || requireEnv('AUTH0_DOMAIN');
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
    const errorText = await response.text();
    throw new Error(`Failed to obtain Auth0 management token: ${response.status} ${errorText}`);
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
  password: string;
}): Promise<CreatedUser> {
  const token = await getManagementToken();
  const payload = {
    connection: requireEnv('AUTH0_DB_CONNECTION'),
    email: params.email,
    password: params.password,
    email_verified: true, // create as verified
    verify_email: false, // prevent Auth0 from sending verification email
    user_metadata: {
      first_name: params.firstName,
      last_name: params.lastName,
    },
    name: `${params.firstName} ${params.lastName}`,
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
    const errorText = await response.text();
    throw new Error(`Failed to create Auth0 user: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as CreatedUser;
  if (!data.user_id) {
    throw new Error('Auth0 user response missing user_id');
  }
  return data;
}

export async function createPasswordChangeTicket(params: { userId: string }): Promise<string> {
  const token = await getManagementToken();
  const payload = {
    user_id: params.userId,
    result_url: `${requireEnv('APP_BASE_URL')}/login`,
    ttl_sec: 86400,
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
    const errorText = await response.text();
    throw new Error(`Failed to create password change ticket: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { ticket?: string };
  if (!data.ticket) {
    throw new Error('Auth0 password change ticket missing ticket URL');
  }
  return data.ticket;
}



