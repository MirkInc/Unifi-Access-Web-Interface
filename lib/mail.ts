import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@example.com'
const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const resetUrl = `${BASE_URL}/reset-password?token=${token}`

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

export async function sendForgotPasswordEmail(
  email: string,
  name: string,
  token: string
): Promise<void> {
  const resetUrl = `${BASE_URL}/reset-password?token=${token}`

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
  token: string
): Promise<void> {
  const confirmUrl = `${BASE_URL}/confirm-email?token=${token}`
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
