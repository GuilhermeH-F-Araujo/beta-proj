import { getEnv } from './env.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { resolverUrlCliente } from './url-cliente.mjs';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projetoUrl = getEnv().SUPABASE_URL;
const clienteUrl = resolverUrlCliente();
if (!token || !projetoUrl || !clienteUrl) {
  console.error('Preencha SUPABASE_ACCESS_TOKEN e SUPABASE_URL em server/.env.');
  process.exit(1);
}

let referencia;
let siteUrl;
try {
  const projeto = new URL(projetoUrl);
  siteUrl = new URL(clienteUrl);
  if (projeto.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(projeto.hostname))
    throw new Error();
  if (
    !['https:', 'http:'].includes(siteUrl.protocol) ||
    siteUrl.username ||
    siteUrl.password ||
    siteUrl.search ||
    siteUrl.hash ||
    siteUrl.pathname !== '/'
  )
    throw new Error();
  if (siteUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(siteUrl.hostname))
    throw new Error();
  referencia = projeto.hostname.split('.')[0];
} catch {
  console.error(
    'Confira as URLs: SUPABASE_URL deve ser HTTPS do projeto; CLIENT_URL deve ser a origem do painel (localhost ou HTTPS), sem caminho.',
  );
  process.exit(1);
}

const base = siteUrl.origin;
const recoveryRedirect = new URL('/redefinir-senha', base).toString();
const recoveryHtml = await readFile(
  fileURLToPath(new URL('../../supabase/email-templates/recuperacao.html', import.meta.url)),
  'utf8',
);
const avisoHtml = await readFile(
  fileURLToPath(new URL('../../supabase/email-templates/senha-alterada.html', import.meta.url)),
  'utf8',
);
if (!recoveryHtml.includes('{{ .TokenHash }}') || !recoveryHtml.includes('{{ .RedirectTo }}'))
  throw new Error('O template de recuperação perdeu as variáveis do link.');

const rota = `https://api.supabase.com/v1/projects/${referencia}/config/auth`;
async function request(metodo, corpo) {
  const response = await fetch(rota, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  if (!response.ok)
    throw new Error(
      `Management API: HTTP ${response.status}. Confira o token, o SMTP do projeto e as permissões de Auth Config.`,
    );
  return response.json();
}

const atual = await request('GET');
if (!atual.smtp_host || !atual.smtp_port || !atual.smtp_user || !atual.smtp_admin_email) {
  throw new Error(
    'Configure e teste um SMTP válido em Authentication → Emails → SMTP Settings antes de publicar o HTML.',
  );
}
const dominioRemetente = String(atual.smtp_admin_email).trim().split('@')[1]?.toLowerCase();
if (
  /\bresend\./i.test(String(atual.smtp_host)) &&
  ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'].includes(
    dominioRemetente,
  )
) {
  throw new Error(
    `O SMTP da Resend não pode enviar como @${dominioRemetente} sem verificar esse domínio. Troque o remetente por um domínio verificado ou use o SMTP da conta de email antes de testar os envios.`,
  );
}
const chaves = [
  'site_url',
  'uri_allow_list',
  'mailer_subjects_recovery',
  'mailer_templates_recovery_content',
  'mailer_notifications_password_changed_enabled',
  'mailer_subjects_password_changed_notification',
  'mailer_templates_password_changed_notification_content',
];
const copiaSeguranca = Object.fromEntries(chaves.map((chave) => [chave, atual[chave] ?? null]));
const copiaSegurancaCaminho = fileURLToPath(
  new URL('../auth-email-config-backup.json', import.meta.url),
);
try {
  await writeFile(copiaSegurancaCaminho, JSON.stringify(copiaSeguranca, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  console.log('Configuração anterior salva em server/auth-email-config-backup.json.');
} catch (erro) {
  if (erro.code !== 'EEXIST') throw erro;
  console.log('Backup anterior preservado em server/auth-email-config-backup.json.');
}

const redirecionamentos = new Set(
  String(atual.uri_allow_list || '')
    .split(',')
    .map((valor) => valor.trim())
    .filter(Boolean),
);
redirecionamentos.add(recoveryRedirect);
const desejado = {
  site_url: base,
  uri_allow_list: [...redirecionamentos].join(','),
  mailer_subjects_recovery: 'Estação Motos | Crie sua nova senha',
  mailer_templates_recovery_content: recoveryHtml,
  mailer_notifications_password_changed_enabled: true,
  mailer_subjects_password_changed_notification: 'Estação Motos | Sua senha foi alterada',
  mailer_templates_password_changed_notification_content: avisoHtml,
};
await request('PATCH', desejado);
const salvo = await request('GET');
const diferente = Object.entries(desejado)
  .filter(([chave, valor]) => salvo[chave] !== valor)
  .map(([chave]) => chave);
if (diferente.length)
  throw new Error(`A configuração não foi confirmada pela API: ${diferente.join(', ')}.`);
console.log('Templates claros e notificação de senha alterada publicados e conferidos.');
console.log(`Endereço de recuperação autorizado: ${recoveryRedirect}`);
console.log('Faça um envio real para verificar também o SMTP e a chegada à caixa de entrada.');
