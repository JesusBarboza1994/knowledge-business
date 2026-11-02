/** Escapes text interpolated into email HTML: names and org names are user input. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface RenderedEmail {
  subject: string
  html: string
  /** Plain-text alternative: some clients and spam filters rely on it. */
  text: string
}

export interface EmailLayoutInput {
  /** Hidden preview line shown by inbox lists. Plain text. */
  preheader: string
  /** Already-escaped HTML for the body. */
  bodyHtml: string
  /** Optional call to action. `href` is escaped here. */
  action?: { label: string; href: string }
  /** Small print under the button, already-escaped HTML. */
  footnoteHtml?: string
}

const PRODUCT_NAME = 'NoesisHub'

/**
 * Table-based, inline-styled shell: email clients ignore <style> blocks and modern layout.
 * Light background on purpose — dark emails render badly in clients that force their own theme.
 */
export function renderEmailLayout({ preheader, bodyHtml, action, footnoteHtml }: EmailLayoutInput): string {
  const button = action
    ? `<tr><td style="padding:8px 0 24px">
         <a href="${escapeHtml(action.href)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${escapeHtml(action.label)}</a>
       </td></tr>
       <tr><td style="font-size:12px;color:#64748b;padding-bottom:16px;word-break:break-all">
         Si el botón no funciona, copia este enlace en tu navegador:<br>${escapeHtml(action.href)}
       </td></tr>`
    : ''
  const footnote = footnoteHtml
    ? `<tr><td style="font-size:12px;color:#64748b;padding-top:8px">${footnoteHtml}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${PRODUCT_NAME}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px">
      <tr><td style="font-size:18px;font-weight:700;padding-bottom:20px">${PRODUCT_NAME}</td></tr>
      <tr><td style="font-size:15px;line-height:1.6;padding-bottom:16px">${bodyHtml}</td></tr>
      ${button}
      ${footnote}
    </table>
  </td></tr>
</table>
</body></html>`
}
