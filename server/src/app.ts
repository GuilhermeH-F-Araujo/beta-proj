import { registrarConfirmacao } from './auth/confirmacao.js';
import { registrarGestaoAdministradores } from './routes/administradores.js';
import { rotasPesquisaGeral } from './pesquisaGeral.js';
import { registrarCentralMiniaturas } from './miniaturas/rotas.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { alteracaoPainelConfiavel } from '../scripts/url-cliente.mjs';
import { autorizarAcessoBanco } from './auth/autorizacao.js';
import { rotasCep } from './cep.js';
import { CLIENT_ORIGINS, CLIENT_URL } from './config/conexao.js';
import { rotasConfiguracoes } from './configuracoes.js';
import { rotasDadosCompartilhados } from './dadosCompartilhados.js';
import { rotasAgendamentos } from './agendamentos.js';
import { registrarDocumentacao } from './documentacao/rotas.js';
import { rotasFuncionarios } from './funcionarios.js';
import { rotasPainel } from './painelAdmin.js';
import { rotasPreferenciasConta } from './preferenciasConta.js';
import { registrarRotasAutenticacao } from './routes/autenticacao.js';
import { registrarRotasClientes } from './routes/clientes.js';
import { registrarRotasImagens } from './routes/imagens.js';
import { registrarRotasMotocicletas } from './routes/motocicletas.js';
import { registrarRotasNotificacoes } from './routes/notificacoes.js';
import { registrarRotasOrdens } from './routes/ordens.js';
import { registrarRotasPagamentos } from './routes/pagamentos.js';
import { registrarRotasPerfil } from './routes/perfil.js';
import { registrarRotasUsuarios } from './routes/usuarios.js';

// Criar a aplicacao nao abre portas nem inicia tarefas em segundo plano.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.set('trust proxy', 1);

  app.use(express.json({ limit: '4mb' }));

  app.use(cookieParser());

  // Os outros percursos recebem apenas a API de leitura com token do usuario.
  app.use(
    ['/api/miniaturas/publicada', '/api/miniaturas/creditos'],
    cors({
      origin: (origem, retorno) => {
        const permitidas = new Set(
          (process.env.MINIATURAS_ORIGENS || '')
            .split(',')
            .map((valor) => valor.trim())
            .filter(Boolean),
        );
        retorno(null, origem && permitidas.has(origem) ? origem : false);
      },
      credentials: false,
      methods: ['GET'],
      allowedHeaders: ['Authorization'],
    }),
  );

  app.use(
    cors({
      origin: (origem, retorno) =>
        retorno(null, !origem || CLIENT_ORIGINS.has(origem) ? origem || CLIENT_URL : false),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-Preview-Origin'],
    }),
  );

  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origem = req.get('Origin');
    if (!alteracaoPainelConfiavel(origem, req.get('Sec-Fetch-Site')))
      return res.status(403).json({ message: 'Origem da solicitação não autorizada.' });
    next();
  });

  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const requestId = randomUUID();
    (req as typeof req & { requestId: string }).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.once('finish', () => {
      if (res.statusCode >= 400)
        console.info(
          `[api] ${req.method} ${req.path} · HTTP ${res.statusCode} · referência ${requestId}`,
        );
    });
    next();
  });

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Permissions-Policy',
      req.path === '/enviar-referencia'
        ? 'camera=(self), microphone=(), geolocation=()'
        : 'camera=(), microphone=(), geolocation=()',
    );
    next();
  });

  registrarDocumentacao(app);
  registrarRotasAutenticacao(app);
  registrarRotasPerfil(app);
  registrarConfirmacao(app, autorizarAcessoBanco);
  registrarGestaoAdministradores(app, autorizarAcessoBanco);
  registrarRotasMotocicletas(app);
  registrarRotasOrdens(app);
  registrarRotasUsuarios(app);
  registrarRotasNotificacoes(app);
  registrarRotasClientes(app);
  registrarCentralMiniaturas(app);
  registrarRotasImagens(app);
  registrarRotasPagamentos(app);

  app.use('/api/admin/search', rotasPesquisaGeral(autorizarAcessoBanco));

  app.use('/api/employees', rotasFuncionarios(autorizarAcessoBanco));

  app.use('/api/admin/dashboard', rotasPainel(autorizarAcessoBanco));

  app.use('/api/admin/settings', rotasConfiguracoes(autorizarAcessoBanco));

  app.use('/api/admin/preferences', rotasPreferenciasConta(autorizarAcessoBanco));

  app.use('/api/postal-code', rotasCep(autorizarAcessoBanco));

  app.use('/api/shared', rotasDadosCompartilhados(autorizarAcessoBanco));

  app.use('/api/agendamentos', rotasAgendamentos(autorizarAcessoBanco));

  const pastaClienteCompilado = fileURLToPath(new URL('../../client/dist/', import.meta.url));

  const entradaClienteCompilado = fileURLToPath(
    new URL('../../client/dist/index.html', import.meta.url),
  );

  if (process.env.NODE_ENV === 'production' && existsSync(entradaClienteCompilado)) {
    app.use(express.static(pastaClienteCompilado, { index: false }));
    app.use((req, res, next) => {
      if (
        !['GET', 'HEAD'].includes(req.method) ||
        req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.path === '/health' ||
        !req.accepts('html')
      )
        return next();
      res.sendFile(entradaClienteCompilado);
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ message: 'Rota não encontrada.' });
  });

  app.use(
    (erro: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (res.headersSent) return;
      if (erro && typeof erro === 'object' && 'type' in erro && erro.type === 'entity.too.large') {
        res.status(413).json({ message: 'O arquivo excede o limite permitido.' });
        return;
      }
      if (erro instanceof SyntaxError && 'body' in erro) {
        res
          .status(400)
          .json({ code: 'INVALID_JSON', message: 'O corpo da solicitação não é um JSON válido.' });
        return;
      }
      const detalhe =
        erro instanceof Error
          ? erro.message
          : erro &&
              typeof erro === 'object' &&
              'message' in erro &&
              typeof erro.message === 'string'
            ? erro.message
            : 'Falha inesperada';
      console.error('[api]', detalhe);
      res.status(503).json({
        code: 'SERVICE_UNAVAILABLE',
        message: 'O serviço está temporariamente indisponível. Tente novamente em instantes.',
      });
    },
  );

  return app;
}
