import { PAGE_STYLES } from './pageStyles'

export function renderLoginForm(nonce: string, error?: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Hub — Iniciar sesion</title>
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card">
    <div class="logo">Knowledge Hub</div>
    <div class="subtitle">Inicia sesion para conectar tu cliente MCP.</div>
    ${error ? `<div class="error">${error}</div>` : ''}
    <form method="POST" action="/oauth/login">
      <input type="hidden" name="nonce" value="${nonce}" />
      <label for="email">Correo</label>
      <input type="email" id="email" name="email" required placeholder="tu@empresa.com" autofocus />
      <label for="password">Contrasena</label>
      <input type="password" id="password" name="password" required />
      <button type="submit">Iniciar sesion</button>
    </form>
  </div>
</body>
</html>`
}
