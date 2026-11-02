import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '@nestjs/config'
import { MailService } from './mail.service'
import { escapeHtml, renderEmailLayout } from './templates/layout'

function serviceWith(resendApiKey: string) {
  const config = { get: vi.fn().mockReturnValue({ resendApiKey, from: 'KH <a@b.c>', salesEmail: '' }) }
  return new MailService(config as unknown as ConfigService)
}

const email = { to: 'ana@acme.com', subject: 'Hola', html: '<p>Hola</p>', text: 'Hola' }

describe('MailService', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sin API key imprime el correo y no llama a la red', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await serviceWith('').send(email)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con API key envía a Resend con el remitente configurado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await serviceWith('re_test').send({ ...email, replyTo: 'ventas@acme.com' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body)).toMatchObject({
      from: 'KH <a@b.c>',
      to: ['ana@acme.com'],
      reply_to: 'ventas@acme.com',
    })
  })

  it('falla de forma explícita cuando Resend rechaza el envío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' }))

    await expect(serviceWith('re_test').send(email)).rejects.toThrow(/403/)
  })
})

describe('MailService en producción', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('se niega a arrancar sin API key para no imprimir enlaces de acceso en los logs', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => serviceWith('')).toThrow(/RESEND_API_KEY/)
  })
})

describe('renderEmailLayout', () => {
  it('escapa el enlace del botón', () => {
    const html = renderEmailLayout({
      preheader: 'x',
      bodyHtml: 'y',
      action: { label: 'Ir', href: 'https://a.b/?x="><script>' },
    })
    expect(html).not.toContain('"><script>')
  })

  it('escapeHtml neutraliza etiquetas en datos de usuario', () => {
    expect(escapeHtml('<b>Acme & Co</b>')).toBe('&lt;b&gt;Acme &amp; Co&lt;/b&gt;')
  })
})
