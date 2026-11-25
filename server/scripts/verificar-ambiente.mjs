import { getEnv } from './env.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { resolverUrlCliente } from './url-cliente.mjs';

const ambienteCaminho = fileURLToPath(new URL('../.env', import.meta.url));
let conteudos;

try {
  conteudos = readFileSync(ambienteCaminho, 'utf8');
} catch {
  console.error('Não encontrei server/.env. Copie server/.env.example para server/.env.');
  process.exit(1);
}

const chaveLinhasTexto = conteudos
  .split(/\r?\n/)
  .filter((linha) => /^\s*(?:CHAVE_PRIVADA_SUPABASE|SUPABASE_SECRET_KEY)\s*=/.test(linha));
if (chaveLinhasTexto.length !== 1) {
  console.error(
    `Esperava uma única linha SUPABASE_SECRET_KEY= em server/.env; encontrei ${chaveLinhasTexto.length}.`,
  );
  process.exit(1);
}

const privada = getEnv(parse(conteudos)).CHAVE_PRIVADA_SUPABASE?.trim();
if (!privada || !privada.startsWith('sb_secret_')) {
  console.error('SUPABASE_SECRET_KEY não foi preenchida com uma chave sb_secret_ em server/.env.');
  process.exit(1);
}

const valores = getEnv(parse(conteudos));
if (
  !valores.URL_SUPABASE?.startsWith('https://') ||
  !valores.CHAVE_PUBLICA_SUPABASE?.startsWith('sb_publishable_')
) {
  console.error('SUPABASE_URL ou SUPABASE_PUBLISHABLE_KEY ausente/incorreta em server/.env.');
  process.exit(1);
}

try {
  const clienteCaminho = fileURLToPath(new URL('../../client/.env', import.meta.url));
  if (parse(readFileSync(clienteCaminho, 'utf8')).VITE_API_URL?.trim()) {
    console.error(
      'Em desenvolvimento, deixe VITE_API_URL= vazio em client/.env para usar o proxy do Vite.',
    );
    process.exit(1);
  }
} catch (erro) {
  if (erro?.code !== 'ENOENT') throw erro;
}

const clienteUrl = resolverUrlCliente({ ...process.env, ...valores });
try {
  const validadoUrl = new URL(clienteUrl);
  if (validadoUrl.origin !== clienteUrl || !['http:', 'https:'].includes(validadoUrl.protocol))
    throw new Error();
} catch {
  console.error('CLIENT_URL deve conter somente a origem do painel, sem caminho nem barra final.');
  process.exit(1);
}
console.log(`Configuração local encontrada. Endereço do painel: ${clienteUrl}`);
console.log(
  'Rode npm run doctor para testar a chave no Supabase; reinicie npm run dev após editar .env.',
);
