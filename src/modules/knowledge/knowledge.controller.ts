import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { UserProfile } from '@/tools/user-profile.type'
import { KnowledgeService } from './services/knowledge.service'
import {
  CreateNoteHttpDto,
  DeleteNoteQueryDto,
  LinkQueryDto,
  ListNotesQueryDto,
  SearchNotesQueryDto,
  UpdateNoteHttpDto,
} from './dto/knowledge-http.dto'

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('context')
  context(@CurrentUser() user: UserProfile) {
    return this.knowledgeService.getWorkspaceContext(user)
  }

  @Get('notes')
  notes(@CurrentUser() user: UserProfile, @Query() query: ListNotesQueryDto) {
    return this.knowledgeService.listDetailed(user, query.area, query.limit)
  }

  @Get('search')
  search(@CurrentUser() user: UserProfile, @Query() query: SearchNotesQueryDto) {
    return this.knowledgeService.search(query.q, user, query.limit)
  }

  @Get('notes/:ref/links')
  links(@Param('ref') ref: string, @CurrentUser() user: UserProfile, @Query() query: LinkQueryDto) {
    return this.knowledgeService.links(ref, query.dir, user)
  }

  @Get('notes/:ref/versions')
  versions(@Param('ref') ref: string, @CurrentUser() user: UserProfile) {
    return this.knowledgeService.versions(ref, user)
  }

  @Get('notes/:ref')
  note(@Param('ref') ref: string, @CurrentUser() user: UserProfile) {
    return this.knowledgeService.getRedacted(ref, user, { mode: 'full' })
  }

  @Post('notes')
  create(@Body() dto: CreateNoteHttpDto, @CurrentUser() user: UserProfile) {
    return this.knowledgeService.create(dto, user)
  }

  @Patch('notes/:id')
  update(@Param('id') id: string, @Body() dto: UpdateNoteHttpDto, @CurrentUser() user: UserProfile) {
    const { base_version, ...patch } = dto
    return this.knowledgeService.update(id, patch, base_version, user)
  }

  @Delete('notes/:id')
  async remove(@Param('id') id: string, @Query() query: DeleteNoteQueryDto, @CurrentUser() user: UserProfile) {
    return this.knowledgeService.delete(id, query.base_version, user)
  }
}
