import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const password = z.string().min(8).max(128)
const email = z.string().trim().toLowerCase().email().max(254)

export class SignupDto extends createZodDto(
  z.object({
    organization_name: z.string().trim().min(2).max(100),
    slug: z.string().trim().toLowerCase().min(2).max(40).regex(SLUG_PATTERN),
    description: z.string().trim().min(3).max(280),
    phone_country_code: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{0,3}$/),
    phone_number: z
      .string()
      .trim()
      .regex(/^[0-9][0-9 -]{4,18}[0-9]$/),
    name: z.string().trim().min(2).max(120),
    email,
    password,
  }),
) {}

export class EmailOnlyDto extends createZodDto(z.object({ email })) {}

export class TokenDto extends createZodDto(z.object({ token: z.string().min(10).max(200) })) {}

export class ResetPasswordDto extends createZodDto(z.object({ token: z.string().min(10).max(200), password })) {}

export class AcceptInvitationDto extends createZodDto(
  z.object({
    token: z.string().min(10).max(200),
    password,
    name: z.string().trim().min(2).max(120).optional(),
  }),
) {}

export class SlugQueryDto extends createZodDto(z.object({ slug: z.string().trim().toLowerCase().min(1).max(60) })) {}
