import { getEnv } from './env.mjs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const url = getEnv().SUPABASE_URL;
const chave = getEnv().SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error(
    'Preencha SUPABASE_URL e SUPABASE_SECRET_KEY em server/.env antes de publicar a logo.',
  );
  process.exit(1);
}

const cliente = createClient(url, chave, { auth: { persistSession: false } });
const repositorioArquivos = 'brand-assets';
const nome = 'estacao-motos-logo.png';
const { data: existente, error: listaErro } = await cliente.storage.listBuckets();
if (listaErro) throw listaErro;
const encontrado = existente?.find((item) => item.id === repositorioArquivos);
if (encontrado && !encontrado.public)
  throw new Error(
    `O bucket ${repositorioArquivos} já existe e é privado. Configure-o como público antes de continuar.`,
  );
if (!encontrado) {
  const criado = await cliente.storage.createBucket(repositorioArquivos, {
    public: true,
    fileSizeLimit: '1MB',
    allowedMimeTypes: ['image/png'],
  });
  if (criado.error) throw criado.error;
}

const logo = await readFile(
  fileURLToPath(new URL('../../client/public/assets/estacao-motos-logo.png', import.meta.url)),
);
const enviarArquivo = await cliente.storage
  .from(repositorioArquivos)
  .upload(nome, logo, { contentType: 'image/png', upsert: true, cacheControl: '3600' });
if (enviarArquivo.error) throw enviarArquivo.error;
const publicUrl = cliente.storage.from(repositorioArquivos).getPublicUrl(nome).data.publicUrl;
console.log(`Logo publicada: ${publicUrl}`);
console.log(
  'A URL da logo no modelo supabase/email-templates/recuperacao.html deve ser igual à URL acima.',
);
