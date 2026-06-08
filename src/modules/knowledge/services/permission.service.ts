import { Injectable } from '@nestjs/common'
import { NoteDocument } from '@/repository/schemas/note/note.schema'
import { UserProfile } from '@/tools/user-profile.type'

@Injectable()
export class PermissionService {
  canView(user: UserProfile, note: NoteDocument): boolean {
    if (note.tenant !== user.tenant) return false
    if (user.areas.includes(note.area)) return true
    if (note.sensitivity === 'confidential') return false
    if (note.sensitivity === 'public_org') return true
    if (note.sensitivity === 'internal_area')
      return (note.visible_to ?? []).some((a) => user.areas.includes(a))
    return false
  }

  canEdit(user: UserProfile, note: NoteDocument): boolean {
    return (
      user.areas.includes(note.area) &&
      ['editor', 'area_admin', 'admin'].includes(user.role)
    )
  }
}
