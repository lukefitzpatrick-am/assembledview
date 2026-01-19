import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assignRoleToUser,
  createAuth0User,
  createPasswordChangeTicket,
  deleteAuth0User,
  updateAuth0UserMetadata,
  Auth0HttpError,
} from '@/lib/api/auth0Management';
import { sendInviteEmail } from '@/lib/email/inviteSender';
import { requireAdmin } from '@/lib/requireRole';

const basePayloadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required'),
  role: z.enum(['admin', 'client']).default('client'),
  clientSlug: z.string().trim().optional(),
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

const ADMIN_ALLOWLIST = (process.env.ADMIN_EMAIL_ALLOWLIST || '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

function ensureRoleEnv(role: 'admin' | 'client') {
  // Role env vars must be the Auth0 Role ID (starts with rol_), not the role name.
  const key = role === 'client' ? 'AUTH0_ROLE_CLIENT_ID' : 'AUTH0_ROLE_ADMIN_ID';
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await requireAdmin(request, { allowEmails: ADMIN_ALLOWLIST });
    if ('response' in sessionResult) return sessionResult.response;
    const userEmail = sessionResult.session?.user?.email;

    const json = await request.json();
    const parsed = payloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, email, role, clientSlug } = parsed.data;

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
        clientSlug: role === 'client' ? clientSlug : undefined,
      });
      createdUserId = createdUser.user_id;

      currentStep = 'assign_role';
      await assignRoleToUser(createdUser.user_id, role);

      currentStep = 'set_metadata';
      await updateAuth0UserMetadata({
        userId: createdUser.user_id,
        app_metadata: { role, client_slug: role === 'client' ? clientSlug ?? null : null },
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

      return NextResponse.json({ ok: true, userId: createdUser.user_id });
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
    const sessionResult = await requireAdmin(request, { allowEmails: ADMIN_ALLOWLIST });
    if ('response' in sessionResult) return sessionResult.response;

    const json = await request.json();
    const parsed = updateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, email, role, clientSlug, userId } = parsed.data;

    if (role) {
      await assignRoleToUser(userId, role);
    }

    await updateAuth0UserMetadata({
      userId,
      app_metadata: { role, client_slug: role === 'client' ? clientSlug ?? null : null },
    });

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






















