import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type express from 'express';
import { z } from 'zod';
import {
  createSupabaseAdmin,
  createSupabaseClient,
  servicoExternoIndisponivel,
} from '../config/conexao.js';
import { cookieOptions, limparCookiesSessao, setCookiesSessao } from './sessao.js';
import {
  contextoConfirmacao,
  exigeConfirmacao,
  podeGerenciarAdministrador,
  rotaNormalizada,
} from './politicaAdministrativa.js';
import { registrarAtividade } from '../services/logs.js';

export const minutosConfirmacaoSenha = 15;
export const minutosConfirmacaoAutenticador = 30;
export const resumoToken = (valor: string) => createHash('sha256').update(valor).digest('hex');

function salvarProvaConfirmacao(
  res: express.Response,
  prova: string,
  minutos: number,
  ambosFatores = false,
) {
  res.cookie('admin-confirmacao', prova, { ...cookieOptions, maxAge: minutos * 60_000 });
  if (ambosFatores)
    res.cookie('admin-confirmacao-ambos', prova, {
      ...cookieOptions,
      maxAge: minutos * 60_000,
    });
  else res.clearCookie('admin-confirmacao-ambos', cookieOptions);
}

// O token so e lido depois de obterUsuarioAutenticado validar sua identidade no Auth.
export function idSessaoVerificada(token: string): string | null {
  try {
    return z
      .uuid()
      .parse(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).session_id);
  } catch {
    return null;
  }
}

async function encerrarSessaoAposFalha(req: express.Request, res: express.Response) {
  const token = req.cookies['sb-access-token'];
  const admin = createSupabaseAdmin();
  if (token && admin) {
    const { error } = await admin.auth.admin.signOut(token, 'local');
    if (error) console.error('[security/confirm/logout]', error.code);
  }
  limparCookiesSessao(res);
}

