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

type Auth0User = {
  user_id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

/** Wider projection for the admin users list (not used by searchAuth0Users). */
export type Auth0ListedUser = {
  user_id: string;
  email?: string;
  name?: string;
  last_login?: string;
  logins_count?: number;
  blocked?: boolean;
  app_metadata?: Record<string, unknown>;
};

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

export async function searchAuth0Users(params: {
  q: string;
  perPage?: number;
  fields?: string[];
}): Promise<Auth0User[]> {
  const token = await getManagementToken();
  const perPage = Number(params.perPage ?? 100);
  const safePerPage = Number.isFinite(perPage) && perPage > 0 && perPage <= 100 ? perPage : 100;
  const fields = params.fields?.length ? params.fields.join(',') : 'user_id,email,app_metadata';

  const results: Auth0User[] = [];
  let page = 0;

  while (true) {
    const url = new URL(`https://${getManagementDomain()}/api/v2/users`);
    url.searchParams.set('search_engine', 'v3');
    url.searchParams.set('q', params.q);
    url.searchParams.set('per_page', String(safePerPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('include_totals', 'false');
    url.searchParams.set('fields', fields);
    url.searchParams.set('include_fields', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = await parseResponseBody(response);
      throw new Auth0HttpError('Failed to search Auth0 users', response.status, errorBody);
    }

    const pageData = (await response.json()) as unknown;
    const users = Array.isArray(pageData) ? (pageData as Auth0User[]) : [];
    results.push(...users);

    if (users.length < safePerPage) break;
    page += 1;
  }

  return results;
}

/** Default fields for admin list — wider than searchAuth0Users (refresh-slug). */
const LIST_ALL_AUTH0_USER_FIELDS = [
  'user_id',
  'email',
  'name',
  'last_login',
  'logins_count',
  'blocked',
  'app_metadata',
] as const;

/**
 * In-memory TTL cache for full Auth0 user lists (keyed by Lucene query).
 * Auth0 Management API is ~2 req/s on typical tenants; listAllAuth0Users walks
 * every page with no backoff, so a short TTL coalesces admin UI pagination /
 * remounts. 60s balances freshness after invite/edit against multi-page storms.
 */
const AUTH0_USERS_LIST_TTL_MS = 60_000;

type Auth0UsersListCacheEntry = {
  users: Auth0ListedUser[];
  fetchedAt: number;
};

const auth0UsersListCache = new Map<string, Auth0UsersListCacheEntry>();
const auth0UsersListInFlight = new Map<string, Promise<Auth0ListedUser[]>>();

function auth0UsersListCacheKey(query?: string): string {
  return String(query ?? '').trim();
}

/** Drop cached Auth0 user lists (e.g. after admin create/update). */
export function invalidateAuth0UsersListCache(): void {
  auth0UsersListCache.clear();
  auth0UsersListInFlight.clear();
}

async function fetchAllAuth0UsersUncached(query?: string): Promise<Auth0ListedUser[]> {
  const token = await getManagementToken();
  const safePerPage = 100;
  const fields = LIST_ALL_AUTH0_USER_FIELDS.join(',');
  const q = String(query ?? '').trim();

  const results: Auth0ListedUser[] = [];
  let page = 0;

  while (true) {
    const url = new URL(`https://${getManagementDomain()}/api/v2/users`);
    url.searchParams.set('search_engine', 'v3');
    if (q) url.searchParams.set('q', q);
    url.searchParams.set('per_page', String(safePerPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('include_totals', 'false');
    url.searchParams.set('fields', fields);
    url.searchParams.set('include_fields', 'true');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = await parseResponseBody(response);
      throw new Auth0HttpError('Failed to list Auth0 users', response.status, errorBody);
    }

    const pageData = (await response.json()) as unknown;
    const users = Array.isArray(pageData) ? (pageData as Auth0ListedUser[]) : [];
    results.push(...users);

    if (users.length < safePerPage) break;
    page += 1;
  }

  return results;
}

async function getCachedAllAuth0Users(query?: string): Promise<Auth0ListedUser[]> {
  const key = auth0UsersListCacheKey(query);
  const now = Date.now();
  const hit = auth0UsersListCache.get(key);
  if (hit && now - hit.fetchedAt < AUTH0_USERS_LIST_TTL_MS) {
    return hit.users;
  }

  const existing = auth0UsersListInFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const users = await fetchAllAuth0UsersUncached(query || undefined);
      auth0UsersListCache.set(key, { users, fetchedAt: Date.now() });
      return users;
    } finally {
      auth0UsersListInFlight.delete(key);
    }
  })();

  auth0UsersListInFlight.set(key, promise);
  return promise;
}

/**
 * Paginated Auth0 user list for the admin users page.
 * Fetches (and caches) the full matching set, then slices locally so UI page
 * changes do not re-walk Management API pages within the TTL.
 */
export async function listAllAuth0Users(params: {
  page?: number;
  perPage?: number;
  query?: string;
}): Promise<{ users: Auth0ListedUser[]; total: number; page: number }> {
  const pageRaw = Number(params.page ?? 0);
  const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const perPageRaw = Number(params.perPage ?? 50);
  const perPage =
    Number.isFinite(perPageRaw) && perPageRaw > 0 && perPageRaw <= 100
      ? Math.floor(perPageRaw)
      : 50;

  const all = await getCachedAllAuth0Users(params.query);
  const total = all.length;
  const start = page * perPage;
  const users = all.slice(start, start + perPage);
  return { users, total, page };
}

export async function listAuth0UsersByClientSlug(clientSlug: string): Promise<Auth0User[]> {
  const normalized = String(clientSlug ?? '').trim().toLowerCase();
  if (!normalized) return [];
  // Auth0 search syntax: app_metadata.client_slug:"value"
  return searchAuth0Users({ q: `app_metadata.client_slug:"${normalized}"` });
}

export async function createAuth0User(params: {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  clientSlug?: string;
  mbaNumbers?: string[];
  primaryMbaNumber?: string;
}): Promise<CreatedUser> {
  const token = await getManagementToken();
  const connection = requireEnv('AUTH0_DB_CONNECTION');
  
  // Build app_metadata object
  const appMetadata: Record<string, unknown> = {};
  if (params.clientSlug) {
    appMetadata.client_slug = params.clientSlug;
  }
  if (params.mbaNumbers && Array.isArray(params.mbaNumbers) && params.mbaNumbers.length > 0) {
    appMetadata.mba_numbers = params.mbaNumbers.filter(Boolean);
  }
  if (params.primaryMbaNumber) {
    appMetadata.primary_mba_number = params.primaryMbaNumber;
  }
  
  const payload = {
    connection,
    email: params.email,
    password: params.password,
    email_verified: true, // create as verified
    verify_email: false, // prevent Auth0 from sending verification email
    given_name: params.firstName,
    family_name: params.lastName,
    name: `${params.firstName} ${params.lastName}`,
    app_metadata: Object.keys(appMetadata).length > 0 ? appMetadata : undefined,
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

export async function getAuth0UserById(userId: string): Promise<{
  user_id?: string
  email?: string
  name?: string
  given_name?: string
  family_name?: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
} | null> {
  try {
    const token = await getManagementToken();
    const response = await fetch(
      `https://${getManagementDomain()}/api/v2/users/${encodeURIComponent(userId)}?fields=user_id,email,name,given_name,family_name,app_metadata,user_metadata`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
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
















