import { Injectable } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { Types } from 'mongoose'
import { AuthTokenRepository } from '@/repository/schemas/auth-token/auth-token.repository'
import { AuthTokenDocument } from '@/repository/schemas/auth-token/auth-token.schema'
import { AuthTokenPurpose } from '@/commons/enums'

const HOUR = 60 * 60 * 1000

export const AUTH_TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  [AuthTokenPurpose.VERIFY_EMAIL]: 48 * HOUR,
  [AuthTokenPurpose.RESET_PASSWORD]: 1 * HOUR,
  [AuthTokenPurpose.INVITE]: 7 * 24 * HOUR,
}

/** Minimum gap between two emails of the same purpose to the same user (no Redis yet: checked in Mongo). */
export const AUTH_TOKEN_RESEND_COOLDOWN_MS = 60 * 1000

/**
 * Issues and redeems the single-use tokens behind emailed links. The raw token only ever exists in
 * the email; the database keeps its SHA-256, so lookups are exact matches on the hash.
 */
@Injectable()
export class AuthTokenService {
  constructor(private readonly repository: AuthTokenRepository) {}

  /** Issuing a new token voids the previous unused ones of the same purpose. */
  async issue(user: { _id: Types.ObjectId; tenant: string }, purpose: AuthTokenPurpose): Promise<string> {
    const now = new Date()
    await this.repository.invalidateUnused(user._id, purpose, now)
    const token = randomBytes(32).toString('base64url')
    await this.repository.create({
      user_id: user._id,
      tenant: user.tenant,
      purpose,
      token_hash: AuthTokenService.hash(token),
      expires_at: new Date(now.getTime() + AUTH_TOKEN_TTL_MS[purpose]),
      used_at: null,
    })
    return token
  }

  /** True when a token of this purpose was sent too recently to send another. */
  async inCooldown(userId: Types.ObjectId, purpose: AuthTokenPurpose): Promise<boolean> {
    const latest = await this.repository.findLatest(userId, purpose)
    if (!latest?.created_at) return false
    return Date.now() - latest.created_at.getTime() < AUTH_TOKEN_RESEND_COOLDOWN_MS
  }

  async peek(token: string, purpose: AuthTokenPurpose): Promise<AuthTokenDocument | null> {
    if (!token) return null
    return this.repository.findValid(AuthTokenService.hash(token), purpose, new Date())
  }

  async consume(token: string, purpose: AuthTokenPurpose): Promise<AuthTokenDocument | null> {
    if (!token) return null
    return this.repository.consume(AuthTokenService.hash(token), purpose, new Date())
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }
}
