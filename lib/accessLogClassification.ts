import { isAccessDenied } from '@/lib/utils'
import type { UnifiLogEntry } from '@/types'

export type AccessMethodBucket =
  | 'nfc_card'
  | 'ren_motion'
  | 'pin'
  | 'mobile_ble'
  | 'biometric'
  | 'button'
  | 'remote'
  | 'unknown'

export function methodBucketLabel(bucket: AccessMethodBucket): string {
  switch (bucket) {
    case 'nfc_card': return 'NFC / Card'
    case 'ren_motion': return 'REN / Motion'
    case 'pin': return 'PIN'
    case 'mobile_ble': return 'Mobile / BLE'
    case 'biometric': return 'Biometric'
    case 'button': return 'Button'
    case 'remote': return 'Remote'
    default: return 'Unknown'
  }
}

export function methodCodeForExport(log: UnifiLogEntry): string {
  const msg = log.event?.display_message ?? ''
  const paren = msg.match(/\(([^)]+)\)/)?.[1]?.trim().toUpperCase()
  if (paren) return paren

  const bucket = classifyAccessMethod(log)
  switch (bucket) {
    case 'ren_motion': return 'REN'
    case 'nfc_card': return 'NFC'
    case 'pin': return 'PIN'
    case 'mobile_ble': return 'BLE'
    case 'biometric': return 'FP'
    case 'button': return 'BUTTON'
    case 'remote': return 'REMOTE'
    default: return 'UNKNOWN'
  }
}

export function classifyAccessMethod(log: UnifiLogEntry): AccessMethodBucket {
  const key = (log.event?.log_key ?? '').toLowerCase()
  const msg = (log.event?.display_message ?? '').toLowerCase()
  const provider = (log.authentication?.credential_provider ?? '').toLowerCase()
  const codeMatch = (log.event?.display_message ?? '').match(/\(([^)]+)\)/)
  const code = (codeMatch?.[1] ?? '').toLowerCase()

  if (provider === 'rex' || provider === 'motion' || code === 'ren' || code === 'rex' || key.includes('rex') || key.includes('motion')) return 'ren_motion'
  if (provider === 'remote' || key.includes('remote') || code === 'remote' || msg.includes('remote')) return 'remote'
  if (provider === 'pin' || key.includes('pin') || code === 'pin') return 'pin'
  if (provider === 'nfc' || provider === 'card' || key.includes('nfc') || key.includes('card') || code === 'nfc') return 'nfc_card'
  if (provider === 'ble' || provider === 'mobile' || key.includes('mobile') || key.includes('ble') || code === 'ble') return 'mobile_ble'
  if (provider === 'fingerprint' || key.includes('fingerprint') || key.includes('biometric') || code === 'fp') return 'biometric'
  if (provider === 'button' || key.includes('button') || code === 'button') return 'button'
  return 'unknown'
}

export function unlockMethodLabel(log: UnifiLogEntry): string {
  switch (classifyAccessMethod(log)) {
    case 'ren_motion': return 'Motion Sensor'
    case 'remote': return 'Remote'
    case 'pin': return 'PIN'
    case 'nfc_card': return 'Card / NFC'
    case 'mobile_ble': return 'Mobile'
    case 'biometric': return 'Biometric'
    case 'button': return 'Button'
    default: {
      const msg = log.event?.display_message ?? ''
      const code = msg.match(/\(([^)]+)\)/)?.[1]
      return code || msg || 'Unknown'
    }
  }
}

export function denialReason(log: UnifiLogEntry): string {
  const key = (log.event?.log_key ?? '').toLowerCase()
  const msg = log.event?.display_message ?? ''
  const codeMatch = msg.match(/\(([^)]+)\)/)
  const code = (codeMatch?.[1] ?? '').toLowerCase()

  const credentialCodes = new Set(['nfc', 'card', 'ble', 'mobile', 'pin', 'fp', 'fingerprint', 'rex', 'ren', 'remote', 'button'])
  if (key.includes('schedule')) return 'Outside schedule'
  if (key.includes('block')) return 'User blocked'
  if (key.includes('expir')) return 'Credential expired'
  if (key.includes('antipassback') || key.includes('apb')) return 'Antipassback'
  if (key.includes('no_access') || key.includes('not_allow')) return 'No access'
  if (key.includes('invalid')) return 'Invalid credential'
  if (key.includes('visitor')) return 'Visitor expired'
  if (key.includes('tailgate')) return 'Tailgating'
  if (key.includes('incomplete') || key.includes('scan_fail')) return 'Incomplete scan'
  if (codeMatch?.[1] && !credentialCodes.has(code)) return codeMatch[1]
  const afterDenied = key.match(/denied[_.](.+)$/)?.[1]?.replace(/_/g, ' ')
  if (afterDenied && !credentialCodes.has(afterDenied.replace(/ /g, ''))) return afterDenied
  return 'No access'
}

export function actorLabel(log: UnifiLogEntry): string {
  const rawName = log.actor?.display_name
  if (rawName && rawName !== 'N/A') return rawName
  const method = unlockMethodLabel(log)
  if (method === 'Motion Sensor') return 'Motion Sensor'
  if (method === 'Remote') return 'Remote'
  if (method === 'Button') return 'Button'
  return 'System'
}

export function isDeniedAccess(log: UnifiLogEntry): boolean {
  return isAccessDenied(log)
}

