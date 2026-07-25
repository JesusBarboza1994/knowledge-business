import { Injectable } from '@nestjs/common'
import { NoteDocument } from '@/repository/schemas/note/note.schema'
import { UserProfile, isTenantAdmin, readableAreas } from '@/tools/user-profile.type'
import { AreaAccess, Sensitivity } from '@/commons/enums'

/** The fields any read check needs — a note, an asset, or anything else scoped the same way. */
export interface VisibilityScope {
  tenant: string
  area: string
  sensitivity: string
  visible_to?: string[]
}

@Injectable()
export class PermissionService {
  /** Effective access level for a user in a given area. Tenant admins manage everything in their tenant. */
  accessTo(user: UserProfile, area: string): AreaAccess | 'none' {
    if (isTenantAdmin(user)) return AreaAccess.MANAGE
    return user.memberships.find((m) => m.area === area)?.access ?? 'none'
  }

  canView(user: UserProfile, note: NoteDocument): boolean {
    return this.canViewScope(user, note)
  }

  /**
   * Read rule for anything scoped by area + sensitivity. Notes and assets share it so an image
   * can never be more reachable than the note it illustrates.
   */
  canViewScope(user: UserProfile, scope: VisibilityScope): boolean {
    if (scope.tenant !== user.tenant) return false
    if (this.accessTo(user, scope.area) !== 'none') return true
    // Non-members can still see content shared beyond their areas, by sensitivity:
    if (scope.sensitivity === Sensitivity.CONFIDENTIAL) return false
    if (scope.sensitivity === Sensitivity.PUBLIC_ORG) return true
    if (scope.sensitivity === Sensitivity.INTERNAL_AREA)
      return (scope.visible_to ?? []).some((a) => readableAreas(user).includes(a))
    return false
  }

  /** Whether the user may add content to an area — the bar for uploading an asset into it. */
  canWriteTo(user: UserProfile, area: string): boolean {
    const access = this.accessTo(user, area)
    return access === AreaAccess.WRITE || access === AreaAccess.MANAGE
  }

  canEdit(user: UserProfile, note: NoteDocument): boolean {
    if (note.tenant !== user.tenant) return false
    const access = this.accessTo(user, note.area)
    return access === AreaAccess.WRITE || access === AreaAccess.MANAGE
  }

  /** Whether the user can grant/revoke other users' access to an area. */
  canManage(user: UserProfile, area: string): boolean {
    return this.accessTo(user, area) === AreaAccess.MANAGE
  }
}
