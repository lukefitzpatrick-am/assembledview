import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assignRoleToUser,
  createAuth0User,
  createPasswordChangeTicket,
  deleteAuth0User,
  invalidateAuth0UsersListCache,
  listAllAuth0Users,
  updateAuth0UserMetadata,
  Auth0HttpError,
  type Auth0ListedUser,
} from '@/lib/api/auth0Management';
import { parseXanoListPayload } from '@/lib/api/xano';
import { assertCanGrantAdminRole } from '@/lib/auth/canGrantAdminRole';
import { sendInviteEmail } from '@/lib/email/inviteSender';
import { readClientsList } from '@/lib/data/readClients';
import { requireAdmin } from '@/lib/requireRole';

function deriveRoleFromAppMetadata(appMetadata: Record<string, unknown> | undefined): string | null {
  const raw = appMetadata?.role;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

function mapListedUser(user: Auth0ListedUser) {
  const appMetadata =
    user.app_metadata && typeof user.app_metadata === 'object'
      ? (user.app_metadata as Record<string, unknown>)
      : undefined;
  const clientSlugRaw = appMetadata?.client_slug;
  const clientSlug =
    typeof clientSlugRaw === 'string' && clientSlugRaw.trim()
      ? clientSlugRaw.trim().toLowerCase()
      : null;

  return {
    user_id: user.user_id,
    email: user.email ?? null,
    name: user.name ?? null,
    // DENORMALISED COPY of the Auth0 role assignment (written into app_metadata on
    // create/update). Can drift from the real Auth0 Authorization Core / RBAC role —
    // do not present this as authoritative without also reading assigned roles.
    role: deriveRoleFromAppMetadata(appMetadata),
    clientSlug,
    lastLogin: user.last_login ?? null,
    blocked: Boolean(user.blocked),
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await requireAdmin(request);
    if ('response' in sessionResult) return sessionResult.response;

    const url = new URL(request.url);
    const pageRaw = Number(url.searchParams.get('page') ?? '0');
    const perPageRaw = Number(url.searchParams.get('perPage') ?? '50');
    const query = url.searchParams.get('query')?.trim() || undefined;

    const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
    const perPage =
      Number.isFinite(perPageRaw) && perPageRaw > 0 && perPageRaw <= 100
        ? Math.floor(perPageRaw)
        : 50;

    const listed = await listAllAuth0Users({ page, perPage, query });
    return NextResponse.json({
      users: listed.users.map(mapListedUser),
      total: listed.total,
      page: listed.page,
    });
  } catch (error) {
    console.error('Admin user list failed', error);
    if (error instanceof Auth0HttpError) {
      return NextResponse.json(
        { error: 'auth0_list_failed', details: error.body, status: error.status },
        { status: 400 },
      );
    }
    const message =
      error instanceof Error ? error.message : 'Failed to list users. Check server logs for details.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const basePayloadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['admin', 'client']).default('client'),
  clientSlug: z
    .string()
    .trim()
    .optional()
    .refine((value) => value === undefined || !/^\d+$/.test(value), {
      message: 'Client slug must be a slug (e.g. "bic"), not a numeric ID',
    }),
  mbaNumbers: z.array(z.string().trim()).optional(),
  primaryMbaNumber: z.string().trim().optional(),
});

const enforceClientSlug = (data: z.infer<typeof basePayloadSchema>) =>
  data.role === 'client' ? Boolean(data.clientSlug) : true;

const payloadSchema = basePayloadSchema.refine(
  enforceClientSlug,
  'Client slug is required for client role',
);

const updateSchema = basePayloadSchema
  .extend({
    userId: z.string().trim().min(1, 'User ID is required'),
  })
  .refine(
    enforceClientSlug,
    'Client slug is required for client role',
  );

function ensureRoleEnv(role: 'admin' | 'client') {
  // Role env vars must be the Auth0 Role ID (starts with rol_), not the role name.
  const key = role === 'client' ? 'AUTH0_ROLE_CLIENT_ID' : 'AUTH0_ROLE_ADMIN_ID';
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

function lowercaseMbaNumbers(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const next = values.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return next.length > 0 ? next : undefined;
}

async function requireKnownClientSlug(
  slug: string,
): Promise<{ ok: true; slug: string } | { ok: false; response: NextResponse }> {
  const normalized = slug.trim().toLowerCase();
  const result = await readClientsList();
  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to load clients' }, { status: 500 }),
    };
  }
  const found = parseXanoListPayload(result.body).some((row) => {
    if (!row || typeof row !== 'object') return false;
    return (
      String((row as Record<string, unknown>).slug ?? '').trim().toLowerCase() === normalized
    );
  });
  if (!found) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'unknown client slug' }, { status: 400 }),
    };
  }
  return { ok: true, slug: normalized };
}