export async function protegerOperacao(
  req: express.Request,
  res: express.Response,
  db: SupabaseClient,
) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const rota = rotaNormalizada(req.originalUrl);
  const rotaAdmin = /^\/api\/admin\/security\/admins(?:\/|$)/.test(rota);
  if (rotaAdmin && !['dono', 'superadministrador'].includes(res.locals.acesso.nivel ?? '')) {
    res.status(403).json({
      code: 'ADMIN_PROTECTED',
      message: 'Somente superadministradores e a dona podem decidir acessos administrativos.',
    });
    return false;
  }
  if (
    rotaAdmin &&
    req.method === 'PATCH' &&
    req.body?.nivel === 'superadministrador' &&
    res.locals.acesso.nivel !== 'dono'
  ) {
    res.status(403).json({
      code: 'ADMIN_PROTECTED',
      message: 'Somente a dona pode promover alguém a superadministrador.',
    });
    return false;
  }
  if (
    /^\/api\/admin\/security\/employee-requests\/[^/]+$/.test(rota) &&
    !['dono', 'superadministrador'].includes(res.locals.acesso.nivel ?? '')
  ) {
    res.status(403).json({
      code: 'EMPLOYEE_APPROVAL_PROTECTED',
      message: 'Somente superadministradores e a dona podem aprovar funcionários.',
    });
    return false;
  }
  let sensivel = exigeConfirmacao(req.method, rota, req.body);
  const decisaoFuncionario =
    req.method === 'PATCH' &&
    /^\/api\/admin\/security\/employee-requests\/[^/]+(?:\?|$)/.test(rota);
  if (decisaoFuncionario) {
    const sessaoAtual = res.locals.adminSessionId;
    if (sessaoAtual) {
      const { data: credito, error } = await db.rpc('consumir_credito_aprovacao_funcionario', {
        p_usuario: res.locals.adminUserId,
        p_sessao: sessaoAtual,
      });
      if (error) throw error;
      if (credito) return true;
    }
    res.status(428).json({
      code: 'REAUTH_REQUIRED',
      operation: {
        ...contextoConfirmacao(rota, req.method),
        requireAuthenticator: true,
      },
      message: 'Confirme sua senha e o código do Google Authenticator para decidir este cadastro.',
    });
    return false;
  }
  const alvo = /^\/api\/employees\/(\d+)(?:\/|$)/.exec(rota);
  if (alvo) {
    const { data: funcionario, error } = await db
      .from('funcionario')
      .select('auth_user_id,cargo,perfil_acesso')
      .eq('id_funcionario', Number(alvo[1]))
      .maybeSingle();
    if (error) throw error;
    if (funcionario?.cargo === 'Administrador' && funcionario.perfil_acesso === 'Administrador') {
      sensivel = true;
      const { data: autoridade, error: erroNivel } = await db
        .from('admin_autoridade')
        .select('nivel')
        .eq('id_usuario', funcionario.auth_user_id)
        .maybeSingle();
      if (erroNivel) throw erroNivel;
      const nivelAlvo = autoridade?.nivel || 'administrador';
      if (!podeGerenciarAdministrador(res.locals.acesso.nivel ?? 'administrador', nivelAlvo)) {
        res.status(403).json({
          code: 'ADMIN_PROTECTED',
          message:
            'Esse administrador só pode ser alterado por uma autoridade superior. Use Meu perfil para seus próprios dados.',
        });
        return false;
      }
    }
  }
  if (!sensivel) return true;
  const promovendoSuperadministrador =
    req.method === 'PATCH' &&
    /^\/api\/admin\/security\/admins\/[^/]+(?:\?|$)/.test(rota) &&
    req.body?.nivel === 'superadministrador';
  const sessao = res.locals.adminSessionId;
  const prova = req.cookies['admin-confirmacao'];
  const provaAmbos = req.cookies['admin-confirmacao-ambos'];
  if (sessao && typeof prova === 'string' && /^[a-f0-9]{64}$/.test(prova)) {
    const { data: confirmada, error } = await db.rpc('validar_confirmacao_admin', {
      p_usuario: res.locals.adminUserId,
      p_sessao: sessao,
      p_hash: resumoToken(prova),
    });
    if (error) throw error;
    if (confirmada && (!promovendoSuperadministrador || provaAmbos === prova)) return true;
  }
  const operacao = promovendoSuperadministrador
    ? {
        titulo: 'Confirmar promoção de acesso',
        descricao:
          'Confirme sua senha e o código do Google Authenticator antes de promover esta pessoa a superadministrador.',
        requireAuthenticator: true,
      }
    : contextoConfirmacao(rota, req.method);
  res.status(428).json({
    code: 'REAUTH_REQUIRED',
    operation: operacao,
    message: 'Confirme sua senha para autorizar esta alteração sensível.',
  });
  return false;
}

