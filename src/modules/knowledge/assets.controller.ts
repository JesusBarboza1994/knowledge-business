import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { CurrentUser } from '@/commons/decorators/current-user.decorator'
import { SkipResponse } from '@/commons/decorators/skip-response.decorator'
import { UserProfile } from '@/tools/user-profile.type'
import { AssetService } from './services/asset.service'
import { ListAssetsQueryDto, UploadAssetDto } from './dto/knowledge-http.dto'

/** Hard ceiling for multer; AssetService enforces the configured limit with a clearer message. */
const MULTER_MAX_BYTES = 25 * 1024 * 1024

@Controller('knowledge/assets')
export class AssetsController {
  constructor(private readonly assetService: AssetService) {}

  @Get()
  list(@CurrentUser() user: UserProfile, @Query() query: ListAssetsQueryDto) {
    return this.assetService.list(user, query.area, query.limit)
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_MAX_BYTES } }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadAssetDto,
    @CurrentUser() user: UserProfile,
  ) {
    if (!file) throw new BadRequestException('Missing "file" in multipart body')
    return this.assetService.upload(
      {
        area: dto.area,
        filename: file.originalname,
        mime: file.mimetype,
        buffer: file.buffer,
        sensitivity: dto.sensitivity,
        visible_to: dto.visible_to,
      },
      user,
    )
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.assetService.get(id, user)
  }

  /**
   * Streams the bytes through the API rather than redirecting to storage: same-origin keeps the
   * dashboard's `img-src 'self'` CSP intact, and every request re-checks the caller's permissions.
   * Cached privately — the URL is stable per asset and the content behind it never changes.
   */
  @Get(':id/raw')
  @SkipResponse()
  async raw(@Param('id') id: string, @CurrentUser() user: UserProfile, @Res() response: Response) {
    const content = await this.assetService.download(id, user)
    response
      .set({
        'Content-Type': content.mime,
        'Content-Length': String(content.buffer.length),
        'Content-Disposition': `inline; filename="${content.filename}"`,
        'Cache-Control': 'private, max-age=31536000, immutable',
        ETag: `"${content.etag}"`,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(content.buffer)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.assetService.archive(id, user)
  }
}
