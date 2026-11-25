import { idSessaoVerificada, protegerOperacao } from './confirmacao.js';
// Toda rota protegida passa por esta funcao antes de acessar o banco.
// A chave privada nao substitui a verificacao de identidade e de permissoes.
import express from 'express';
import { permitirRequisicao } from '../cargos.js';
import { createSupabaseAdmin } from '../config/conexao.js';
import { obterAdministradorAutorizado, obterUsuarioAutenticado } from './sessao.js';

export async function autorizarAcessoBanco(req: express.Request, res: express.Response) {
  const sessao = await obterUsuarioAutenticado(req, res);
  if (!sessao) {
    res.status(401).json({ message: 'Sessão expirada. Entre novamente.' });
    return null;
  }
  const perfil = await obterAdministradorAutorizado(sessao.accessToken, sessao.user.id);
  if (!perfil) {
    res.status(403).json({ message: 'Sua conta não possui acesso ativo ao painel.' });
    return null;
  }
  res.locals.acesso = perfil.acesso;
  res.locals.adminUserId = sessao.user.id;
  res.locals.adminNome = perfil.nome;
  res.locals.adminCargo = perfil.cargo;
  res.locals.adminEmail = sessao.user.email;
  res.locals.adminSessionId = idSessaoVerificada(sessao.accessToken);
  if (!permitirRequisicao(perfil.acesso, req.method, req.originalUrl, req.body)) {
    res
      .status(403)
      .json({ message: 'Seu cargo não permite esta ação.', code: 'PERMISSION_DENIED' });
    return null;
  }
  const privilegiado = createSupabaseAdmin();
  if (!privilegiado) {
    res
      .status(503)
      .json({ message: 'Configure SUPABASE_SECRET_KEY no server/.env para consultar as OS.' });
    return null;
  }
  if (!(await protegerOperacao(req, res, privilegiado))) return null;
  return privilegiado;
}
