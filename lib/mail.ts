import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com'

function normalizeBaseUrl(value?: string | null): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  return withProtocol.replace(/\/+$/, '')
}

export function resolvePortalUrl(opts?: { preferredPortalUrl?: string | null; request?: Request }): string {
  const preferred = normalizeBaseUrl(opts?.preferredPortalUrl)
  if (preferred) return preferred

  const host = opts?.request?.headers.get('host') ?? ''
  if (host) {
    const proto = opts?.request?.headers.get('x-forwarded-proto') ?? 'https'
    return `${proto}://${host}`
  }

  return (
    normalizeBaseUrl(process.env.APP_BASE_URL) ??
    normalizeBaseUrl(process.env.NEXTAUTH_URL) ??
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeBaseUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalizeBaseUrl(process.env.VERCEL_URL) ??
    'http://localhost:3000'
  )
}

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
  preferredPortalUrl?: string | null
): Promise<void> {
  const resetUrl = `${resolvePortalUrl({ preferredPortalUrl })}/reset-password?token=${token}`

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Set your password — Access Portal',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF; margin-bottom: 8px;">Welcome to Access Portal</h2>
        <p style="color: #333; margin-bottom: 24px;">Hi ${name},</p>
        <p style="color: #333;">An account has been created for you. Click the button below to set your password.</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #006FFF;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 24px 0;
        ">Set Password</a>
        <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If you didn't expect this email, ignore it.</p>
        <p style="color: #999; font-size: 12px;">${resetUrl}</p>
      </div>
    `,
  })
}

export async function sendInvitationReminderEmail(
  email: string,
  name: string,
  token: string,
  preferredPortalUrl?: string | null
): Promise<void> {
  const resetUrl = `${resolvePortalUrl({ preferredPortalUrl })}/reset-password?token=${token}`

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reminder: complete your Access Portal setup',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF; margin-bottom: 8px;">Access Portal Reminder</h2>
        <p style="color: #333; margin-bottom: 24px;">Hi ${name},</p>
        <p style="color: #333;">This is a reminder to finish setting up your Access Portal account.</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #006FFF;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 24px 0;
        ">Set Password</a>
        <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If you no longer need access, ignore this email.</p>
        <p style="color: #999; font-size: 12px;">${resetUrl}</p>
      </div>
    `,
  })
}

export async function sendForgotPasswordEmail(
  email: string,
  name: string,
  token: string,
  preferredPortalUrl?: string | null
): Promise<void> {
  const resetUrl = `${resolvePortalUrl({ preferredPortalUrl })}/reset-password?token=${token}`

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your password — Access Portal',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF; margin-bottom: 8px;">Reset Your Password</h2>
        <p style="color: #333; margin-bottom: 24px;">Hi ${name},</p>
        <p style="color: #333;">We received a request to reset your password. Click the button below to choose a new one.</p>
        <a href="${resetUrl}" style="
          display: inline-block;
          background: #006FFF;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 24px 0;
        ">Reset Password</a>
        <p style="color: #666; font-size: 13px;">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
        <p style="color: #999; font-size: 12px;">${resetUrl}</p>
      </div>
    `,
  })
}

export async function sendPasswordChangedEmail(
  email: string,
  name: string
): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your password has been updated',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF;">Password Updated</h2>
        <p>Hi ${name}, your Access Portal password was just changed.</p>
        <p style="color: #666; font-size: 13px;">If you didn't do this, contact your administrator immediately.</p>
      </div>
    `,
  })
}

export async function sendEmailChangeNotification(
  oldEmail: string,
  name: string,
  newEmail: string
): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: oldEmail,
    subject: 'Account email address changed — Access Portal',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF;">Email Address Changed</h2>
        <p>Hi ${name},</p>
        <p>An administrator has changed your account email address to <strong>${newEmail}</strong>.</p>
        <p>The new address must be confirmed before the change takes effect. If you did not expect this, contact your administrator.</p>
        <p style="color: #999; font-size: 12px;">This notification was sent to your previous email address on file.</p>
      </div>
    `,
  })
}

export async function sendEmailConfirmation(
  newEmail: string,
  name: string,
  token: string,
  preferredPortalUrl?: string | null
): Promise<void> {
  const confirmUrl = `${resolvePortalUrl({ preferredPortalUrl })}/confirm-email?token=${token}`
  await resend.emails.send({
    from: FROM,
    to: newEmail,
    subject: 'Confirm your new email address — Access Portal',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF;">Confirm Your Email Address</h2>
        <p>Hi ${name},</p>
        <p>An administrator has requested to update your Access Portal email address to this address.</p>
        <a href="${confirmUrl}" style="
          display: inline-block;
          background: #006FFF;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          margin: 24px 0;
        ">Confirm New Email</a>
        <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If you don't recognize this request, ignore this email.</p>
        <p style="color: #999; font-size: 12px;">${confirmUrl}</p>
      </div>
    `,
  })
}

export async function sendMfaCodeEmail(
  email: string,
  name: string,
  code: string
): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Your Access Portal verification code',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF;">Verification Code</h2>
        <p>Hi ${name},</p>
        <p>Use this 6-digit verification code to continue:</p>
        <p style="font-size: 28px; letter-spacing: 6px; font-weight: 700; color: #111; margin: 20px 0;">${code}</p>
        <p style="color: #666; font-size: 13px;">This code expires in 10 minutes. If you did not request it, ignore this email.</p>
      </div>
    `,
  })
}

export async function sendMfaPolicyEmail(
  email: string,
  name: string,
  requiredFrom: Date
): Promise<void> {
  await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'MFA is now required on your Access Portal account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #006FFF;">Security policy updated</h2>
        <p>Hi ${name},</p>
        <p>An administrator has required multi-factor authentication (MFA) for your account.</p>
        <p>MFA requirement starts: <strong>${requiredFrom.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong></p>
        <p style="color: #666; font-size: 13px;">At login you will be prompted for MFA. You can set up authenticator app and passkeys in your profile.</p>
      </div>
    `,
  })
}
