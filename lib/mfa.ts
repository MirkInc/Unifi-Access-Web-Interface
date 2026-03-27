import crypto from 'crypto'
import { generateSecret, generateURI, verify } from 'otplib'
import type { IUser } from '@/models/User'

export type MfaMethod = 'email' | 'totp' | 'passkey'

export function generateNumericCode(length = 6): string {
  const digits = '0123456789'
  let out = ''
  for (let i = 0; i < length; i++) {
    const idx = crypto.randomInt(0, digits.length)
    out += digits.charAt(idx)
  }
  return out
}

export function hashMfaCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}

export function isMfaCodeValid(code: string, hash: string | null | undefined): boolean {
  if (!hash) return false
  return hashMfaCode(code) === hash
}

export function isValidSixDigitCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}

export function shouldRequireMfa(user: Pick<IUser, 'role' | 'mfaEnforced' | 'mfaRequiredFrom' | 'mfaEmailEnabled' | 'mfaTotpEnabled' | 'mfaPasskeys'>): boolean {
  const hasAnyMethod = Boolean(user.mfaEmailEnabled || user.mfaTotpEnabled || (user.mfaPasskeys?.length ?? 0) > 0)
  if (user.mfaEnforced && (!user.mfaRequiredFrom || user.mfaRequiredFrom <= new Date())) return true
  return hasAnyMethod
}

export function getLoginMfaMethods(user: Pick<IUser, 'mfaEnforced' | 'mfaRequiredFrom' | 'mfaEmailEnabled' | 'mfaTotpEnabled' | 'mfaPasskeys'>): MfaMethod[] {
  const enforcementActive = Boolean(user.mfaEnforced && (!user.mfaRequiredFrom || user.mfaRequiredFrom <= new Date()))
  const methods: MfaMethod[] = []
  if (user.mfaEmailEnabled || enforcementActive) methods.push('email')
  if (user.mfaTotpEnabled) methods.push('totp')
  if ((user.mfaPasskeys?.length ?? 0) > 0) methods.push('passkey')
  return methods
}

export function createTotpSecret(): string {
  return generateSecret()
}

export async function verifyTotpCode(code: string, secret: string): Promise<boolean> {
  const result = await verify({ token: code, secret, strategy: 'totp' })
  if (typeof result === 'boolean') return result
  return Boolean(result?.valid)
}

export function getTotpOtpauthUri(email: string, secret: string): string {
  return generateURI({
    strategy: 'totp',
    issuer: 'Access Portal',
    label: email,
    secret,
    algorithm: 'sha1',
  })
}
