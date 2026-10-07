import { BRAND, EMAIL_FONT_STACK } from "@/lib/brand"
import sendgridMail from '@sendgrid/mail';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type SendInviteParams = {
  to: string;
  firstName: string;
  lastName: string;
  ticketUrl: string;
};

const APP_NAME = "AssembledView";

// Plain-text fallback (kept for deliverability / non-HTML clients)
const baseEmailText = (params: SendInviteParams) => `Hi ${params.firstName},

You've been invited to ${APP_NAME}.

Set your password here: ${params.ticketUrl}

This link expires in 7 days. MFA is required and you'll be prompted to enrol on first login.

If you did not expect this email, please contact support.`;

// Branded, email-safe (table layout + inline CSS). Mirrors lib/ops/digest/email.ts.
const baseEmailHtml = (params: SendInviteParams) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.colour.sand};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.colour.sand};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${BRAND.colour.white};border:1px solid ${BRAND.colour.line};border-radius:8px;overflow:hidden;">
        <tr><td style="background:${BRAND.colour.ink};padding:20px 28px;">
          <div style="font-family:${EMAIL_FONT_STACK};font-size:18px;font-weight:700;color:${BRAND.colour.white};letter-spacing:.2px;">Assembled Media</div>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;font-family:${EMAIL_FONT_STACK};">
          <div style="font-size:17px;font-weight:700;color:${BRAND.colour.ink};">Hi ${escapeHtml(params.firstName)},</div>
          <p style="font-size:14px;line-height:1.55;color:${BRAND.colour.body};margin:12px 0 0;">You've been invited to <strong>AssembledView</strong>. Set your password to activate your account.</p>
        </td></tr>
        <tr><td style="padding:20px 28px 4px;" align="left">
          <a href="${params.ticketUrl}" style="display:inline-block;background:${BRAND.colour.lime};color:${BRAND.colour.ink};font-family:${EMAIL_FONT_STACK};font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;">Set your password</a>
        </td></tr>
        <tr><td style="padding:14px 28px 0;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};">
          Or paste this link into your browser:<br>
          <span style="word-break:break-all;color:${BRAND.colour.forest};">${escapeHtml(params.ticketUrl)}</span>
        </td></tr>
        <tr><td style="padding:20px 28px 0;">
          <div style="border-top:1px solid ${BRAND.colour.line};"></div>
        </td></tr>
        <tr><td style="padding:16px 28px 4px;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:1.6;color:${BRAND.colour.muted};">
          This link expires in <strong>7 days</strong>. Multi-factor authentication is required &mdash; you'll be prompted to enrol on first login.
        </td></tr>
        <tr><td style="padding:4px 28px 24px;font-family:${EMAIL_FONT_STACK};font-size:12px;color:${BRAND.colour.muted};">
          If you did not expect this email, please contact support.
        </td></tr>
      </table>
      <div style="font-family:${EMAIL_FONT_STACK};font-size:11px;color:${BRAND.colour.muted};margin-top:14px;">Assembled Media</div>
    </td></tr>
  </table>
</body>
</html>`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    subject: "You've been invited to AssembledView",
    text: baseEmailText(params),
    html: baseEmailHtml(params),
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
    subject: "You've been invited to AssembledView",
    text: baseEmailText(params),
    html: baseEmailHtml(params),
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
