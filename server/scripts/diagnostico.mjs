import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';

const ambienteCaminho = fileURLToPath(new URL('../.env', import.meta.url));
let ambiente;
try {
  ambiente = parse(readFileSync(ambienteCaminho, 'utf8'));
} catch {
  console.error('server/.env não foi encontrado.');
  process.exit(1);
}

const url = ambiente.SUPABASE_URL?.trim();
const publica = ambiente.SUPABASE_PUBLISHABLE_KEY?.trim();
const privada = ambiente.SUPABASE_SECRET_KEY?.trim();
if (
  !url?.startsWith('https://') ||
  !publica?.startsWith('sb_publishable_') ||
  !privada?.startsWith('sb_secret_')
) {
  console.error(
    'Variáveis ausentes ou com formato incorreto em server/.env. Rode npm run check:env.',
  );
  process.exit(1);
}

const db = createClient(url, privada, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (entrada, inicializacao) =>
      fetch(entrada, { ...inicializacao, signal: AbortSignal.timeout(10_000) }),
  },
});

try {
  const { count: quantidade, error: erro } = await db
    .from('ordem_servico')
    .select('id_os', { count: 'exact', head: true });
  if (erro) {
    console.error(
      `A consulta de OS falhou (${erro.code || 'sem código'}). Verifique se a chave secreta pertence ao projeto e continua ativa.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Supabase conectado: ${quantidade ?? 0} OS encontradas. A chave secreta funciona no backend.`,
    );
  }
} catch {
  console.error(
    'Não foi possível alcançar o Supabase em 10 segundos. Confira a rede do Codespaces e a URL do projeto.',
  );
  process.exitCode = 1;
}
