import { describe, expect, it } from 'vitest'
import { renderLoginForm } from './loginPage'

describe('renderLoginForm', () => {
  it('renders the configured OAuth logo', () => {
    const html = renderLoginForm('nonce-1', undefined, 'https://knowvault.example.com/knowvault-icon.png')

    expect(html).toContain('class="brand-icon"')
    expect(html).toContain('src="https://knowvault.example.com/knowvault-icon.png"')
  })

  it('keeps the text fallback when no logo is configured', () => {
    const html = renderLoginForm('nonce-1', undefined, '')

    expect(html).toContain('<div class="logo">Knowledge Hub</div>')
    expect(html).not.toContain('class="brand-icon"')
  })
})