type Autorizar = (req: express.Request, res: express.Response) => Promise<SupabaseClient | null>;
export function registrarConfirmacao(app: express.Express, autorizar: Autorizar) {
  app.post('/api/admin/security/confirm', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const entrada = z
      .object({
        password: z.string().min(1).max(256).optional(),
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        method: z.enum(['password', 'authenticator', 'both']).optional(),
        employeeApproval: z.boolean().optional(),
        requireAuthenticator: z.boolean().optional(),
        phase: z.enum(['password']).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (
      !entrada.success ||
      (!entrada.data.password && entrada.data.method !== 'authenticator') ||
      (entrada.data.method === 'authenticator' && !entrada.data.code) ||
      (entrada.data.method === 'both' && !entrada.data.code) ||
      ((entrada.data.requireAuthenticator || entrada.data.employeeApproval) &&
        entrada.data.method !== 'both')
    )
      return res.status(400).json({ message: 'Informe sua senha e o código de segurança.' });
    const usuario = res.locals.adminUserId as string;
    const sessao = res.locals.adminSessionId as string | null;
    if (!sessao)
      return res.status(401).json({ message: 'Entre novamente para confirmar sua identidade.' });
    const tentativa = randomUUID();
    const { data: reserva, error } = await db.rpc('reservar_confirmacao_admin', {
      p_usuario: usuario,
      p_sessao: sessao,
      p_tentativa: tentativa,
    });
    if (error) throw error;
    if (!reserva?.permitido) {
      const espera = Math.max(1, Number(reserva?.espera ?? 30));
      res.setHeader('Retry-After', String(espera));
      return res.status(429).json({
        code: 'REAUTH_WAIT',
        retryAfterSeconds: espera,
        message: `Aguarde ${Math.ceil(espera / 60)} minuto(s) antes de confirmar novamente.`,
      });
    }
    if (entrada.data.method === 'authenticator') {
      const clienteSessao = await clienteDaSessao(req, res);
      if (!clienteSessao) return;
      const { data: fatores, error: erroFatores } = await clienteSessao.auth.mfa.listFactors();
      if (erroFatores)
        return res
          .status(503)
          .json({ message: 'Não foi possível consultar o autenticador agora.' });
      const fator = fatores.totp.find((item) => item.status === 'verified');
      if (!fator) {
        await db.rpc('finalizar_confirmacao_admin', {
          p_usuario: usuario,
          p_sessao: sessao,
          p_tentativa: tentativa,
          p_sucesso: null,
          p_hash: null,
          p_mfa_confirmada: false,
          p_ip: req.ip || null,
          p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
          p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
        });
        return res.status(428).json({
          code: 'MFA_NOT_CONFIGURED',
          message: 'Configure o Google Authenticator para usar este método.',
        });
      }
      const { data: desafio, error: erroDesafio } = await clienteSessao.auth.mfa.challenge({
        factorId: fator.id,
      });
      if (erroDesafio) {
        await db.rpc('finalizar_confirmacao_admin', {
          p_usuario: usuario,
          p_sessao: sessao,
          p_tentativa: tentativa,
          p_sucesso: null,
          p_hash: null,
          p_mfa_confirmada: false,
          p_ip: req.ip || null,
          p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
          p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
        });
        return res
          .status(503)
          .json({ message: 'Não foi possível iniciar a verificação do autenticador.' });
      }
      const { error: erroCodigo } = await clienteSessao.auth.mfa.verify({
        factorId: fator.id,
        challengeId: desafio.id,
        code: entrada.data.code!,
      });
      const provaAutenticador = erroCodigo ? null : randomBytes(32).toString('hex');
      const { data: finalizadoAutenticador, error: erroFinalAutenticador } = await db.rpc(
        'finalizar_confirmacao_admin',
        {
          p_usuario: usuario,
          p_sessao: sessao,
          p_tentativa: tentativa,
          p_sucesso: !erroCodigo,
          p_hash: provaAutenticador ? resumoToken(provaAutenticador) : null,
          p_mfa_confirmada: !erroCodigo,
          p_ip: req.ip || null,
          p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
          p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
        },
      );
      if (erroFinalAutenticador) throw erroFinalAutenticador;
      if (erroCodigo || !finalizadoAutenticador?.confirmado) {
        await encerrarSessaoAposFalha(req, res);
        return res.status(401).json({
          code: 'MFA_CODE_INVALID',
          message: 'Código incorreto. Sua sessão foi encerrada; entre novamente.',
        });
      }
      salvarProvaConfirmacao(res, provaAutenticador!, minutosConfirmacaoAutenticador);
      return res.json({
        expiresInSeconds: minutosConfirmacaoAutenticador * 60,
        maximumInSeconds: minutosConfirmacaoAutenticador * 60,
      });
    }
    const cliente = createSupabaseClient();
    const { data: resultado, error: erroSenha } = await cliente.auth.signInWithPassword({
      email: res.locals.adminEmail,
      password: entrada.data.password ?? '',
    });
    let sucesso = !erroSenha && resultado.user?.id === usuario && !!resultado.session;

    if (entrada.data.phase === 'password' || entrada.data.method === 'password') {
      if (resultado.session) {
        const { error: erroSaida } = await cliente.auth.signOut({ scope: 'local' });
        if (erroSaida) console.error('[security/confirm/password-session]', erroSaida.code);
      }
      const indisponivel = servicoExternoIndisponivel(erroSenha);
      const apenasValidarSenha = entrada.data.phase === 'password';
      const provaSenha = sucesso && !apenasValidarSenha ? randomBytes(32).toString('hex') : null;
      const { data: validacao, error: erroValidacao } = await db.rpc(
        'finalizar_confirmacao_admin',
        {
          p_usuario: usuario,
          p_sessao: sessao,
          p_tentativa: tentativa,
          p_sucesso: indisponivel ? null : apenasValidarSenha && sucesso ? null : sucesso,
          p_hash: provaSenha ? resumoToken(provaSenha) : null,
          p_mfa_confirmada: false,
          p_ip: req.ip || null,
          p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
          p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
        },
      );
      if (erroValidacao) throw erroValidacao;
      if (indisponivel)
        return res.status(503).json({
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message: 'Não foi possível verificar a senha agora. Tente novamente.',
        });
      if (validacao?.espera) {
        const espera = Number(validacao.espera);
        res.setHeader('Retry-After', String(espera));
        if (!sucesso) await encerrarSessaoAposFalha(req, res);
        return res.status(sucesso ? 429 : 401).json({
          code: 'REAUTH_WAIT',
          retryAfterSeconds: espera,
          message: sucesso
            ? 'A verificação expirou. Digite sua senha novamente para continuar.'
            : 'Limite de tentativas atingido. Aguarde 5 minutos.',
        });
      }
      if (!sucesso) {
        await encerrarSessaoAposFalha(req, res);
        return res.status(401).json({
          code: 'INVALID_PASSWORD',
          message: `Senha incorreta. Restam ${validacao?.restantes ?? 0} tentativa(s).`,
        });
      }
      if (apenasValidarSenha) return res.json({ passwordVerified: true });
      if (!validacao?.confirmado || !provaSenha)
        return res
          .status(503)
          .json({ message: 'Não foi possível registrar a confirmação. Tente novamente.' });
      salvarProvaConfirmacao(res, provaSenha, minutosConfirmacaoSenha);
      return res.json({
        expiresInSeconds: minutosConfirmacaoSenha * 60,
        maximumInSeconds: minutosConfirmacaoSenha * 60,
      });
    }

    let autenticadorConfirmado = false;
    let erroAutenticador: string | null = null;
    let codigoErroAutenticador: string | null = null;
    if (sucesso && resultado.session) {
      const fatores = await cliente.auth.mfa.listFactors();
      if (fatores.error) {
        erroAutenticador = 'Não foi possível consultar a proteção agora. Tente novamente.';
        codigoErroAutenticador = 'MFA_SERVICE_UNAVAILABLE';
        sucesso = false;
      } else {
        const totp = fatores.data.totp.filter((fator) => fator.status === 'verified');
        if (entrada.data.requireAuthenticator && !totp.length) {
          await cliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
          await db.rpc('finalizar_confirmacao_admin', {
            p_usuario: usuario,
            p_sessao: sessao,
            p_tentativa: tentativa,
            p_sucesso: null,
            p_hash: null,
            p_mfa_confirmada: false,
            p_ip: req.ip || null,
            p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
            p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
          });
          return res.status(428).json({
            code: 'MFA_ENROLL_REQUIRED',
            message: 'Configure o Google Authenticator antes de decidir acessos administrativos.',
          });
        }
        if (totp.length) {
          if (!entrada.data.code) {
            sucesso = false;
            erroAutenticador = 'Informe o código de seis dígitos do autenticador.';
            codigoErroAutenticador = 'MFA_CODE_REQUIRED';
          } else {
            const fator = totp[0];
            const { data: desafio, error: erroDesafio } = await cliente.auth.mfa.challenge({
              factorId: fator.id,
            });
            if (erroDesafio) {
              erroAutenticador = 'Não foi possível validar o código agora. Tente novamente.';
              codigoErroAutenticador = 'MFA_SERVICE_UNAVAILABLE';
              sucesso = false;
            } else {
              const { error: erroCodigo } = await cliente.auth.mfa.verify({
                factorId: fator.id,
                challengeId: desafio.id,
                code: entrada.data.code,
              });
              sucesso = !erroCodigo;
              autenticadorConfirmado = !erroCodigo;
              erroAutenticador = erroCodigo
                ? 'Código não aceito. Confira se a data e hora do celular estão automáticas e tente o código atual.'
                : null;
              codigoErroAutenticador = erroCodigo ? 'MFA_CODE_INVALID' : null;
            }
          }
        }
      }
    }
    if (resultado.session) {
      // A sessao temporaria da verificacao nao substitui a sessao original.
      const { error: erroSaida } = await cliente.auth.signOut({ scope: 'local' });
      if (erroSaida) console.error('[security/confirm/session]', erroSaida.code);
    }
    const indisponivel =
      servicoExternoIndisponivel(erroSenha) ||
      erroAutenticador === 'Não foi possível consultar a proteção agora. Tente novamente.' ||
      erroAutenticador === 'Não foi possível validar o código agora. Tente novamente.';
    const prova = sucesso ? randomBytes(32).toString('hex') : null;
    const { data: finalizado, error: erroFinal } = await db.rpc('finalizar_confirmacao_admin', {
      p_usuario: usuario,
      p_sessao: sessao,
      p_tentativa: tentativa,
      p_sucesso: indisponivel ? null : sucesso,
      p_hash: prova ? resumoToken(prova) : null,
      p_mfa_confirmada: autenticadorConfirmado,
      p_ip: req.ip || null,
      p_user_agent: req.get('user-agent')?.slice(0, 1000) || null,
      p_request_id: (req as typeof req & { requestId?: string }).requestId || null,
    });
    if (erroFinal) throw erroFinal;
    if (indisponivel)
      return res
        .status(503)
        .json({ message: 'Não foi possível verificar sua identidade agora. Tente novamente.' });
    if (!sucesso || !finalizado?.confirmado) {
      const espera = Number(finalizado?.espera ?? 0);
      if (espera) res.setHeader('Retry-After', String(espera));
      const fatorInvalido = !sucesso || codigoErroAutenticador === 'MFA_CODE_INVALID';
      if (!indisponivel && fatorInvalido) await encerrarSessaoAposFalha(req, res);
      const situacao =
        espera && !fatorInvalido
          ? 429
          : codigoErroAutenticador === 'MFA_CODE_INVALID'
            ? 401
            : codigoErroAutenticador
              ? 422
              : 401;
      return res.status(situacao).json({
        code: espera ? 'REAUTH_WAIT' : codigoErroAutenticador || 'INVALID_PASSWORD',
        retryAfterSeconds: espera,
        message: espera
          ? 'Limite de tentativas atingido. Aguarde 5 minutos.'
          : erroAutenticador ||
            `Senha ou código incorreto. Restam ${finalizado?.restantes ?? 0} tentativa(s).`,
      });
    }
    if (entrada.data.employeeApproval && entrada.data.method === 'both' && autenticadorConfirmado) {
      const { error: erroCreditos } = await db.rpc('conceder_creditos_aprovacao_funcionario', {
        p_usuario: usuario,
        p_sessao: sessao,
      });
      if (erroCreditos) throw erroCreditos;
    }
    const tempoConfirmacao = autenticadorConfirmado
      ? minutosConfirmacaoAutenticador
      : minutosConfirmacaoSenha;
    salvarProvaConfirmacao(
      res,
      prova!,
      tempoConfirmacao,
      entrada.data.method === 'both' && autenticadorConfirmado,
    );
    return res.json({
      expiresInSeconds: tempoConfirmacao * 60,
      maximumInSeconds: tempoConfirmacao * 60,
    });
  });
  app.get('/api/admin/security/session', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    res.setHeader('Cache-Control', 'no-store');
    const prova = req.cookies['admin-confirmacao'];
    const { data, error } = await db.rpc('consultar_confirmacao_admin', {
      p_usuario: res.locals.adminUserId,
      p_sessao: res.locals.adminSessionId,
      p_hash: typeof prova === 'string' && /^[a-f0-9]{64}$/.test(prova) ? resumoToken(prova) : '',
    });
    if (error) throw error;
    const mfa = await clienteDaSessao(req, res);
    if (!mfa) return;
    const { data: fatores, error: erroFatores } = await mfa.auth.mfa.listFactors();
    if (erroFatores)
      return res.status(503).json({ message: 'Não foi possível consultar o autenticador.' });
    const fatorTotp = fatores.totp.find((fator) => fator.status === 'verified');
    return res.json({
      ...data,
      mfaConfigured: !!fatorTotp,
      mfaName: fatorTotp?.friendly_name ?? null,
    });
  });
  app.get('/api/admin/security/mfa', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const cliente = await clienteDaSessao(req, res);
    if (!cliente) return;
    const { data, error } = await cliente.auth.mfa.listFactors();
    if (error)
      return res.status(503).json({ message: 'Não foi possível consultar o autenticador.' });
    const fator = data.totp.find((item) => item.status === 'verified');
    return res.json({ configured: !!fator, name: fator?.friendly_name ?? null });
  });
  app.post('/api/admin/security/mfa/enroll', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const cliente = await clienteDaSessao(req, res);
    if (!cliente) return;
    // A listagem da sessão omite fatores pendentes. A lista administrativa
    // mostra todos os fatores e permite recuperar cadastros TOTP interrompidos.
    const admin = createSupabaseAdmin();
    if (!admin)
      return res.status(503).json({
        message:
          'Não foi possível reiniciar o cadastro do autenticador. Verifique a chave privada do Supabase no servidor.',
      });
    const { data: existentes, error: erroExistentes } = await admin.auth.admin.mfa.listFactors({
      userId: res.locals.adminUserId,
    });
    if (erroExistentes) {
      console.error(
        '[security/mfa/enroll] factor list failed:',
        erroExistentes.code || erroExistentes.name,
      );
      return res.status(503).json({
        message: 'Não foi possível consultar as configurações do autenticador. Tente novamente.',
      });
    }
    const totpVerificado = existentes.factors.some(
      (fator) => fator.factor_type === 'totp' && fator.status === 'verified',
    );
    if (totpVerificado)
      return res
        .status(409)
        .json({ message: 'Já existe um autenticador configurado nesta conta.' });
    // Remova apenas TOTP não verificados pertencentes à conta autenticada.
    const pendentes = existentes.factors.filter(
      (fator) => fator.factor_type === 'totp' && fator.status !== 'verified',
    );
    if (pendentes.length) {
      for (const fator of pendentes) {
        const { error } = await admin.auth.admin.mfa.deleteFactor({
          userId: res.locals.adminUserId,
          id: fator.id,
        });
        if (error) {
          console.error(
            '[security/mfa/enroll] pending factor cleanup failed:',
            error.code || error.name,
          );
          return res.status(503).json({
            message:
              'Há uma configuração incompleta do autenticador. Não foi possível reiniciá-la agora; tente novamente em instantes.',
          });
        }
      }
    }
    const { data, error } = await cliente.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Google Authenticator',
    });
    if (error) {
      console.error('[security/mfa/enroll] enrollment failed:', error.code || error.name);
      return res.status(error.status && error.status >= 500 ? 503 : 400).json({
        code: error.code || 'MFA_ENROLL_FAILED',
        message:
          error.code === 'mfa_totp_enroll_not_enabled'
            ? 'A verificação por aplicativo precisa ser habilitada nas configurações de autenticação do Supabase.'
            : 'Não foi possível iniciar a configuração. Confira a conexão e tente novamente.',
      });
    }
    return res.json({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
  });
  app.post('/api/admin/security/mfa/verify', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const entrada = z
      .object({ factorId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) })
      .strict()
      .safeParse(req.body);
    if (!entrada.success)
      return res.status(400).json({
        code: 'MFA_CODE_FORMAT',
        message: 'Informe o código de seis dígitos do aplicativo.',
      });
    const cliente = await clienteDaSessao(req, res);
    if (!cliente) return;
    const { data: fatores, error: erroFatores } = await cliente.auth.mfa.listFactors();
    if (erroFatores)
      return res.status(503).json({
        code: 'MFA_LIST_UNAVAILABLE',
        message: 'Não foi possível consultar o cadastro. Tente novamente.',
      });
    const fator = fatores.all.find((item) => item.id === entrada.data.factorId);
    if (!fator)
      return res.status(410).json({
        code: 'MFA_ENROLLMENT_EXPIRED',
        message: 'Este QR code não está mais ativo. Reinicie a configuração do autenticador.',
      });
    // Repetir uma confirmação após a ativação é idempotente. Evita falhas na
    // interface quando o navegador repete a chamada após perder a resposta.
    if (fator.status === 'verified') return res.json({ configured: true });
    const { data: desafio, error: erroDesafio } = await cliente.auth.mfa.challenge({
      factorId: entrada.data.factorId,
    });
    if (erroDesafio) {
      console.error(
        '[security/mfa/verify] challenge failed:',
        erroDesafio.code || erroDesafio.name,
      );
      return res.status(409).json({
        code: 'MFA_CHALLENGE_EXPIRED',
        message: 'A configuração expirou. Feche este cadastro e inicie novamente.',
      });
    }
    const { data, error } = await cliente.auth.mfa.verify({
      factorId: entrada.data.factorId,
      challengeId: desafio.id,
      code: entrada.data.code,
    });
    if (error) {
      console.error('[security/mfa/verify] code rejected:', error.code || error.name);
      const codigoInvalido = error.code === 'mfa_verification_failed' || error.status === 422;
      return res
        .status(error.status && error.status >= 500 ? 503 : codigoInvalido ? 422 : 400)
        .json({
          code: codigoInvalido ? 'MFA_CODE_INVALID' : error.code || 'MFA_VERIFY_FAILED',
          message: codigoInvalido
            ? 'Código não aceito. Confira se a data e hora do celular estão automáticas e aguarde o próximo código.'
            : 'Não foi possível concluir a configuração. Tente novamente ou reinicie o cadastro.',
        });
    }
    // O SDK devolve a sessão diretamente em `data` (não em `data.session`).
    // Ações protegidas fazem sua própria confirmação recente de senha + TOTP.
    setCookiesSessao(res, data, req.cookies['sb-remember'] === '1');
    await registrarAtividade(
      db,
      {
        id_usuario: res.locals.adminUserId,
        evento: 'autenticador_google_ativado',
        categoria: 'seguranca',
        entidade: 'conta',
        entidade_id: String(res.locals.adminUserId),
        resumo: 'Autenticador Google ativado para esta conta',
      },
      req,
    );
    return res.json({ configured: true });
  });
  app.post('/api/admin/security/lock', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const { error } = await db
      .from('admin_confirmacao')
      .delete()
      .eq('id_usuario', res.locals.adminUserId)
      .eq('id_sessao', res.locals.adminSessionId);
    if (error) throw error;
    res.clearCookie('admin-confirmacao', cookieOptions);
    res.clearCookie('admin-confirmacao-ambos', cookieOptions);
    return res.status(204).end();
  });
}

async function clienteDaSessao(req: express.Request, res: express.Response) {
  const accessToken = req.cookies['sb-access-token'];
  const refreshToken = req.cookies['sb-refresh-token'];
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    res.status(401).json({ message: 'Entre novamente para gerenciar o autenticador.' });
    return null;
  }
  const cliente = createSupabaseClient();
  const { data, error } = await cliente.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error || !data.session) {
    res.status(401).json({ message: 'Sua sessão expirou. Entre novamente para continuar.' });
    return null;
  }
  setCookiesSessao(res, data.session, req.cookies['sb-remember'] === '1');
  return cliente;
}
