import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { SUPABASE_SECRET_KEY } from '../config/conexao.js';

function chave() {
  if (!SUPABASE_SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY é necessária para proteger solicitações de acesso.');
  return createHmac('sha256', SUPABASE_SECRET_KEY).update('estacao-motos:funcionario-solicitacao:v1').digest();
}

export function cifrarSenhaFuncionario(senha: string) {
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', chave(), iv);
  const conteudo = Buffer.concat([cifra.update(senha, 'utf8'), cifra.final()]);
  return { senha_cifrada: conteudo.toString('base64'), senha_iv: iv.toString('base64'), senha_tag: cifra.getAuthTag().toString('base64') };
}

export function decifrarSenhaFuncionario(payload: Record<string, unknown>) {
  const cifra = createDecipheriv('aes-256-gcm', chave(), Buffer.from(String(payload.senha_iv ?? ''), 'base64'));
  cifra.setAuthTag(Buffer.from(String(payload.senha_tag ?? ''), 'base64'));
  return Buffer.concat([
    cifra.update(Buffer.from(String(payload.senha_cifrada ?? ''), 'base64')),
    cifra.final(),
  ]).toString('utf8');
}
