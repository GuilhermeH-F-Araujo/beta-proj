import { getEnv } from './env.mjs';
// O endereco publico da porta em Codespaces muda entre workspaces.
// Use apenas as variaveis fornecidas pelo proprio Codespaces; nunca confie
// no Origin/Host enviado por quem chamou a API para criar links de email.
export function resolverUrlCliente(ambiente = process.env) {
  const configurado = getEnv(ambiente).URL_CLIENTE?.trim();
  const nome = ambiente.CODESPACE_NAME?.trim();
  const dominio = (ambiente.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev').trim();

  if (nome && /^[a-z0-9-]+$/.test(nome) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(dominio)) {
    const encaminhado = `https://${nome}-5173.${dominio}`;
    let anterior;
    try {
      anterior = configurado ? new URL(configurado) : undefined;
    } catch {
      /* A verificacao de ambiente informa a URL invalida. */
    }
    // Uma URL personalizada de producao continua explicita. localhost e
    // links de outros Codespaces sao configuracoes de desenvolvimento antigas.
    if (
      !configurado ||
      (anterior &&
        ((anterior.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(anterior.hostname)) ||
          (anterior.protocol === 'https:' &&
            anterior.hostname.endsWith(`.${dominio}`) &&
            anterior.hostname.endsWith(`-5173.${dominio}`))))
    )
      return encaminhado;
  }

  return configurado || ambiente.RENDER_EXTERNAL_URL?.trim() || 'http://localhost:5173';
}

export function origensClienteConfiaveis(ambiente = process.env) {
  const origens = new Set([new URL(resolverUrlCliente(ambiente)).origin]);
  const nome = ambiente.CODESPACE_NAME?.trim();
  const dominio = (ambiente.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev').trim();
  if (nome && /^[a-z0-9-]+$/.test(nome) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(dominio)) {
    origens.add(`https://${nome}-5173.${dominio}`);
  }
  if (ambiente.NODE_ENV !== 'production') {
    origens.add('http://localhost:5173');
    origens.add('http://127.0.0.1:5173');
  }
  return origens;
}

export function alteracaoPainelConfiavel(origem, origemNavegacao, ambiente = process.env) {
  if (origemNavegacao === 'cross-site') return false;
  if (!origem) return true;
  return origensClienteConfiaveis(ambiente).has(origem) || origemNavegacao === 'same-origin';
}