const ADMIN_CLIENT_CLAIM_NULLS = {
  client_slug: null,
  client_slugs: null,
  mba_numbers: null,
  primary_mba_number: null,
} as const;

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await requireAdmin(request);
    if ('response' in sessionResult) return sessionResult.response;

    const json = await request.json();
    const parsed = payloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, email, password, role, clientSlug, mbaNumbers, primaryMbaNumber } = parsed.data;
    const normalizedMbaNumbers = lowercaseMbaNumbers(mbaNumbers);

    // REVIEW: policy lands in USR-4 — SUPERADMIN_EMAIL_ALLOWLIST fail-closed.
    const grantDenied = assertCanGrantAdminRole(sessionResult.session, role);
    if (grantDenied) return grantDenied;

    let normalizedClientSlug: string | undefined;
    if (role === 'client' && clientSlug) {
      const known = await requireKnownClientSlug(clientSlug);
      if (!known.ok) return known.response;
      normalizedClientSlug = known.slug;
    }

    // Fail fast before touching Auth0.
    ensureRoleEnv(role);

    let createdUserId: string | null = null;
    let currentStep:
      | 'pre_create'
      | 'create_user'
      | 'assign_role'
      | 'set_metadata'
      | 'create_ticket'
      | 'send_invite' = 'pre_create';

    try {
      currentStep = 'create_user';
      const createdUser = await createAuth0User({
        email,
        firstName,
        lastName,
        password,
        clientSlug: normalizedClientSlug,
        mbaNumbers: role === 'client' ? normalizedMbaNumbers : undefined,
        primaryMbaNumber: role === 'client' ? primaryMbaNumber : undefined,
      });
      createdUserId = createdUser.user_id;

      currentStep = 'assign_role';
      await assignRoleToUser(createdUser.user_id, role);

      currentStep = 'set_metadata';
      // Build app_metadata with role and client info
      const appMetadata: Record<string, unknown> = { role };
      if (role === 'client') {
        if (normalizedClientSlug) appMetadata.client_slug = normalizedClientSlug;
        if (normalizedMbaNumbers && normalizedMbaNumbers.length > 0) {
          appMetadata.mba_numbers = normalizedMbaNumbers;
        }
        if (primaryMbaNumber) {
          appMetadata.primary_mba_number = primaryMbaNumber;
        }
      }
      await updateAuth0UserMetadata({
        userId: createdUser.user_id,
        app_metadata: appMetadata,
      });

      currentStep = 'create_ticket';
      const ticketUrl = await createPasswordChangeTicket({ userId: createdUser.user_id });

      currentStep = 'send_invite';
      await sendInviteEmail({
        to: email,
        firstName,
        lastName,
        ticketUrl,
      });

      invalidateAuth0UsersListCache();
      return NextResponse.json({ ok: true, userId: createdUser.user_id }, { status: 201 });
    } catch (error) {
      console.error(`[admin-user-create] step=${currentStep} failed`, error);
      const auth0ErrorCodeMap: Record<
        typeof currentStep,
        'auth0_create_failed' | 'auth0_assign_failed' | 'auth0_metadata_failed' | 'auth0_ticket_failed'
      > = {
        pre_create: 'auth0_create_failed',
        create_user: 'auth0_create_failed',
        assign_role: 'auth0_assign_failed',
        set_metadata: 'auth0_metadata_failed',
        create_ticket: 'auth0_ticket_failed',
        send_invite: 'auth0_ticket_failed',
      };

      if (currentStep === 'assign_role' && createdUserId) {
        try {
          await deleteAuth0User(createdUserId);
        } catch (cleanupError) {
          console.error('[admin-user-create] rollback delete failed', cleanupError);
        }
      }

      if (error instanceof Auth0HttpError) {
        const code = auth0ErrorCodeMap[currentStep] ?? 'auth0_create_failed';
        console.error('[admin-user-create] auth0 error details', {
          step: currentStep,
          status: error.status,
          body: error.body,
        });
        return NextResponse.json(
          { error: code, details: error.body, status: error.status },
          { status: 400 },
        );
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create user. Check server logs for details.';
      return NextResponse.json(
        { error: `Failed at step ${currentStep}: ${message}` },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('Admin user creation failed', error);
    const message = error instanceof Error ? error.message : 'Failed to create user. Check server logs for details.';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await requireAdmin(request);
    if ('response' in sessionResult) return sessionResult.response;

    const json = await request.json();
    const parsed = updateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, email, role, clientSlug, mbaNumbers, primaryMbaNumber, userId } = parsed.data;
    const normalizedMbaNumbers = lowercaseMbaNumbers(mbaNumbers);

    // REVIEW: policy lands in USR-4 — SUPERADMIN_EMAIL_ALLOWLIST fail-closed.
    const grantDenied = assertCanGrantAdminRole(sessionResult.session, role);
    if (grantDenied) return grantDenied;

    let normalizedClientSlug: string | undefined;
    if (role === 'client' && clientSlug) {
      const known = await requireKnownClientSlug(clientSlug);
      if (!known.ok) return known.response;
      normalizedClientSlug = known.slug;
    }

    if (role) {
      await assignRoleToUser(userId, role);
    }

    // Auth0 PATCH app_metadata is a first-level merge — omitted keys stay.
    // Promoting to admin must send explicit nulls or stale client claims survive
    // (gate-review 2026-08-04 §2).
    const appMetadata: Record<string, unknown> = { role };
    if (role === 'admin') {
      Object.assign(appMetadata, ADMIN_CLIENT_CLAIM_NULLS);
    } else if (role === 'client') {
      if (normalizedClientSlug) appMetadata.client_slug = normalizedClientSlug;
      if (normalizedMbaNumbers && normalizedMbaNumbers.length > 0) {
        appMetadata.mba_numbers = normalizedMbaNumbers;
      }
      if (primaryMbaNumber) {
        appMetadata.primary_mba_number = primaryMbaNumber;
      }
    }

    await updateAuth0UserMetadata({
      userId,
      app_metadata: appMetadata,
    });

    invalidateAuth0UsersListCache();
    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    console.error('Admin user update failed', error);
    const message = error instanceof Error ? error.message : 'Failed to update user. Check server logs for details.';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}






















