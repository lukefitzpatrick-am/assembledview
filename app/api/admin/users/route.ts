import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assignRoleToUser,
  createAuth0User,
  createPasswordChangeTicket,
  updateAuth0UserMetadata,
} from '@/lib/api/auth0Management';
import { sendInviteEmail } from '@/lib/email/inviteSender';
import { auth0 } from '@/lib/auth0';
import { getUserRoles } from '@/lib/rbac';

const payloadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['admin', 'client']).default('client'),
  clientId: z
    .union([z.string().trim(), z.number()])
    .optional()
    .transform((val) => (val === undefined ? undefined : String(val))),
});

const updateSchema = payloadSchema
  .partial({ password: true })
  .extend({
    userId: z.string().trim().min(1, 'User ID is required'),
  });

function isAllowedAdmin(email: string | undefined | null): boolean {
  const allowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!allowlist || !email) return false;
  return allowlist
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(email.toLowerCase());
}

function isAdminSession(session: Awaited<ReturnType<typeof auth0.getSession>>): boolean {
  if (!session?.user) return false;
  const roles = getUserRoles(session.user);
  return roles.includes('admin');
}

async function syncUserToXano(params: {
  auth0UserId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'client';
  clientId?: string;
  method?: 'POST' | 'PATCH';
  userId?: string;
}) {
  const endpoint = process.env.XANO_USERS_ENDPOINT;
  if (!endpoint) {
    throw new Error('Missing env: XANO_USERS_ENDPOINT');
  }

  const url = params.userId ? `${endpoint}/${params.userId}` : endpoint;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.XANO_API_KEY) {
    headers.Authorization = `Bearer ${process.env.XANO_API_KEY}`;
  }

  const response = await fetch(url, {
    method: params.method || (params.userId ? 'PATCH' : 'POST'),
    headers,
    body: JSON.stringify({
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
      auth0_user_id: params.auth0UserId,
      role: params.role,
      client_id: params.clientId ?? null,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to sync user to Xano: ${response.status} ${errorText}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    const userEmail = session?.user?.email;

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminSession(session) && !isAllowedAdmin(userEmail)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const json = await request.json();
    const parsed = payloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, email, password, role, clientId } = parsed.data;

    const createdUser = await createAuth0User({
      email,
      firstName,
      lastName,
      password,
    });

    await assignRoleToUser(createdUser.user_id, role);
    await updateAuth0UserMetadata({
      userId: createdUser.user_id,
      app_metadata: { role, clientId: clientId ?? null },
    });

    await syncUserToXano({
      auth0UserId: createdUser.user_id,
      email,
      firstName,
      lastName,
      role,
      clientId: clientId ?? undefined,
      method: 'POST',
    });

    const ticketUrl = await createPasswordChangeTicket({ userId: createdUser.user_id });

    await sendInviteEmail({
      to: email,
      firstName,
      lastName,
      ticketUrl,
    });

    return NextResponse.json({ ok: true, userId: createdUser.user_id });
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
    const session = await auth0.getSession();
    const userEmail = session?.user?.email;

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminSession(session) && !isAllowedAdmin(userEmail)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const json = await request.json();
    const parsed = updateSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { firstName, lastName, email, password, role, clientId, userId } = parsed.data;

    if (role) {
      await assignRoleToUser(userId, role);
    }

    await updateAuth0UserMetadata({
      userId,
      app_metadata: { role, clientId: clientId ?? null },
    });

    await syncUserToXano({
      auth0UserId: userId,
      email: email || '',
      firstName: firstName || '',
      lastName: lastName || '',
      role: (role as 'admin' | 'client') || 'client',
      clientId: clientId ?? undefined,
      method: 'PATCH',
      userId,
    });

    if (password) {
      await createPasswordChangeTicket({ userId });
    }

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





















