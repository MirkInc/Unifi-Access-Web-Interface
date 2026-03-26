import type { DefaultSession } from 'next-auth'

// Extend NextAuth session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: 'admin' | 'user'
    } & DefaultSession['user']
  }
  interface User {
    role: 'admin' | 'user'
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: 'admin' | 'user'
  }
}

// Door permission set per door per user
export interface DoorPermission {
  doorId: string
  canUnlock: boolean
  canEndLockSchedule: boolean
  canTempLock: boolean
  canEndTempLock: boolean
  canViewLogs: boolean
}

// Tenant access entry on a user
export interface TenantAccess {
  tenantId: string
  doorPermissions: DoorPermission[]
}

// UniFi API door object (live from controller)
export interface UnifiDoor {
  id: string
  name: string
  full_name: string
  floor_id: string
  type: string
  is_bind_hub: boolean
  door_lock_relay_status: 'lock' | 'unlock'
  door_position_status: 'open' | 'close' | null
}

// UniFi lock rule response
export interface UnifiLockRule {
  type: 'schedule' | 'keep_lock' | 'keep_unlock' | 'custom' | 'lock_early'
  ended_time: number
}

// UniFi log entry
export interface UnifiLogEntry {
  id: string
  actor: {
    id: string
    display_name: string
    type: string
  }
  event: {
    type: string
    log_key: string
    display_message: string
    result: string
    object_id: string
    object_name: string
    timestamp: number
  }
  authentication?: {
    credential_provider: string
    issuer: string
  }
}

// UniFi Access schedule types
export interface UnifiScheduleTimeRange {
  start_time: string  // "HH:MM:SS"
  end_time: string    // "HH:MM:SS"
}

export interface UnifiScheduleHoliday {
  id: string
  name: string
  start_time: string
  end_time: string
  repeat: boolean
  description?: string
}

export interface UnifiSchedule {
  id: string
  name: string
  is_default: boolean
  type: string
  weekly: {
    sunday: UnifiScheduleTimeRange[]
    monday: UnifiScheduleTimeRange[]
    tuesday: UnifiScheduleTimeRange[]
    wednesday: UnifiScheduleTimeRange[]
    thursday: UnifiScheduleTimeRange[]
    friday: UnifiScheduleTimeRange[]
    saturday: UnifiScheduleTimeRange[]
  }
  holiday_group_id?: string
  holiday_group?: {
    id: string
    name: string
    is_default: boolean
    holidays: UnifiScheduleHoliday[]
  }
  holiday_schedule?: UnifiScheduleTimeRange[]
}

// Cached door (from MongoDB)
export interface CachedDoor {
  _id: string
  tenantId: string
  unifiDoorId: string
  name: string
  fullName: string
  isActive: boolean
  lastSeen: Date
}

// Door status (combined live + cached data)
export interface DoorStatus {
  id: string         // our MongoDB _id
  unifiDoorId: string
  tenantId: string
  name: string
  fullName: string
  lockStatus: 'lock' | 'unlock' | null
  positionStatus: 'open' | 'close' | null
  isOnline: boolean
  lockRule?: UnifiLockRule | null
  firstPersonInRequired?: boolean
}
