import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
let env;
try {
  env = parse(readFileSync(envPath, 'utf8'));
} catch {
  console.error('server/.env não foi encontrado.');
  process.exit(1);
}

const url = env.SUPABASE_URL?.trim();
const publishable = env.SUPABASE_PUBLISHABLE_KEY?.trim();
const secret = env.SUPABASE_SECRET_KEY?.trim();
if (!url?.startsWith('https://') || !publishable?.startsWith('sb_publishable_') || !secret?.startsWith('sb_secret_')) {
  console.error('Variáveis ausentes ou com formato incorreto em server/.env. Rode npm run check:env.');
  process.exit(1);
}

const db = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) },
});

try {
  const { count, error } = await db.from('ordem_servico').select('id_os', { count: 'exact', head: true });
  if (error) {
    console.error(`A consulta de OS falhou (${error.code || 'sem código'}). Verifique se a chave secreta pertence ao projeto e continua ativa.`);
    process.exitCode = 1;
  } else {
    console.log(`Supabase conectado: ${count ?? 0} OS encontradas. A chave secreta funciona no backend.`);
  }
} catch {
  console.error('Não foi possível alcançar o Supabase em 10 segundos. Confira a rede do Codespaces e a URL do projeto.');
  process.exitCode = 1;
}
