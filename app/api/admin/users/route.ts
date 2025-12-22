import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuth0User, createPasswordChangeTicket } from '@/lib/api/auth0Management';
import { sendInviteEmail } from '@/lib/email/inviteSender';
import { auth0 } from '@/lib/auth0';

const payloadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function isAllowedAdmin(email: string | undefined | null): boolean {
  const allowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!allowlist || !email) return false;
  return allowlist
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth0.getSession();
    const userEmail = session?.user?.email;

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAllowedAdmin(userEmail)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const json = await request.json();
    const parsed = payloadSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { firstName, lastName, email, password } = parsed.data;

    const createdUser = await createAuth0User({
      email,
      firstName,
      lastName,
      password,
    });

    const ticketUrl = await createPasswordChangeTicket({ userId: createdUser.user_id });

    await sendInviteEmail({
      to: email,
      firstName,
      lastName,
      ticketUrl,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Admin user creation failed', error);
    return NextResponse.json(
      { error: 'Failed to create user. Check server logs for details.' },
      { status: 500 }
    );
  }
}


