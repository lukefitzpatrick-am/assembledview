import sendgridMail from '@sendgrid/mail';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type SendInviteParams = {
  to: string;
  firstName: string;
  lastName: string;
  ticketUrl: string;
};

const baseEmailBody = (params: SendInviteParams) => `
Hi ${params.firstName},

You’ve been invited to AssembledView.

Set your password here: ${params.ticketUrl}

MFA is required and you’ll be prompted to enroll on first login.

If you did not expect this email, please contact support.
`;

function getFromEmail(): string {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('Missing env: EMAIL_FROM');
  }
  return from;
}

function hasSendGrid(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY);
}

function hasSmtp(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendWithSendGrid(params: SendInviteParams) {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY not configured');
  }
  sendgridMail.setApiKey(process.env.SENDGRID_API_KEY);
  await sendgridMail.send({
    to: params.to,
    from: getFromEmail(),
    subject: "You’ve been invited to AssembledView",
    text: baseEmailBody(params),
  });
}

async function sendWithSmtp(params: SendInviteParams) {
  const nodemailer = (await import('nodemailer')).default;
  const transportOptions: SMTPTransport.Options = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };
  const transporter = nodemailer.createTransport(transportOptions);
  await transporter.sendMail({
    to: params.to,
    from: getFromEmail(),
    subject: "You’ve been invited to AssembledView",
    text: baseEmailBody(params),
  });
}

export async function sendInviteEmail(params: SendInviteParams) {
  if (hasSendGrid()) {
    await sendWithSendGrid(params);
    return;
  }

  if (hasSmtp()) {
    await sendWithSmtp(params);
    return;
  }

  throw new Error('No email provider configured. Set SENDGRID_API_KEY or SMTP envs.');
}


