// O endereço público da porta em Codespaces muda entre workspaces.
// Use apenas as variáveis fornecidas pelo próprio Codespaces; nunca confie
// no Origin/Host enviado por quem chamou a API para criar links de email.
export function resolveClientUrl(env = process.env) {
  const configured = env.CLIENT_URL?.trim();
  const name = env.CODESPACE_NAME?.trim();
  const domain = (env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev').trim();

  if (name && /^[a-z0-9-]+$/.test(name) &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) {
    const forwarded = `https://${name}-5173.${domain}`;
    let previous;
    try { previous = configured ? new URL(configured) : undefined; } catch { /* Check-env reporta URL inválida. */ }
    // Uma URL personalizada de produção continua explícita. localhost e
    // links de outros Codespaces são configurações de desenvolvimento antigas.
    if (!configured || (previous && (
      (previous.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(previous.hostname)) ||
      (previous.protocol === 'https:' && previous.hostname.endsWith(`.${domain}`) && previous.hostname.endsWith(`-5173.${domain}`))
    ))) return forwarded;
  }

  const renderUrl = env.RENDER_EXTERNAL_URL?.trim();
  if (!configured && renderUrl) {
    try {
      const url = new URL(renderUrl);
      if (url.protocol === 'https:' && url.hostname.endsWith('.onrender.com')) return url.origin;
    } catch { /* Valor inválido será ignorado. */ }
  }

  return configured || 'http://localhost:5173';
}

export function trustedClientOrigins(env = process.env) {
  const origins = new Set([new URL(resolveClientUrl(env)).origin]);
  const name = env.CODESPACE_NAME?.trim();
  const domain = (env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev').trim();
  if (name && /^[a-z0-9-]+$/.test(name) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)) {
    origins.add(`https://${name}-5173.${domain}`);
  }
  if (env.NODE_ENV !== 'production') {
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }
  return origins;
}

export function isTrustedPanelMutation(origin, fetchSite, env = process.env) {
  if (fetchSite === 'cross-site') return false;
  if (!origin) return true;
  return trustedClientOrigins(env).has(origin) || fetchSite === 'same-origin';
}
