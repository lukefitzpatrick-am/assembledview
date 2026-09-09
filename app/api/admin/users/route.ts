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
import {
  buildClientRoleAppMetadata,
  listedUserClientSlugs,
  resolveInviteClientSlugs,
} from '@/lib/auth/inviteClientSlugs';
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
  const clientSlugs = listedUserClientSlugs(appMetadata);

  return {
    user_id: user.user_id,
    email: user.email ?? null,
    name: user.name ?? null,
    // DENORMALISED COPY of the Auth0 role assignment (written into app_metadata on
    // create/update). Can drift from the real Auth0 Authorization Core / RBAC role —
    // do not present this as authoritative without also reading assigned roles.
    role: deriveRoleFromAppMetadata(appMetadata),
    clientSlug: clientSlugs[0] ?? null,
    clientSlugs,
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

const clientSlugField = z
  .string()
  .trim()
  .refine((value) => !/^\d+$/.test(value), {
    message: 'Client slug must be a slug (e.g. "bic"), not a numeric ID',
  });

const basePayloadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['admin', 'client']).default('client'),
  clientSlug: clientSlugField.optional(),
  clientSlugs: z.array(clientSlugField).optional(),
  mbaNumbers: z.array(z.string().trim()).optional(),
  primaryMbaNumber: z.string().trim().optional(),
});

function refineClientSlugs(
  data: { role: 'admin' | 'client'; clientSlug?: string; clientSlugs?: string[] },
  ctx: z.RefinementCtx,
) {
  if (data.role !== 'client') return;
  const resolved = resolveInviteClientSlugs(data);
  if (resolved.ok) return;
  if (resolved.reason === 'numeric') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Client slug must be a slug (e.g. "bic"), not a numeric ID',
      path: ['clientSlugs'],
    });
    return;
  }
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Client slug is required for client role',
    path: ['clientSlugs'],
  });
}

const payloadSchema = basePayloadSchema.superRefine(refineClientSlugs);

const updateSchema = basePayloadSchema
  .extend({
    userId: z.string().trim().min(1, 'User ID is required'),
  })
  .superRefine(refineClientSlugs);

function ensureRoleEnv(role: 'admin' | 'client') {
  // Role env vars must be the Auth0 Role ID (starts with rol_), not the role name.
  const key = role === 'client' ? 'AUTH0_ROLE_CLIENT_ID' : 'AUTH0_ROLE_ADMIN_ID';
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

function lowercaseMbaNumbers(values: string[] | undefined): string[] {
  if (!values) return [];
  return values.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

async function requireKnownClientSlugs(
  slugs: string[],
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const result = await readClientsList();
  if (result.status < 200 || result.status >= 300) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to load clients' }, { status: 500 }),
    };
  }
  const known = new Set(
    parseXanoListPayload(result.body).flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const slug = String((row as Record<string, unknown>).slug ?? '')
        .trim()
        .toLowerCase();
      return slug ? [slug] : [];
    }),
  );
  for (const slug of slugs) {
    if (!known.has(slug)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'unknown client slug' }, { status: 400 }),
      };
    }
  }
  return { ok: true };
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

    const { firstName, lastName, email, password, role, mbaNumbers, primaryMbaNumber } = parsed.data;
    const normalizedMbaNumbers = lowercaseMbaNumbers(mbaNumbers);

    // REVIEW: policy lands in USR-4 — SUPERADMIN_EMAIL_ALLOWLIST fail-closed.
    const grantDenied = assertCanGrantAdminRole(sessionResult.session, role);
    if (grantDenied) return grantDenied;

    let clientSlugs: string[] = [];
    if (role === 'client') {
      const resolved = resolveInviteClientSlugs(parsed.data);
      if (!resolved.ok) {
        return NextResponse.json(
          { error: 'Client slug is required for client role' },
          { status: 400 },
        );
      }
      const known = await requireKnownClientSlugs(resolved.slugs);
      if (!known.ok) return known.response;
      clientSlugs = resolved.slugs;
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
        clientSlug: clientSlugs[0],
        clientSlugs: role === 'client' ? clientSlugs : undefined,
        mbaNumbers: role === 'client' ? normalizedMbaNumbers : undefined,
        primaryMbaNumber: role === 'client' ? primaryMbaNumber : undefined,
      });
      createdUserId = createdUser.user_id;

      currentStep = 'assign_role';
      await assignRoleToUser(createdUser.user_id, role);

      currentStep = 'set_metadata';
      const appMetadata: Record<string, unknown> =
        role === 'client'
          ? buildClientRoleAppMetadata({
              slugs: clientSlugs,
              mbaNumbers: normalizedMbaNumbers,
              primaryMbaNumber,
            })
          : { role };
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

    const { role, mbaNumbers, primaryMbaNumber, userId } = parsed.data;
    const normalizedMbaNumbers = lowercaseMbaNumbers(mbaNumbers);

    // REVIEW: policy lands in USR-4 — SUPERADMIN_EMAIL_ALLOWLIST fail-closed.
    const grantDenied = assertCanGrantAdminRole(sessionResult.session, role);
    if (grantDenied) return grantDenied;

    let clientSlugs: string[] = [];
    if (role === 'client') {
      const resolved = resolveInviteClientSlugs(parsed.data);
      if (!resolved.ok) {
        return NextResponse.json(
          { error: 'Client slug is required for client role' },
          { status: 400 },
        );
      }
      const known = await requireKnownClientSlugs(resolved.slugs);
      if (!known.ok) return known.response;
      clientSlugs = resolved.slugs;
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
      Object.assign(
        appMetadata,
        buildClientRoleAppMetadata({
          slugs: clientSlugs,
          mbaNumbers: normalizedMbaNumbers,
          primaryMbaNumber,
        }),
      );
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






















