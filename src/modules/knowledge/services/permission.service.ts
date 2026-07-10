import { Injectable } from '@nestjs/common'
import { NoteDocument } from '@/repository/schemas/note/note.schema'
import { UserProfile, isTenantAdmin, readableAreas } from '@/tools/user-profile.type'
import { AreaAccess, Sensitivity } from '@/commons/enums'

@Injectable()
export class PermissionService {
  /** Effective access level for a user in a given area. Tenant admins manage everything in their tenant. */
  accessTo(user: UserProfile, area: string): AreaAccess | 'none' {
    if (isTenantAdmin(user)) return AreaAccess.MANAGE
    return user.memberships.find((m) => m.area === area)?.access ?? 'none'
  }

  canView(user: UserProfile, note: NoteDocument): boolean {
    if (note.tenant !== user.tenant) return false
    if (this.accessTo(user, note.area) !== 'none') return true
    // Non-members can still see notes shared beyond their areas, by sensitivity:
    if (note.sensitivity === Sensitivity.CONFIDENTIAL) return false
    if (note.sensitivity === Sensitivity.PUBLIC_ORG) return true
    if (note.sensitivity === Sensitivity.INTERNAL_AREA)
      return (note.visible_to ?? []).some((a) => readableAreas(user).includes(a))
    return false
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
