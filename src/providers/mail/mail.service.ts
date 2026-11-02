import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MailConfig } from '@/settings/settings.model'
import { RenderedEmail } from './templates/layout'

export interface OutgoingEmail extends RenderedEmail {
  to: string | string[]
  replyTo?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * Transactional email over Resend's HTTP API (plain fetch — no SDK needed for one endpoint).
 * Without RESEND_API_KEY the email is logged instead, so sign-up/reset links can be followed
 * locally. Delivery failures throw: callers decide whether a flow can continue without the email.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly config: MailConfig

  constructor(configService: ConfigService) {
    this.config = configService.get<MailConfig>('mail') ?? { resendApiKey: '', from: '', salesEmail: '' }
    // The console fallback prints verification/reset links: never acceptable in production.
    if (!this.config.resendApiKey && process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required in production')
    }
  }

  get isLive(): boolean {
    return Boolean(this.config.resendApiKey)
  }

  async send(email: OutgoingEmail): Promise<void> {
    const to = Array.isArray(email.to) ? email.to : [email.to]

    if (!this.isLive) {
      this.logger.log(`[mail:console] to=${to.join(', ')} subject="${email.subject}"\n${email.text}`)
      return
    }

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.config.from,
        to,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      this.logger.error(`Resend rejected email "${email.subject}" (${response.status}): ${detail}`)
      throw new Error(`Email delivery failed with status ${response.status}`)
    }
  }
}
