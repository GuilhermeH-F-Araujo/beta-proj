import testar from 'node:test';
import verificar from 'node:assert/strict';
import { getEnv } from './env.mjs';
import { resolverUrlCliente } from './url-cliente.mjs';

testar('nomes em portugues e configuracoes anteriores produzem o mesmo ambiente', () => {
  const anterior = getEnv({
    SUPABASE_URL: 'https://exemplo.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publica',
    SUPABASE_SECRET_KEY: 'privada',
    CLIENT_URL: 'https://painel.exemplo.com',
  });
  const atual = getEnv({
    URL_SUPABASE: 'https://exemplo.supabase.co',
    CHAVE_PUBLICA_SUPABASE: 'publica',
    CHAVE_PRIVADA_SUPABASE: 'privada',
    URL_CLIENTE: 'https://painel.exemplo.com',
  });
  for (const nome of [
    'URL_SUPABASE',
    'CHAVE_PUBLICA_SUPABASE',
    'CHAVE_PRIVADA_SUPABASE',
    'URL_CLIENTE',
  ])
    verificar.equal(atual[nome], anterior[nome]);
  verificar.equal(resolverUrlCliente({ URL_CLIENTE: atual.URL_CLIENTE }), atual.URL_CLIENTE);
});

testar('nome preferido tem prioridade e o adaptador nao modifica a entrada', () => {
  const entrada = {
    URL_SUPABASE: 'nova',
    SUPABASE_URL: 'anterior',
    SUPABASE_SERVICE_ROLE_KEY: 'servico',
  };
  const ambiente = getEnv(entrada);
  verificar.equal(ambiente.URL_SUPABASE, 'nova');
  verificar.equal(ambiente.CHAVE_PRIVADA_SUPABASE, 'servico');
  verificar.equal(entrada.CHAVE_PRIVADA_SUPABASE, undefined);
});
