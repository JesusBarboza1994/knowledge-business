import { PAGE_STYLES } from './pageStyles'

export function renderSuccess(redirectUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Knowledge Hub — Conectado</title>
  <meta http-equiv="refresh" content="2;url=${redirectUrl}">
  <style>${PAGE_STYLES}</style>
</head>
<body>
  <div class="card center">
    <div class="icon">&#10003;</div>
    <div class="logo">Autenticacion exitosa!</div>
    <div class="subtitle">Conectando con Claude...</div>
    <div class="hint">Si no te redirige automaticamente, <a href="${redirectUrl}">haz clic aqui</a>.</div>
  </div>
  <script>setTimeout(function(){ window.location.href = ${JSON.stringify(redirectUrl)} }, 1500)</script>
</body>
</html>`
}
