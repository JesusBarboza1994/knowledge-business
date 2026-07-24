export const PAGE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .card { background: #1e293b; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.3); width: 100%; max-width: 400px; }
  .brand { display: flex; align-items: center; gap: 0.875rem; margin-bottom: 0.5rem; }
  .brand-icon { display: block; flex: 0 0 auto; border: 1px solid #334155; border-radius: 12px; background: #0f172a; object-fit: cover; }
  .logo { font-size: 1.5rem; font-weight: 700; color: #e2e8f0; }
  .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
  label { display: block; font-size: 0.875rem; font-weight: 500; color: #cbd5e1; margin-bottom: 0.375rem; }
  input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 0.875rem; outline: none; margin-bottom: 1rem; }
  input:focus { border-color: #6366f1; }
  .error { background: #7f1d1d; color: #fca5a5; padding: 0.75rem; border-radius: 8px; font-size: 0.875rem; margin-bottom: 1rem; }
  button { width: 100%; padding: 0.625rem; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
  button:hover { background: #4f46e5; }
  .hint { color: #64748b; font-size: 0.8rem; margin-top: 1rem; text-align: center; }
  .hint a { color: #818cf8; }
  .icon { font-size: 2.5rem; text-align: center; margin-bottom: 0.75rem; }
  .center { text-align: center; }
`
