import { AreaAccess, UserRole } from '@/commons/enums'

export interface Membership {
  area: string
  access: AreaAccess
}

export interface UserProfile {
  id: string
  email: string
  name?: string
  tenant: string
  memberships: Membership[]
  role: UserRole
}

export function isTenantAdmin(user: UserProfile): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUPERADMIN
}

/** Areas the user can read: any membership level. Admins are resolved at query time against all tenant areas. */
export function readableAreas(user: UserProfile): string[] {
  return user.memberships.map((m) => m.area)
}

/** Areas the user can create/update notes in: write or manage. */
export function writableAreas(user: UserProfile): string[] {
  return user.memberships
    .filter((m) => m.access === AreaAccess.WRITE || m.access === AreaAccess.MANAGE)
    .map((m) => m.area)
}

/** Areas the user can administer (grant access to other users). */
export function manageableAreas(user: UserProfile): string[] {
  return user.memberships.filter((m) => m.access === AreaAccess.MANAGE).map((m) => m.area)
}
