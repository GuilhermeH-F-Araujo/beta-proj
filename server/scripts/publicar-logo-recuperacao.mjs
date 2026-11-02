import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Preencha SUPABASE_URL e SUPABASE_SECRET_KEY em server/.env antes de publicar a logo.');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false } });
const bucket = 'brand-assets';
const name = 'estacao-motos-logo.png';
const { data: existing, error: listError } = await client.storage.listBuckets();
if (listError) throw listError;
const found = existing?.find(item => item.id === bucket);
if (found && !found.public) throw new Error(`O bucket ${bucket} já existe e é privado. Configure-o como público antes de continuar.`);
if (!found) {
  const created = await client.storage.createBucket(bucket, { public: true, fileSizeLimit: '1MB', allowedMimeTypes: ['image/png'] });
  if (created.error) throw created.error;
}

const logo = await readFile(fileURLToPath(new URL('../../client/public/assets/estacao-motos-logo.png', import.meta.url)));
const upload = await client.storage.from(bucket).upload(name, logo, { contentType: 'image/png', upsert: true, cacheControl: '3600' });
if (upload.error) throw upload.error;
const publicUrl = client.storage.from(bucket).getPublicUrl(name).data.publicUrl;
console.log(`Logo publicada: ${publicUrl}`);
console.log('A URL da logo no modelo supabase/email-templates/recuperacao.html deve ser igual à URL acima.');
