import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { getEnv } from '../../scripts/env.mjs';
import { origensClienteConfiaveis, resolverUrlCliente } from '../../scripts/url-cliente.mjs';

// Ambiente carregado antes de criar qualquer cliente do banco.
config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
export const PORT = Number(process.env.PORT || 3001);

export const CLIENT_URL = resolverUrlCliente();

export const CLIENT_ORIGINS = origensClienteConfiaveis();

export const SUPABASE_URL = getEnv().SUPABASE_URL;

export const SUPABASE_PUBLISHABLE_KEY = getEnv().SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_SECRET_KEY =
  getEnv().SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function servicoExternoIndisponivel(erro: { status?: number; name?: string } | null) {
  return !!erro && ((erro.status ?? 0) >= 500 || erro.name === 'AuthRetryableFetchError');
}

export function createSupabaseClient(tokenAcesso?: string) {
  return createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: tokenAcesso
      ? {
          headers: {
            Authorization: `Bearer ${tokenAcesso}`,
          },
        }
      : undefined,
  });
}

export function createSupabaseAdmin() {
  if (!SUPABASE_SECRET_KEY) return null;

  return createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
  throw new Error('Configure a URL e a chave publica do Supabase.');
