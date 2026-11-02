import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { resolveClientUrl } from './url-cliente.mjs';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectUrl = process.env.SUPABASE_URL;
const clientUrl = resolveClientUrl();
if (!token || !projectUrl || !clientUrl) {
  console.error('Preencha SUPABASE_ACCESS_TOKEN e SUPABASE_URL em server/.env.');
  process.exit(1);
}

let ref;
let siteUrl;
try {
  const project = new URL(projectUrl);
  siteUrl = new URL(clientUrl);
  if (project.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(project.hostname)) throw new Error();
  if (!['https:', 'http:'].includes(siteUrl.protocol) || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash || siteUrl.pathname !== '/') throw new Error();
  if (siteUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(siteUrl.hostname)) throw new Error();
  ref = project.hostname.split('.')[0];
} catch {
  console.error('Confira as URLs: SUPABASE_URL deve ser HTTPS do projeto; CLIENT_URL deve ser a origem do painel (localhost ou HTTPS), sem caminho.');
  process.exit(1);
}

const base = siteUrl.origin;
const recoveryRedirect = new URL('/redefinir-senha', base).toString();
const recoveryHtml = await readFile(fileURLToPath(new URL('../../supabase/email-templates/recuperacao.html', import.meta.url)), 'utf8');
const noticeHtml = await readFile(fileURLToPath(new URL('../../supabase/email-templates/senha-alterada.html', import.meta.url)), 'utf8');
if (!recoveryHtml.includes('{{ .TokenHash }}') || !recoveryHtml.includes('{{ .RedirectTo }}')) throw new Error('O template de recuperação perdeu as variáveis do link.');

const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Management API: HTTP ${response.status}. Confira o token, o SMTP do projeto e as permissões de Auth Config.`);
  return response.json();
}

const current = await request('GET');
if (!current.smtp_host || !current.smtp_port || !current.smtp_user || !current.smtp_admin_email) {
  throw new Error('Configure e teste um SMTP válido em Authentication → Emails → SMTP Settings antes de publicar o HTML.');
}
const senderDomain = String(current.smtp_admin_email).trim().split('@')[1]?.toLowerCase();
if (/\bresend\./i.test(String(current.smtp_host)) &&
    ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com'].includes(senderDomain)) {
  throw new Error(`O SMTP da Resend não pode enviar como @${senderDomain} sem verificar esse domínio. Troque o remetente por um domínio verificado ou use o SMTP da conta de email antes de testar os envios.`);
}
const keys = [
  'site_url', 'uri_allow_list',
  'mailer_subjects_recovery', 'mailer_templates_recovery_content',
  'mailer_notifications_password_changed_enabled',
  'mailer_subjects_password_changed_notification',
  'mailer_templates_password_changed_notification_content',
];
const backup = Object.fromEntries(keys.map(key => [key, current[key] ?? null]));
const backupPath = fileURLToPath(new URL('../auth-email-config-backup.json', import.meta.url));
try {
  await writeFile(backupPath, JSON.stringify(backup, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Configuração anterior salva em server/auth-email-config-backup.json.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Backup anterior preservado em server/auth-email-config-backup.json.');
}

const redirects = new Set(String(current.uri_allow_list || '').split(',').map(value => value.trim()).filter(Boolean));
redirects.add(recoveryRedirect);
const desired = {
  site_url: base,
  uri_allow_list: [...redirects].join(','),
  mailer_subjects_recovery: 'Estação Motos | Crie sua nova senha',
  mailer_templates_recovery_content: recoveryHtml,
  mailer_notifications_password_changed_enabled: true,
  mailer_subjects_password_changed_notification: 'Estação Motos | Sua senha foi alterada',
  mailer_templates_password_changed_notification_content: noticeHtml,
};
await request('PATCH', desired);
const saved = await request('GET');
const different = Object.entries(desired).filter(([key, value]) => saved[key] !== value).map(([key]) => key);
if (different.length) throw new Error(`A configuração não foi confirmada pela API: ${different.join(', ')}.`);
console.log('Templates claros e notificação de senha alterada publicados e conferidos.');
console.log(`Endereço de recuperação autorizado: ${recoveryRedirect}`);
console.log('Faça um envio real para verificar também o SMTP e a chegada à caixa de entrada.');
