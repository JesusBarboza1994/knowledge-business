import { renderLoginForm } from './loginPage'
import { PAGE_STYLES } from './pageStyles'

export function renderError(message: string, nonce?: string): string {
  if (nonce) return renderLoginForm(nonce, message)
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Hub — Error</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card center">
    <div class="icon">&#9888;</div>
    <div class="logo">No se pudo conectar</div>
    <div class="subtitle">${message}</div>
    <div class="hint">Cierra esta ventana e intentalo de nuevo desde Claude.</div>
  </div>
</body>
</html>`
}
