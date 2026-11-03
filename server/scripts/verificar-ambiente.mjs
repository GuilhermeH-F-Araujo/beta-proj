import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { resolveClientUrl } from './url-cliente.mjs';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
let contents;

try {
  contents = readFileSync(envPath, 'utf8');
} catch {
  console.error('Não encontrei server/.env. Copie server/.env.example para server/.env.');
  process.exit(1);
}

const keyLines = contents.split(/\r?\n/).filter(line => /^\s*SUPABASE_SECRET_KEY\s*=/.test(line));
if (keyLines.length !== 1) {
  console.error(`Esperava uma única linha SUPABASE_SECRET_KEY= em server/.env; encontrei ${keyLines.length}.`);
  process.exit(1);
}

const secret = parse(contents).SUPABASE_SECRET_KEY?.trim();
if (!secret || !secret.startsWith('sb_secret_')) {
  console.error('SUPABASE_SECRET_KEY não foi preenchida com uma chave sb_secret_ em server/.env.');
  process.exit(1);
}

const values = parse(contents);
if (!values.SUPABASE_URL?.startsWith('https://') || !values.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  console.error('SUPABASE_URL ou SUPABASE_PUBLISHABLE_KEY ausente/incorreta em server/.env.');
  process.exit(1);
}

try {
  const clientPath = fileURLToPath(new URL('../../client/.env', import.meta.url));
  if (parse(readFileSync(clientPath, 'utf8')).VITE_API_URL?.trim()) {
    console.error('Em desenvolvimento, deixe VITE_API_URL= vazio em client/.env para usar o proxy do Vite.');
    process.exit(1);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const clientUrl = resolveClientUrl({ ...process.env, ...values });
try {
  const parsedUrl = new URL(clientUrl);
  if (parsedUrl.origin !== clientUrl || !['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
} catch {
  console.error('CLIENT_URL deve conter somente a origem do painel, sem caminho nem barra final.');
  process.exit(1);
}
console.log(`Configuração local encontrada. Endereço do painel: ${clientUrl}`);
console.log('Rode npm run doctor para testar a chave no Supabase; reinicie npm run dev após editar .env.');
