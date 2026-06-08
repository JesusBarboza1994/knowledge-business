import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Organization, OrganizationSchema } from './schemas/organization/organization.schema'
import { OrganizationRepository } from './schemas/organization/organization.repository'
import { Area, AreaSchema } from './schemas/area/area.schema'
import { AreaRepository } from './schemas/area/area.repository'
import { User, UserSchema } from './schemas/user/user.schema'
import { UserRepository } from './schemas/user/user.repository'
import { Note, NoteSchema } from './schemas/note/note.schema'
import { NoteRepository } from './schemas/note/note.repository'
import { NoteVersion, NoteVersionSchema } from './schemas/note-version/note-version.schema'
import { NoteVersionRepository } from './schemas/note-version/note-version.repository'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: Area.name, schema: AreaSchema },
      { name: User.name, schema: UserSchema },
      { name: Note.name, schema: NoteSchema },
      { name: NoteVersion.name, schema: NoteVersionSchema },
    ]),
  ],
  providers: [
    OrganizationRepository,
    AreaRepository,
    UserRepository,
    NoteRepository,
    NoteVersionRepository,
  ],
  exports: [
    OrganizationRepository,
    AreaRepository,
    UserRepository,
    NoteRepository,
    NoteVersionRepository,
  ],
})
export class RepositoryModule {}
