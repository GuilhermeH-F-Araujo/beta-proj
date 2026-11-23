import type express from 'express';
import {
  contaEstaBloqueada,
  emailAdministradorPodeRecuperar,
  limparCookiesSessao,
  normalizarEmail,
  obterAdministradorAutorizado,
  obterUsuarioAutenticado,
  setCookiesSessao,
} from '../auth/sessao.js';
import {
  formatarDuracaoBloqueio,
  limparFalhasEntrada,
  obterBloqueioEntrada,
  obterEsperaRecuperacao,
  registrarEsperaRecuperacao,
  registrarFalhaEntrada,
} from '../auth/tentativas.js';
import {
  CLIENT_URL,
  createSupabaseAdmin,
  createSupabaseClient,
  servicoExternoIndisponivel,
} from '../config/conexao.js';
import { entradaSchema, novaSenhaSchema, recuperacaoSchema } from '../validators/autenticacao.js';

export function registrarRotasAutenticacao(app: express.Express) {
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const validado = entradaSchema.safeParse(req.body);
    if (!validado.success) {
      return res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Informe um e-mail válido e sua senha para continuar.',
      });
    }

    const identificador = normalizarEmail(validado.data.identifier);
    const { password: senha, remember: lembrar } = validado.data;

    const ativoBloqueio = obterBloqueioEntrada(req, identificador);
    if (ativoBloqueio) {
      res.setHeader('Retry-After', String(ativoBloqueio.retryAfterSeconds));
      return res.status(429).json({
        code: 'LOGIN_TEMPORARILY_LOCKED',
        retryAfterSeconds: ativoBloqueio.retryAfterSeconds,
        message: `Muitas tentativas sem sucesso. Por segurança, tente novamente em ${formatarDuracaoBloqueio(ativoBloqueio.retryAfterSeconds)}.`,
      });
    }

    try {
      const autenticacaoCliente = createSupabaseClient();
      const { data: dados, error: erro } = await autenticacaoCliente.auth.signInWithPassword({
        email: identificador,
        password: senha,
      });

      // Falha de rede/servico nao deve consumir tentativas de senha.
      if (servicoExternoIndisponivel(erro)) {
        console.error('[auth/login] Supabase Auth indisponível:', erro?.message);
        return res.status(503).json({
          code: 'AUTH_SERVICE_UNAVAILABLE',
          message:
            'O serviço de autenticação está indisponível no momento. Tente novamente em instantes.',
        });
      }

      if (erro || !dados.session || !dados.user) {
        const resultado = registrarFalhaEntrada(req, identificador);

        if (resultado.blocked) {
          res.setHeader('Retry-After', String(resultado.retryAfterSeconds));
          return res.status(429).json({
            code: 'LOGIN_TEMPORARILY_LOCKED',
            retryAfterSeconds: resultado.retryAfterSeconds,
            message: `Você atingiu o limite de tentativas. O acesso foi temporariamente bloqueado por ${formatarDuracaoBloqueio(resultado.retryAfterSeconds)}.`,
          });
        }

        return res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          attemptsRemaining: resultado.attemptsRemaining,
          message: `Não foi possível validar os dados de acesso. Confira o e-mail e a senha. Você ainda possui ${resultado.attemptsRemaining} tentativa${resultado.attemptsRemaining === 1 ? '' : 's'} antes do bloqueio temporário.`,
        });
      }

      if (await contaEstaBloqueada(dados.user.id)) {
        await autenticacaoCliente.auth.signOut({ scope: 'local' }).catch(() => undefined);
        return res.status(403).json({
          code: 'ACCOUNT_BLOCKED',
          message: 'Esta conta está bloqueada. Procure um administrador para liberar o acesso.',
        });
      }

      const administradorPerfil = await obterAdministradorAutorizado(
        dados.session.access_token,
        dados.user.id,
      );

      if (!administradorPerfil) {
        try {
          await autenticacaoCliente.auth.signOut();
        } catch {
          // Nenhuma sessao do painel sera criada.
        }

        const resultado = registrarFalhaEntrada(req, identificador);

        if (resultado.blocked) {
          res.setHeader('Retry-After', String(resultado.retryAfterSeconds));
          return res.status(429).json({
            code: 'LOGIN_TEMPORARILY_LOCKED',
            retryAfterSeconds: resultado.retryAfterSeconds,
            message: `Você atingiu o limite de tentativas. O acesso foi temporariamente bloqueado por ${formatarDuracaoBloqueio(resultado.retryAfterSeconds)}.`,
          });
        }

        return res.status(403).json({
          code: 'ACCESS_NOT_AVAILABLE',
          attemptsRemaining: resultado.attemptsRemaining,
          message:
            'Esta conta não possui autorização para o painel administrativo. Se precisar de acesso, procure o responsável pelo sistema.',
        });
      }

      limparFalhasEntrada(req, identificador);
      res.locals.adminUserId = dados.user.id;
      res.locals.adminNome = administradorPerfil.nome;
      res.locals.adminCargo = administradorPerfil.acesso.cargo;

      setCookiesSessao(res, dados.session, lembrar);

      return res.json({
        user: {
          id: dados.user.id,
          email: dados.user.email ?? null,
          nome: administradorPerfil.nome,
          perfil: administradorPerfil.acesso.cargo,
          acesso: administradorPerfil.acesso,
        },
      });
    } catch (erro) {
      console.error('[auth/login]', erro instanceof Error ? erro.message : 'Falha inesperada');
      return res.status(503).json({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message:
          'Não foi possível consultar o serviço de acesso. Confira a conexão do servidor com o Supabase e tente novamente.',
      });
    }
  });

  app.post('/api/auth/forgot-password', async (req, res) => {
    const validado = recuperacaoSchema.safeParse(req.body);
    if (!validado.success) {
      return res.status(400).json({
        code: 'INVALID_EMAIL',
        message: 'Digite um endereço de e-mail válido para continuar.',
      });
    }

    if (
      validado.data.clientOrigin &&
      new URL(validado.data.clientOrigin).origin !== new URL(CLIENT_URL).origin
    ) {
      return res.status(409).json({
        code: 'RECOVERY_ORIGIN_MISMATCH',
        message: `Abra o painel pelo endereço configurado no servidor: ${CLIENT_URL}.`,
      });
    }

    const email = normalizarEmail(validado.data.email);
    const espera = obterEsperaRecuperacao(req, email);
    if (espera > 0) {
      const tentarNovamenteDepoisSegundos = Math.ceil(espera / 1000);
      res.setHeader('Retry-After', String(tentarNovamenteDepoisSegundos));
      return res.status(429).json({
        code: 'RECOVERY_RATE_LIMITED',
        retryAfterSeconds: tentarNovamenteDepoisSegundos,
        message: `Aguarde ${formatarDuracaoBloqueio(tentarNovamenteDepoisSegundos)} antes de solicitar um novo envio.`,
      });
    }

    const recuperavel = await emailAdministradorPodeRecuperar(email);

    if (recuperavel === null) {
      return res.status(503).json({
        code: 'RECOVERY_NOT_CONFIGURED',
        message:
          'A recuperação de senha ainda não está configurada no servidor. Confira SUPABASE_SECRET_KEY.',
      });
    }

    if (recuperavel === false) {
      registrarEsperaRecuperacao(req, email);
      return res.json({
        message:
          'Se os dados informados estiverem vinculados a uma conta administrativa válida, as instruções serão enviadas em instantes.',
      });
    }

    const autenticacaoCliente = createSupabaseClient();
    const redirecionarPara = new URL(
      '/redefinir-senha',
      `${CLIENT_URL.replace(/\/$/, '')}/`,
    ).toString();
    const { error: erro } = await autenticacaoCliente.auth.resetPasswordForEmail(email, {
      redirectTo: redirecionarPara,
    });

    registrarEsperaRecuperacao(req, email);

    if (erro) {
      console.error('[forgot-password]', erro.message);
      return res.status(erro.status === 429 ? 429 : 503).json({
        code: 'RECOVERY_EMAIL_DELIVERY_FAILED',
        message:
          erro.status === 429
            ? 'O serviço de email atingiu o limite de envios. Aguarde alguns instantes e tente novamente.'
            : 'O serviço de email recusou o envio. Confira o SMTP em Authentication → Emails e tente novamente.',
      });
    }

    return res.json({
      message:
        'As instruções de redefinição foram enviadas. Verifique sua caixa de entrada e também a pasta de spam.',
    });
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    const validado = novaSenhaSchema.safeParse(req.body);
    if (!validado.success) {
      return res.status(400).json({
        code: 'INVALID_RESET_REQUEST',
        message: 'Confira o link e informe uma senha de pelo menos 8 caracteres.',
      });
    }

    try {
      const cliente = createSupabaseClient();
      const {
        tokenHash: resumoToken,
        accessToken: tokenAcesso,
        refreshToken: tokenRenovacao,
        password: senha,
      } = validado.data;
      const resultado = resumoToken
        ? await cliente.auth.verifyOtp({ token_hash: resumoToken, type: 'recovery' })
        : await cliente.auth.setSession({
            access_token: tokenAcesso!,
            refresh_token: tokenRenovacao!,
          });

      if (resultado.error || !resultado.data.session || !resultado.data.user) {
        return res.status(400).json({
          code: 'RECOVERY_LINK_INVALID',
          message: 'Este link expirou ou já foi usado. Solicite um novo e-mail de recuperação.',
        });
      }

      const privilegiado = createSupabaseAdmin();
      if (!privilegiado)
        return res.status(503).json({
          code: 'RECOVERY_NOT_CONFIGURED',
          message: 'Não foi possível validar a conta. Configure SUPABASE_SECRET_KEY no servidor.',
        });
      const { data: funcionario, error: funcionarioErro } = await privilegiado
        .from('funcionario')
        .select('id_funcionario')
        .eq('auth_user_id', resultado.data.user.id)
        .maybeSingle();
      if (funcionarioErro) throw funcionarioErro;
      if (!funcionario)
        return res.status(403).json({
          code: 'ACCESS_NOT_AVAILABLE',
          message: 'Esta conta não está vinculada a um funcionário cadastrado.',
        });

      const atualizado = await cliente.auth.updateUser({ password: senha });
      if (atualizado.error) {
        return res.status(400).json({
          code: 'PASSWORD_UPDATE_FAILED',
          message: 'Não foi possível salvar a senha. Escolha outra senha ou solicite um novo link.',
        });
      }

      return res.json({ message: 'Sua senha foi alterada. Entre com a nova senha.' });
    } catch (erro) {
      console.error(
        '[auth/reset-password]',
        erro instanceof Error ? erro.message : 'Falha inesperada',
      );
      return res.status(503).json({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'O serviço de acesso está indisponível. Tente novamente em instantes.',
      });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    const tokenAcesso = req.cookies['sb-access-token'];
    const tokenRenovacao = req.cookies['sb-refresh-token'];

    if (tokenAcesso && tokenRenovacao) {
      try {
        const autenticacaoCliente = createSupabaseClient();
        const { data: usuarioAtual } = await autenticacaoCliente.auth.getUser(tokenAcesso);
        if (usuarioAtual.user) res.locals.adminUserId = usuarioAtual.user.id;
        const { error: erro } = await autenticacaoCliente.auth.setSession({
          access_token: tokenAcesso,
          refresh_token: tokenRenovacao,
        });
        if (!erro) await autenticacaoCliente.auth.signOut({ scope: 'local' });
      } catch {
        // Cookies locais ainda serao removidos mesmo se a revogacao remota falhar.
      }
    }

    limparCookiesSessao(res);
    res.status(204).end();
  });

  app.get('/api/auth/me', async (req, res) => {
    const sessao = await obterUsuarioAutenticado(req, res);
    if (!sessao) {
      return res
        .status(401)
        .json({ message: 'Sua sessão expirou. Entre novamente para continuar.' });
    }

    const administradorPerfil = await obterAdministradorAutorizado(
      sessao.accessToken,
      sessao.user.id,
    );
    if (!administradorPerfil) {
      limparCookiesSessao(res);
      return res.status(403).json({
        message: 'O acesso a este painel não está disponível para esta conta.',
      });
    }

    return res.json({
      user: {
        id: sessao.user.id,
        email: sessao.user.email ?? null,
        nome: administradorPerfil.nome,
        telefone: administradorPerfil.telefone ?? null,
        perfil: administradorPerfil.acesso.cargo,
        acesso: administradorPerfil.acesso,
      },
    });
  });
}
