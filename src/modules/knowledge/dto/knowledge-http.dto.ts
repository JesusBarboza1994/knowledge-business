import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { LinkDirection, Sensitivity } from '@/commons/enums'

export class ListNotesQueryDto extends createZodDto(
  z.object({
    area: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  }),
) {}

export class SearchNotesQueryDto extends createZodDto(
  z.object({
    q: z.string().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

export class LinkQueryDto extends createZodDto(
  z.object({
    dir: z.nativeEnum(LinkDirection).default(LinkDirection.BOTH),
  }),
) {}

export class CreateNoteHttpDto extends createZodDto(
  z.object({
    area: z.string().min(1).max(40),
    title: z.string().min(1).max(200),
    body: z.string().max(2_000_000),
    sensitivity: z.nativeEnum(Sensitivity).optional(),
    visible_to: z.array(z.string()).optional(),
  }),
) {}

export class UpdateNoteHttpDto extends createZodDto(
  z.object({
    base_version: z.number().int().positive(),
    title: z.string().min(1).max(200).optional(),
    body: z.string().max(2_000_000).optional(),
    sensitivity: z.nativeEnum(Sensitivity).optional(),
    visible_to: z.array(z.string()).optional(),
  }),
) {}

export class DeleteNoteQueryDto extends createZodDto(
  z.object({
    base_version: z.coerce.number().int().positive(),
  }),
) {}
