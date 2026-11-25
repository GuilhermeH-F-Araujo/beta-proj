// A sessao usa cookies HttpOnly. Tokens vencidos podem ser renovados no servidor.
// Nunca devolva a chave privada do Supabase ao navegador.
import express from 'express';
import { administrador, lerAcesso } from '../cargos.js';
import {
  createSupabaseAdmin,
  createSupabaseClient,
  servicoExternoIndisponivel,
} from '../config/conexao.js';

export const conexaoSegura = process.env.NODE_ENV === 'production';

export const cookieOptions = {
  httpOnly: true,
  secure: conexaoSegura,
  sameSite: 'lax' as const,
  path: '/',
};

export function limparCookiesSessao(res: express.Response) {
  res.clearCookie('admin-confirmacao', cookieOptions);
  res.clearCookie('admin-confirmacao-ambos', cookieOptions);
  res.clearCookie('sb-access-token', cookieOptions);
  res.clearCookie('sb-refresh-token', cookieOptions);
  res.clearCookie('sb-remember', cookieOptions);
}

export function setCookiesSessao(
  res: express.Response,
  sessao: { access_token: string; refresh_token: string; expires_in: number },
  lembrar: boolean,
) {
  res.cookie('sb-access-token', sessao.access_token, {
    ...cookieOptions,
    maxAge: lembrar ? Math.max(1, sessao.expires_in) * 1000 : undefined,
  });
  res.cookie('sb-refresh-token', sessao.refresh_token, {
    ...cookieOptions,
    maxAge: lembrar ? 30 * 24 * 60 * 60 * 1000 : undefined,
  });
  if (lembrar) {
    res.cookie('sb-remember', '1', { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 });
  } else {
    res.clearCookie('sb-remember', cookieOptions);
  }
}

// Cada requisicao autenticada consultava o Auth Admin para ver se a conta foi bloqueada.
// Um cache curto evita essa ida extra ao Supabase; bloquear alguem leva no maximo
// BLOQUEIO_TTL_MS para valer (e chamar esquecerBloqueio aplica na hora).
const BLOQUEIO_TTL_MS = 30_000;
const LIMITE_CACHE_BLOQUEIO = 5_000;
const cacheBloqueio = new Map<string, { bloqueada: boolean; expira: number }>();
export function esquecerBloqueio(idUsuario?: string) {
  if (idUsuario) cacheBloqueio.delete(idUsuario);
  else cacheBloqueio.clear();
}
export async function contaEstaBloqueada(idUsuario: string) {
  const emCache = cacheBloqueio.get(idUsuario);
  if (emCache && emCache.expira > Date.now()) return emCache.bloqueada;
  const bloqueada = await consultarBloqueio(idUsuario);
  if (cacheBloqueio.size >= LIMITE_CACHE_BLOQUEIO) cacheBloqueio.clear();
  cacheBloqueio.set(idUsuario, { bloqueada, expira: Date.now() + BLOQUEIO_TTL_MS });
  return bloqueada;
}
async function consultarBloqueio(idUsuario: string) {
  const privilegiado = createSupabaseAdmin();
  if (!privilegiado) return false;
  const { data: dados, error: erro } = await privilegiado.auth.admin.getUserById(idUsuario);
  if (erro) throw new Error(`Não foi possível verificar o acesso da conta: ${erro.message}`);
  const bannedAte = Date.parse(
    (dados.user as typeof dados.user & { banned_until?: string | null })?.banned_until ?? '',
  );
  return Number.isFinite(bannedAte) && bannedAte > Date.now();
}

export async function obterUsuarioAutenticado(req: express.Request, res: express.Response) {
  const tokenAcesso = req.cookies['sb-access-token'];
  const tokenRenovacao = req.cookies['sb-refresh-token'];
  if (!tokenAcesso && !tokenRenovacao) return null;

  const cliente = createSupabaseClient();
  if (tokenAcesso) {
    const { data: dados, error: erro } = await cliente.auth.getUser(tokenAcesso);
    if (!erro && dados.user) {
      if (await contaEstaBloqueada(dados.user.id)) {
        limparCookiesSessao(res);
        return null;
      }
      return { user: dados.user, accessToken: tokenAcesso };
    }
    if (servicoExternoIndisponivel(erro))
      throw new Error('Supabase Auth indisponível ao verificar sessão.');
  }

  if (tokenRenovacao) {
    const { data: dados, error: erro } = await cliente.auth.refreshSession({
      refresh_token: tokenRenovacao,
    });
    if (!erro && dados.session && dados.user) {
      if (await contaEstaBloqueada(dados.user.id)) {
        limparCookiesSessao(res);
        return null;
      }
      setCookiesSessao(res, dados.session, req.cookies['sb-remember'] === '1');
      return { user: dados.user, accessToken: dados.session.access_token };
    }
    if (servicoExternoIndisponivel(erro))
      throw new Error('Supabase Auth indisponível ao renovar sessão.');
  }

  limparCookiesSessao(res);
  return null;
}

export function normalizarEmail(valor: string) {
  return valor.trim().toLowerCase();
}

export async function obterAdministradorAutorizado(tokenAcesso: string, idUsuario: string) {
  const restritoCliente = createSupabaseAdmin() || createSupabaseClient(tokenAcesso);

  const { data: perfil, error: erro } = await restritoCliente
    .from('funcionario')
    .select('id_funcionario, nome, cargo, email, telefone, perfil_acesso, auth_user_id, situacao')
    .eq('auth_user_id', idUsuario)
    .maybeSingle();

  if (erro) throw new Error(`Consulta ao perfil administrativo falhou: ${erro.message}`);
  if (!perfil || ['desligado', 'afastado', 'ferias'].includes(perfil.situacao ?? '')) return null;

  const privilegiado = createSupabaseAdmin();
  if (!privilegiado) return null;
  const acesso = await lerAcesso(privilegiado, perfil);
  if (acesso && !acesso.administrador && perfil.situacao !== 'ativo') return null;
  return acesso ? { ...perfil, acesso } : null;
}

export async function emailAdministradorPodeRecuperar(email: string) {
  const privilegiado = createSupabaseAdmin();
  if (!privilegiado) {
    // Sem chave secreta nao e possivel consultar RLS-protected funcionario antes
    // de autenticar. Nesse caso mantemos a resposta neutra do Supabase Auth.
    return null;
  }

  const { data: perfil, error: erro } = await privilegiado
    .from('funcionario')
    .select('id_funcionario, auth_user_id, cargo, perfil_acesso, email, situacao')
    .ilike('email', email)
    .maybeSingle();

  if (erro || !perfil?.auth_user_id) return false;
  if (!administrador(perfil) && perfil.situacao !== 'ativo') return false;
  if (!(await lerAcesso(privilegiado, perfil))) return false;

  const { data: dados, error: autenticacaoErro } = await privilegiado.auth.admin.getUserById(
    perfil.auth_user_id,
  );
  if (autenticacaoErro || !dados.user?.email) return false;

  return normalizarEmail(dados.user.email) === normalizarEmail(email);
}
