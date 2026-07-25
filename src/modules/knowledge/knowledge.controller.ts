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
    return this.knowledgeService.listDetailed(user, {
      area: query.area,
      limit: query.limit,
      includeBody: query.include.includes('body'),
    })
  }

  @Get('search')
  search(@CurrentUser() user: UserProfile, @Query() query: SearchNotesQueryDto) {
    return this.knowledgeService.search(query.q, user, query.limit, query.area)
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
  async create(@Body() dto: CreateNoteHttpDto, @CurrentUser() user: UserProfile) {
    const note = await this.knowledgeService.create(dto, user)
    return this.knowledgeService.getRedacted(note.slug, user, { mode: 'full' })
  }

  @Patch('notes/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateNoteHttpDto, @CurrentUser() user: UserProfile) {
    const { base_version, ...patch } = dto
    const note = await this.knowledgeService.update(id, patch, base_version, user)
    return this.knowledgeService.getRedacted(note.slug, user, { mode: 'full' })
  }

  @Delete('notes/:id')
  async remove(@Param('id') id: string, @Query() query: DeleteNoteQueryDto, @CurrentUser() user: UserProfile) {
    return this.knowledgeService.delete(id, query.base_version, user)
  }
}
