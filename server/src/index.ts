import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { createHash, randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { resolveClientUrl, trustedClientOrigins, isTrustedPanelMutation } from '../scripts/url-cliente.mjs';
import { generateModelCandidate, approveModelPreview, getCandidatePreview, CANDIDATE_MODEL_PREVIEW_BUCKET, candidatePreviewPath, previewMime, ModelPreviewError, isBundledModel, isModelGenerationBlocked, isModelImageConfigured, isJpegPreview, getCachedModelPreview } from './previaModelo.js';
import { enfileirarModelo, iniciarFilaMiniaturas, chaveModelo } from './filaMiniaturas.js';
import { formatarNomeModeloMoto, verificarModeloMotocicleta, pesquisarMotocicleta } from './pesquisaModelo.js';
import { diretorioClientes, perfilClienteNoDiretorio } from './diretorioClientes.js';
import { statusMotocicleta } from './statusMotocicleta.js';
import { sugestoesMarcasMotocicleta } from './marcasMotocicleta.js';

// src/ e dist/ têm o mesmo diretório pai: server/.
// Carrega server/.env mesmo ao iniciar o processo de outra pasta.
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const PORT = Number(process.env.PORT || 3001);
const CLIENT_URL = resolveClientUrl();
const CLIENT_ORIGINS = trustedClientOrigins();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function isUpstreamUnavailable(error: { status?: number; name?: string } | null) {
  return !!error && ((error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError');
}

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env do servidor.');
}

function createSupabaseClient(accessToken?: string) {
  return createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}

function createPrivilegedSupabaseClient() {
  if (!SUPABASE_SECRET_KEY) return null;

  return createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());
app.use(
  cors({
    origin: (origin, callback) => callback(null, !origin || CLIENT_ORIGINS.has(origin) ? (origin || CLIENT_URL) : false),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Preview-Origin'],
  }),
);
app.use((req,res,next)=>{
  if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
  const origin=req.get('Origin');
  if (!isTrustedPanelMutation(origin, req.get('Sec-Fetch-Site')))
    return res.status(403).json({message:'Origem da solicitação não autorizada.'});
  next();
});
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const loginSchema = z.object({
  identifier: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
  remember: z.boolean().default(false),
});

const forgotSchema = z.object({
  email: z.string().trim().email().max(254),
  clientOrigin: z.string().url().max(512).optional(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
  tokenHash: z.string().min(10).max(2048).optional(),
  accessToken: z.string().min(10).max(8192).optional(),
  refreshToken: z.string().min(10).max(8192).optional(),
}).refine(value => Boolean(value.tokenHash || (value.accessToken && value.refreshToken)));

const secure = process.env.NODE_ENV === 'production';
const cookieBase = {
  httpOnly: true,
  secure,
  sameSite: 'lax' as const,
  path: '/',
};

function clearAuthCookies(res: express.Response) {
  res.clearCookie('sb-access-token', cookieBase);
  res.clearCookie('sb-refresh-token', cookieBase);
  res.clearCookie('sb-remember', cookieBase);
}

function setAuthCookies(res: express.Response, session: { access_token: string; refresh_token: string; expires_in: number }, remember: boolean) {
  res.cookie('sb-access-token', session.access_token, {
    ...cookieBase,
    maxAge: remember ? Math.max(1, session.expires_in) * 1000 : undefined,
  });
  res.cookie('sb-refresh-token', session.refresh_token, {
    ...cookieBase,
    maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : undefined,
  });
  if (remember) {
    res.cookie('sb-remember', '1', { ...cookieBase, maxAge: 30 * 24 * 60 * 60 * 1000 });
  } else {
    res.clearCookie('sb-remember', cookieBase);
  }
}

async function authenticatedUser(req: express.Request, res: express.Response) {
  const accessToken = req.cookies['sb-access-token'];
  const refreshToken = req.cookies['sb-refresh-token'];
  if (!accessToken && !refreshToken) return null;

  const client = createSupabaseClient();
  if (accessToken) {
    const { data, error } = await client.auth.getUser(accessToken);
    if (!error && data.user) return { user: data.user, accessToken };
    if (isUpstreamUnavailable(error)) throw new Error('Supabase Auth indisponível ao verificar sessão.');
  }

  if (refreshToken) {
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data.session && data.user) {
      setAuthCookies(res, data.session, req.cookies['sb-remember'] === '1');
      return { user: data.user, accessToken: data.session.access_token };
    }
    if (isUpstreamUnavailable(error)) throw new Error('Supabase Auth indisponível ao renovar sessão.');
  }

  clearAuthCookies(res);
  return null;
}

function normalizeRole(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isAdministratorRole(value: string | null | undefined) {
  return normalizeRole(value) === 'administrador';
}

async function readAuthorizedAdmin(accessToken: string, userId: string) {
  const scopedClient = createSupabaseClient(accessToken);

  const { data: profile, error } = await scopedClient
    .from('funcionario')
    .select('id_funcionario, nome, cargo, email, telefone, perfil_acesso, auth_user_id')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Consulta ao perfil administrativo falhou: ${error.message}`);
  if (!profile) return null;

  // Defesa em profundidade: não basta ter um vínculo com auth.users.
  // O registro precisa ser Administrador nos dois campos usados pelo projeto.
  if (!isAdministratorRole(profile.cargo) || !isAdministratorRole(profile.perfil_acesso)) {
    return null;
  }

  return profile;
}


type LoginAttemptState = {
  failures: number;
  strikeLevel: number;
  blockedUntil: number;
  lastSeenAt: number;
};

const loginAttempts = new Map<string, LoginAttemptState>();
const LOGIN_FAILURES_BEFORE_BLOCK = 5;
const LOGIN_BLOCK_DURATIONS_MS = [
  60_000,          // 1 min
  5 * 60_000,      // 5 min
  15 * 60_000,     // 15 min
  30 * 60_000,     // 30 min
  60 * 60_000,     // 1 h
  2 * 60 * 60_000, // 2 h
];
const LOGIN_STATE_TTL_MS = 24 * 60 * 60_000;

function clientIp(req: express.Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function loginAttemptKey(req: express.Request, identifier: string) {
  return createHash('sha256')
    .update(`${clientIp(req)}|${normalizeEmail(identifier)}`)
    .digest('hex');
}

function pruneLoginAttemptState() {
  const cutoff = Date.now() - LOGIN_STATE_TTL_MS;
  for (const [key, state] of loginAttempts) {
    if (state.lastSeenAt < cutoff) loginAttempts.delete(key);
  }
}

function readLoginBlock(req: express.Request, identifier: string) {
  pruneLoginAttemptState();
  const key = loginAttemptKey(req, identifier);
  const state = loginAttempts.get(key);
  if (!state) return null;

  state.lastSeenAt = Date.now();

  if (state.blockedUntil > Date.now()) {
    return {
      key,
      retryAfterSeconds: Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000)),
    };
  }

  // O período terminou: mantém o nível de reincidência, mas zera a contagem do novo ciclo.
  if (state.blockedUntil > 0) {
    state.blockedUntil = 0;
    state.failures = 0;
  }

  return null;
}

function registerLoginFailure(req: express.Request, identifier: string) {
  const key = loginAttemptKey(req, identifier);
  const now = Date.now();
  const state = loginAttempts.get(key) ?? {
    failures: 0,
    strikeLevel: 0,
    blockedUntil: 0,
    lastSeenAt: now,
  };

  state.failures += 1;
  state.lastSeenAt = now;

  if (state.failures >= LOGIN_FAILURES_BEFORE_BLOCK) {
    const durationIndex = Math.min(state.strikeLevel, LOGIN_BLOCK_DURATIONS_MS.length - 1);
    const durationMs = LOGIN_BLOCK_DURATIONS_MS[durationIndex];

    state.failures = 0;
    state.strikeLevel += 1;
    state.blockedUntil = now + durationMs;
    loginAttempts.set(key, state);

    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(durationMs / 1000),
      attemptsRemaining: 0,
    };
  }

  loginAttempts.set(key, state);
  return {
    blocked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: LOGIN_FAILURES_BEFORE_BLOCK - state.failures,
  };
}

function clearLoginFailures(req: express.Request, identifier: string) {
  loginAttempts.delete(loginAttemptKey(req, identifier));
}

function formatLockDuration(seconds: number) {
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hora${hours === 1 ? '' : 's'}`;
}


type ForgotThrottleState = { lastRequestAt: number };
const forgotThrottle = new Map<string, ForgotThrottleState>();
const FORGOT_COOLDOWN_MS = 60_000;

function forgotThrottleKey(req: express.Request, email: string) {
  return createHash('sha256')
    .update(`${clientIp(req)}|${normalizeEmail(email)}`)
    .digest('hex');
}

function readForgotCooldown(req: express.Request, email: string) {
  const key = forgotThrottleKey(req, email);
  const previous = forgotThrottle.get(key);
  if (!previous) return 0;
  return Math.max(0, FORGOT_COOLDOWN_MS - (Date.now() - previous.lastRequestAt));
}

function touchForgotCooldown(req: express.Request, email: string) {
  forgotThrottle.set(forgotThrottleKey(req, email), { lastRequestAt: Date.now() });
}

async function isRecoverableAdministratorEmail(email: string) {
  const privileged = createPrivilegedSupabaseClient();
  if (!privileged) {
    // Sem chave secreta não é possível consultar RLS-protected funcionario antes
    // de autenticar. Nesse caso mantemos a resposta neutra do Supabase Auth.
    return null;
  }

  const { data: profile, error } = await privileged
    .from('funcionario')
    .select('auth_user_id, cargo, perfil_acesso, email')
    .ilike('email', email)
    .maybeSingle();

  if (error || !profile?.auth_user_id) return false;
  if (!isAdministratorRole(profile.cargo) || !isAdministratorRole(profile.perfil_acesso)) return false;

  const { data, error: authError } = await privileged.auth.admin.getUserById(profile.auth_user_id);
  if (authError || !data.user?.email) return false;

  return normalizeEmail(data.user.email) === normalizeEmail(email);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Informe um e-mail válido e sua senha para continuar.',
    });
  }

  const identifier = normalizeEmail(parsed.data.identifier);
  const { password, remember } = parsed.data;

  const activeBlock = readLoginBlock(req, identifier);
  if (activeBlock) {
    res.setHeader('Retry-After', String(activeBlock.retryAfterSeconds));
    return res.status(429).json({
      code: 'LOGIN_TEMPORARILY_LOCKED',
      retryAfterSeconds: activeBlock.retryAfterSeconds,
      message: `Muitas tentativas sem sucesso. Por segurança, tente novamente em ${formatLockDuration(activeBlock.retryAfterSeconds)}.`,
    });
  }

  try {
    const authClient = createSupabaseClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email: identifier,
      password,
    });

    // Falha de rede/serviço não deve consumir tentativas de senha.
    if (isUpstreamUnavailable(error)) {
      console.error('[auth/login] Supabase Auth indisponível:', error?.message);
      return res.status(503).json({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'O serviço de autenticação está indisponível no momento. Tente novamente em instantes.',
      });
    }

    if (error || !data.session || !data.user) {
      const result = registerLoginFailure(req, identifier);

      if (result.blocked) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({
          code: 'LOGIN_TEMPORARILY_LOCKED',
          retryAfterSeconds: result.retryAfterSeconds,
          message: `Você atingiu o limite de tentativas. O acesso foi temporariamente bloqueado por ${formatLockDuration(result.retryAfterSeconds)}.`,
        });
      }

      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        attemptsRemaining: result.attemptsRemaining,
        message: `Não foi possível validar os dados de acesso. Confira o e-mail e a senha. Você ainda possui ${result.attemptsRemaining} tentativa${result.attemptsRemaining === 1 ? '' : 's'} antes do bloqueio temporário.`,
      });
    }

    const adminProfile = await readAuthorizedAdmin(data.session.access_token, data.user.id);

    if (!adminProfile) {
      try {
        await authClient.auth.signOut();
      } catch {
        // Nenhuma sessão do painel será criada.
      }

      const result = registerLoginFailure(req, identifier);

      if (result.blocked) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({
          code: 'LOGIN_TEMPORARILY_LOCKED',
          retryAfterSeconds: result.retryAfterSeconds,
          message: `Você atingiu o limite de tentativas. O acesso foi temporariamente bloqueado por ${formatLockDuration(result.retryAfterSeconds)}.`,
        });
      }

      return res.status(403).json({
        code: 'ACCESS_NOT_AVAILABLE',
        attemptsRemaining: result.attemptsRemaining,
        message: 'Esta conta não possui autorização para o painel administrativo. Se precisar de acesso, procure o responsável pelo sistema.',
      });
    }

    clearLoginFailures(req, identifier);

    setAuthCookies(res, data.session, remember);

    return res.json({
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
        nome: adminProfile.nome,
        perfil: 'Administrador',
      },
    });
  } catch (error) {
    console.error('[auth/login]', error instanceof Error ? error.message : 'Falha inesperada');
    return res.status(503).json({
      code: 'AUTH_SERVICE_UNAVAILABLE',
      message: 'Não foi possível consultar o serviço de acesso. Confira a conexão do servidor com o Supabase e tente novamente.',
    });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      code: 'INVALID_EMAIL',
      message: 'Digite um endereço de e-mail válido para continuar.',
    });
  }

  if (parsed.data.clientOrigin && new URL(parsed.data.clientOrigin).origin !== new URL(CLIENT_URL).origin) {
    return res.status(409).json({
      code: 'RECOVERY_ORIGIN_MISMATCH',
      message: `Abra o painel pelo endereço configurado no servidor: ${CLIENT_URL}.`,
    });
  }

  const email = normalizeEmail(parsed.data.email);
  const cooldown = readForgotCooldown(req, email);
  if (cooldown > 0) {
    const retryAfterSeconds = Math.ceil(cooldown / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      code: 'RECOVERY_RATE_LIMITED',
      retryAfterSeconds,
      message: `Aguarde ${formatLockDuration(retryAfterSeconds)} antes de solicitar um novo envio.`,
    });
  }

  const recoverable = await isRecoverableAdministratorEmail(email);

  if (recoverable === null) {
    return res.status(503).json({
      code: 'RECOVERY_NOT_CONFIGURED',
      message: 'A recuperação de senha ainda não está configurada no servidor. Confira SUPABASE_SECRET_KEY.',
    });
  }

  if (recoverable === false) {
    touchForgotCooldown(req, email);
    return res.json({
      message: 'Se os dados informados estiverem vinculados a uma conta administrativa válida, as instruções serão enviadas em instantes.',
    });
  }

  const authClient = createSupabaseClient();
  const redirectTo = new URL('/redefinir-senha', `${CLIENT_URL.replace(/\/$/, '')}/`).toString();
  const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo });

  touchForgotCooldown(req, email);

  if (error) {
    console.error('[forgot-password]', error.message);
    return res.status(error.status === 429 ? 429 : 503).json({
      code: 'RECOVERY_EMAIL_DELIVERY_FAILED',
      message: error.status === 429
        ? 'O serviço de email atingiu o limite de envios. Aguarde alguns instantes e tente novamente.'
        : 'O serviço de email recusou o envio. Confira o SMTP em Authentication → Emails e tente novamente.',
    });
  }

  return res.json({
    message: 'As instruções de redefinição foram enviadas. Verifique sua caixa de entrada e também a pasta de spam.',
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ code: 'INVALID_RESET_REQUEST', message: 'Confira o link e informe uma senha de pelo menos 8 caracteres.' });
  }

  try {
    const client = createSupabaseClient();
    const { tokenHash, accessToken, refreshToken, password } = parsed.data;
    const result = tokenHash
      ? await client.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      : await client.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });

    if (result.error || !result.data.session || !result.data.user) {
      return res.status(400).json({ code: 'RECOVERY_LINK_INVALID', message: 'Este link expirou ou já foi usado. Solicite um novo e-mail de recuperação.' });
    }

    const admin = await readAuthorizedAdmin(result.data.session.access_token, result.data.user.id);
    if (!admin) {
      return res.status(403).json({ code: 'ACCESS_NOT_AVAILABLE', message: 'Esta conta não possui acesso ao painel administrativo.' });
    }

    const updated = await client.auth.updateUser({ password });
    if (updated.error) {
      return res.status(400).json({ code: 'PASSWORD_UPDATE_FAILED', message: 'Não foi possível salvar a senha. Escolha outra senha ou solicite um novo link.' });
    }

    return res.json({ message: 'Sua senha foi alterada. Entre com a nova senha.' });
  } catch (error) {
    console.error('[auth/reset-password]', error instanceof Error ? error.message : 'Falha inesperada');
    return res.status(503).json({ code: 'AUTH_SERVICE_UNAVAILABLE', message: 'O serviço de acesso está indisponível. Tente novamente em instantes.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const accessToken = req.cookies['sb-access-token'];
  const refreshToken = req.cookies['sb-refresh-token'];

  if (accessToken && refreshToken) {
    try {
      const authClient = createSupabaseClient();
      const { error } = await authClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (!error) await authClient.auth.signOut();
    } catch {
      // Cookies locais ainda serão removidos mesmo se a revogação remota falhar.
    }
  }

  clearAuthCookies(res);
  res.status(204).end();
});

app.get('/api/auth/me', async (req, res) => {
  const session = await authenticatedUser(req, res);
  if (!session) {
    return res.status(401).json({ message: 'Sua sessão expirou. Entre novamente para continuar.' });
  }

  const adminProfile = await readAuthorizedAdmin(session.accessToken, session.user.id);
  if (!adminProfile) {
    clearAuthCookies(res);
    return res.status(403).json({
      message: 'O acesso a este painel não está disponível para esta conta.',
    });
  }

  return res.json({
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      nome: adminProfile.nome,
      telefone: adminProfile.telefone ?? null,
      perfil: 'Administrador',
    },
  });
});

// A lista de OS usa a chave secreta somente no servidor e só após validar
// novamente que a sessão pertence a um Administrador.
const orderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().trim().max(100).default(''),
  status: z.enum(['todos', 'aguardando', 'em andamento', 'aguardando peça', 'pronto', 'entregue', 'cancelada']).default('todos'),
  period: z.enum(['todos', '7d', '30d', 'mes']).default('todos'),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clientId: z.coerce.number().int().positive().optional(),
}).refine(value => {
  if (!value.dateFrom && !value.dateTo) return true;
  if (!value.dateFrom || !value.dateTo || value.dateFrom > value.dateTo) return false;
  return [value.dateFrom, value.dateTo].every(date => !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) === date);
});
type OrderFilters = z.infer<typeof orderQuerySchema>;
const ORDERS_PER_PAGE = 15;

async function ordersClient(req: express.Request, res: express.Response) {
  const session = await authenticatedUser(req, res);
  if (!session) { res.status(401).json({ message: 'Sessão expirada. Entre novamente.' }); return null; }
  if (!await readAuthorizedAdmin(session.accessToken, session.user.id)) {
    res.status(403).json({ message: 'Acesso permitido apenas a administradores.' }); return null;
  }
  res.locals.adminUserId = session.user.id;
  const privileged = createPrivilegedSupabaseClient();
  if (!privileged) {
    res.status(503).json({ message: 'Configure SUPABASE_SECRET_KEY no server/.env para consultar as OS.' });
    return null;
  }
  return privileged;
}

const ADMIN_AVATAR_BUCKET = 'admin-avatars';
const adminAvatarPath = (userId: string) => `admins/${userId}/avatar.jpg`;

app.patch('/api/admin/profile', async (req,res) => {
  const db=await ordersClient(req,res); if(!db)return;
  const parsed=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().max(20)}).strict().safeParse(req.body);
  if(!parsed.success || (parsed.data.phone && parsed.data.phone.replace(/\D/g,'').length<10)) return res.status(400).json({message:'Confira o nome e o telefone.'});
  try {
    const {data,error}=await db.from('funcionario').update({nome:parsed.data.name,telefone:parsed.data.phone || null})
      .eq('auth_user_id',res.locals.adminUserId).select('nome,telefone').single();
    if(error)throw error;
    return res.json({user:{nome:data.nome,telefone:data.telefone}});
  }catch(error){console.error('[admin/profile]',error);return res.status(500).json({message:'Não foi possível atualizar o perfil.'});}
});

app.get('/api/admin/profile/photo', async (req,res) => {
  const db=await ordersClient(req,res); if(!db)return;
  const {data,error}=await db.storage.from(ADMIN_AVATAR_BUCKET).download(adminAvatarPath(res.locals.adminUserId));
  if(error || !data)return res.status(404).end();
  res.setHeader('Cache-Control','private, no-store');
  return res.type('image/jpeg').send(Buffer.from(await data.arrayBuffer()));
});

app.put('/api/admin/profile/photo', async (req,res) => {
  const db=await ordersClient(req,res); if(!db)return;
  const parsed=z.object({data:z.string().max(750000)}).strict().safeParse(req.body);
  const match=parsed.success ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(parsed.data.data) : null;
  if(!match)return res.status(400).json({message:'Envie uma foto JPEG válida.'});
  const bytes=Buffer.from(match[1],'base64');
  if(bytes.length<100 || bytes.length>550000 || bytes[0]!==0xff || bytes[1]!==0xd8 || bytes[2]!==0xff)
    return res.status(400).json({message:'A foto deve ser JPEG e ter até 550 KB.'});
  const {error}=await db.storage.from(ADMIN_AVATAR_BUCKET).upload(adminAvatarPath(res.locals.adminUserId),bytes,{contentType:'image/jpeg',upsert:true,cacheControl:'0'});
  if(error){console.error('[admin/profile/photo]',error);return res.status(500).json({message:'Não foi possível salvar a foto.'});}
  return res.json({ok:true});
});

app.post('/api/admin/profile/password', async (req,res) => {
  const session=await authenticatedUser(req,res);
  if(!session || !await readAuthorizedAdmin(session.accessToken,session.user.id))return res.status(401).json({message:'Entre novamente para alterar sua senha.'});
  const parsed=z.object({currentPassword:z.string().min(1).max(256),newPassword:z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^\w\s]/)}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:'A nova senha precisa de 8 caracteres, maiúscula, minúscula, número e símbolo.'});
  if(parsed.data.currentPassword===parsed.data.newPassword)return res.status(400).json({message:'Escolha uma senha diferente da atual.'});
  const client=createSupabaseClient();
  const {data:verified,error:loginError}=await client.auth.signInWithPassword({email:session.user.email!,password:parsed.data.currentPassword});
  if(loginError || !verified.session || verified.user?.id!==session.user.id)return res.status(400).json({message:'A senha atual está incorreta.'});
  const {error}=await client.auth.updateUser({password:parsed.data.newPassword});
  if(error){console.error('[admin/profile/password]',error);return res.status(400).json({message:'Não foi possível trocar a senha. Tente outra ou use a recuperação de senha.'});}
  setAuthCookies(res,verified.session,req.cookies['sb-remember']==='1');
  return res.json({message:'Senha alterada com sucesso.'});
});

function periodBounds(period: OrderFilters['period']) {
  if (period === 'todos') return null;
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => dateParts.find(item => item.type === type)?.value ?? '';
  const start = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`);
  if (period === 'mes') start.setUTCDate(1);
  else start.setUTCDate(start.getUTCDate() - (period === '7d' ? 7 : 30));
  return start.toISOString().slice(0, 10);
}

async function matchingOrderFilters(db: ReturnType<typeof createSupabaseClient>, search: string) {
  if (!search) return null;
  const pattern = `%${search}%`;
  const [{ data: clients, error: clientsError }, { data: byModel, error: modelError }, { data: byPlate, error: plateError }, { data: mechanics, error: mechanicError }] = await Promise.all([
    db.from('cliente').select('id_cliente').ilike('nome', pattern).limit(1000),
    db.from('moto').select('id_moto').ilike('modelo', pattern).limit(1000),
    db.from('moto').select('id_moto').ilike('placa', pattern).limit(1000),
    db.from('funcionario').select('id_funcionario').ilike('nome', pattern).limit(1000),
  ]);
  if (clientsError || modelError || plateError || mechanicError) throw new Error('Não foi possível pesquisar as ordens.');
  const clientIds = (clients ?? []).map(item => item.id_cliente);
  const { data: clientMotos, error: motoError } = clientIds.length
    ? await db.from('moto').select('id_moto').in('id_cliente', clientIds).limit(1000)
    : { data: [], error: null };
  if (motoError) throw new Error('Não foi possível pesquisar as motocicletas.');
  const motoIds = [...new Set([...(byModel ?? []), ...(byPlate ?? []), ...(clientMotos ?? [])].map(item => Number(item.id_moto)))];
  const mechanicIds = (mechanics ?? []).map(item => Number(item.id_funcionario));
  const parts = [];
  if (/^#?\d+$/.test(search.replace(/^OS\s*/i, ''))) parts.push(`id_os.eq.${Number(search.replace(/^OS\s*#?/i, ''))}`);
  if (motoIds.length) parts.push(`id_moto.in.(${motoIds.join(',')})`);
  if (mechanicIds.length) parts.push(`id_mecanico.in.(${mechanicIds.join(',')})`);
  return parts;
}

async function loadOrders(db: ReturnType<typeof createSupabaseClient>, filters: OrderFilters) {
  const searchParts = await matchingOrderFilters(db, filters.search);
  if (searchParts?.length === 0) return { items: [], total: 0, page: filters.page, pageSize: ORDERS_PER_PAGE };
  const { data: clientBikes, error: bikesError } = filters.clientId
    ? await db.from('moto').select('id_moto').eq('id_cliente', filters.clientId)
    : { data: null, error: null };
  if (bikesError) throw new Error('Não foi possível consultar as motos do cliente.');
  if (filters.clientId && !clientBikes?.length) return { items: [], total: 0, page: filters.page, pageSize: ORDERS_PER_PAGE };
  let query = db.from('ordem_servico')
    .select('id_os,id_moto,id_mecanico,status,data_entrada,previsao_entrega,total', { count: 'exact' })
    .order('id_os', { ascending: false });
  if (filters.status !== 'todos') query = query.eq('status', filters.status);
  const fromDate = filters.dateFrom ?? periodBounds(filters.period);
  if (fromDate) query = query.gte('data_entrada', fromDate);
  if (filters.dateTo) query = query.lte('data_entrada', `${filters.dateTo}T23:59:59.999`);
  if (clientBikes) query = query.in('id_moto', clientBikes.map(bike => bike.id_moto));
  if (searchParts) query = query.or(searchParts.join(','));
  const offset = (filters.page - 1) * ORDERS_PER_PAGE;
  const { data: rows, error, count } = await query.range(offset, offset + ORDERS_PER_PAGE - 1);
  if (error) throw new Error(`Consulta de OS falhou: ${error.message}`);
  const motoIds = [...new Set((rows ?? []).map(row => row.id_moto))];
  const orderIds = (rows ?? []).map(row => row.id_os);
  const mechanicIds = [...new Set((rows ?? []).map(row => row.id_mecanico).filter((id): id is number => id != null))];
  const [{ data: motos, error: motoError }, { data: mechanics, error: mechanicError }, { data: payments, error: paymentError }] = await Promise.all([
    motoIds.length ? db.from('moto').select('id_moto,id_cliente,modelo,placa').in('id_moto', motoIds) : Promise.resolve({ data: [], error: null }),
    mechanicIds.length ? db.from('funcionario').select('id_funcionario,nome').in('id_funcionario', mechanicIds) : Promise.resolve({ data: [], error: null }),
    orderIds.length ? db.from('pagamento_os').select('id_os,status').in('id_os', orderIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (motoError || mechanicError || paymentError) throw new Error('Não foi possível carregar os vínculos das ordens e pagamentos.');
  const clientIds = [...new Set((motos ?? []).map(moto => moto.id_cliente))];
  const { data: clients, error: clientError } = clientIds.length
    ? await db.from('cliente').select('id_cliente,nome,telefone').in('id_cliente', clientIds)
    : { data: [], error: null };
  if (clientError) throw new Error('Não foi possível carregar os clientes.');
  const motoMap = new Map((motos ?? []).map(moto => [moto.id_moto, moto]));
  const clientMap = new Map((clients ?? []).map(client => [client.id_cliente, client]));
  const mechanicMap = new Map((mechanics ?? []).map(mechanic => [mechanic.id_funcionario, mechanic]));
  const paymentMap = new Map((payments ?? []).map(payment => [payment.id_os, payment.status]));
  return {
    items: (rows ?? []).map(row => {
      const moto = motoMap.get(row.id_moto);
      const client = moto ? clientMap.get(moto.id_cliente) : null;
      return {
        id: row.id_os, status: row.status, entry: row.data_entrada,
        forecast: row.previsao_entrega, total: row.total,
        client: client?.nome ?? 'Cliente não encontrado', phone: client?.telefone ?? null,
        motorcycle: moto?.modelo ?? 'Motocicleta não encontrada', plate: moto?.placa ?? null,
        mechanic: row.id_mecanico ? mechanicMap.get(row.id_mecanico)?.nome ?? 'Não informado' : 'Não atribuído',
        paymentStatus: paymentMap.get(row.id_os) === 'pago' ? 'pago' : 'pendente',
      };
    }),
    total: count ?? 0, page: filters.page, pageSize: ORDERS_PER_PAGE,
  };
}

const createOrderSchema = z.object({
  clientId: z.number().int().positive().nullable(),
  clientName: z.string().trim().max(100),
  clientPhone: z.string().trim().max(20),
  clientEmail: z.union([z.email().max(150),z.literal('')]),
  clientCpf: z.union([z.string().regex(/^\d{11}$/),z.literal('')]),
  motorcycleId: z.number().int().positive().nullable(),
  model: z.string().trim().max(100),
  plate: z.string().trim().toUpperCase().max(10),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1).nullable(),
  color: z.string().trim().max(50),
  mileage: z.number().int().min(0).max(2_000_000).nullable(),
  mechanicId: z.number().int().positive().nullable(),
  entryAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  forecastAt: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),z.literal('')]),
  problem: z.string().trim().min(3).max(255),
  observations: z.string().trim().max(255),
  photos: z.array(z.object({ data: z.string().max(750_000) })).max(4),
}).superRefine((input, ctx) => {
  if (!input.clientId && (input.clientName.length < 2 || input.clientPhone.replace(/\D/g,'').length < 10))
    ctx.addIssue({ code:'custom',message:'Informe o nome e um telefone válido do cliente.' });
  if (!input.motorcycleId && (input.model.length < 2 || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(input.plate)))
    ctx.addIssue({ code:'custom',message:'Informe o modelo e uma placa válida para a moto.' });
  if (input.forecastAt && input.forecastAt < input.entryAt)
    ctx.addIssue({ code:'custom',message:'A previsão deve ser posterior à data de entrada.' });
});

const motorcycleInputSchema=z.object({
  clientId:z.number().int().positive(),model:z.string().trim().min(2).max(100),
  plate:z.string().trim().regex(/^[A-Za-z]{3}[0-9][A-Za-z0-9][0-9]{2}$/),
  year:z.number().int().min(1900).max(2100).nullable(),modelYear:z.number().int().min(1900).max(2100).nullable(),
  color:z.string().trim().max(40),mileage:z.number().int().min(0).max(10_000_000).nullable(),
  chassis:z.string().trim().max(17),renavam:z.string().trim().regex(/^(?:\d{11})?$/),
  notes:z.string().trim().max(1000),active:z.boolean(),
}).strict();

app.get('/api/motorcycles',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  try{
    const bikes:Record<string,any>[]=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from('moto').select('id_moto,id_cliente,modelo,placa,ano,ano_modelo,cor,quilometragem,chassi,renavam,observacoes,ativa')
        .order('id_moto',{ascending:false}).range(offset,offset+499);
      if(error)throw error;bikes.push(...(data??[]));if(!data||data.length<500)break;
    }
    const ids=bikes.map(bike=>bike.id_moto);
    const clients:Record<string,any>[]=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from('cliente').select('id_cliente,nome,telefone,excluido_em')
        .order('id_cliente').range(offset,offset+499);
      if(error)throw error;clients.push(...(data??[]));if(!data||data.length<500)break;
    }
    const orders:Record<string,any>[]=[];
    for(let index=0;index<ids.length;index+=200){
      const selected=ids.slice(index,index+200);
      for(let offset=0;;offset+=500){
        const {data,error}=await db.from('ordem_servico').select('id_os,id_moto,status,data_entrada,data_saida')
          .in('id_moto',selected).order('id_os',{ascending:false}).range(offset,offset+499);
        if(error)throw error;orders.push(...(data??[]));if(!data||data.length<500)break;
      }
    }
    const clientMap=new Map(clients.map(client=>[client.id_cliente,client]));
    const latest=new Map<number,any>();
    const orderCount=new Map<number,number>();
    for(const order of orders){
      orderCount.set(order.id_moto,(orderCount.get(order.id_moto)??0)+1);
      const previous=latest.get(order.id_moto);
      if(!previous||new Date(order.data_entrada).getTime()>new Date(previous.data_entrada).getTime()||
        (order.data_entrada===previous.data_entrada&&order.id_os>previous.id_os))latest.set(order.id_moto,order);
    }
    const paymentMap=new Map<number,string>();
    const latestIds=[...latest.values()].map(order=>order.id_os);
    for(let index=0;index<latestIds.length;index+=200){
      const {data,error}=await db.from('pagamento_os').select('id_os,status').in('id_os',latestIds.slice(index,index+200));
      if(error)throw error;
      for(const payment of data??[])paymentMap.set(payment.id_os,payment.status);
    }
    const items=bikes.filter(bike=>!clientMap.get(bike.id_cliente)?.excluido_em).map(bike=>{
      const client=clientMap.get(bike.id_cliente),last=latest.get(bike.id_moto);
      const paid=last?paymentMap.get(last.id_os)==='pago':false;
      const status=statusMotocicleta(bike.ativa,last?.status,paid,!!last?.data_saida);
      return {id:bike.id_moto,clientId:bike.id_cliente,client:client?.nome??'Cliente indisponível',phone:client?.telefone??null,
        model:bike.modelo,plate:bike.placa,year:bike.ano,modelYear:bike.ano_modelo,color:bike.cor,mileage:bike.quilometragem,
        chassis:bike.chassi??'',renavam:bike.renavam??'',notes:bike.observacoes??'',active:bike.ativa,status,
        lastOrder:last?{id:last.id_os,date:last.data_entrada,status:last.status,paymentStatus:paid?'pago':'pendente'}:null,orderCount:orderCount.get(bike.id_moto)??0};
    });
    const counts:Record<string,number>={all:items.length,active:0,maintenance:0,completed:0,pickup:0,inactive:0,delivered:0,cancelled:0,'no-orders':0};
    for(const item of items)counts[item.status]=(counts[item.status]??0)+1;
    return res.json({items,counts,clients:clients.filter(client=>!client.excluido_em).map(client=>({id:client.id_cliente,name:client.nome}))});
  }catch(error){console.error('[motorcycles/list]',error);return res.status(503).json({message:'Não foi possível carregar as motocicletas.'});}
});

app.post('/api/motorcycles',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const parsed=motorcycleInputSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:'Confira os dados da motocicleta.'});
  const input=parsed.data;
  try{
    const {data:owner,error:ownerError}=await db.from('cliente').select('id_cliente,excluido_em').eq('id_cliente',input.clientId).maybeSingle();
    if(ownerError)throw ownerError;
    if(!owner||owner.excluido_em)return res.status(404).json({message:'Selecione um cliente ativo.'});
    const normalized=formatarNomeModeloMoto(input.model);
    const {data,error}=await db.from('moto').insert({id_cliente:input.clientId,modelo:normalized,placa:input.plate.toUpperCase(),
      ano:input.year,ano_modelo:input.modelYear,cor:input.color||null,quilometragem:input.mileage,chassi:input.chassis||null,
      renavam:input.renavam||null,observacoes:input.notes||null,ativa:input.active}).select('id_moto').single();
    if(error?.code==='23505')return res.status(409).json({message:'Esta placa já está cadastrada.'});
    if(error)throw error;
    void enfileirarModelo(db,normalized).catch(err=>console.error('[motorcycles/thumbnail]',err));
    return res.status(201).json({id:data.id_moto});
  }catch(error){console.error('[motorcycles/create]',error);return res.status(503).json({message:'Não foi possível cadastrar a motocicleta.'});}
});

app.patch('/api/motorcycles/:id',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed=motorcycleInputSchema.safeParse(req.body);
  if(!id.success||!parsed.success)return res.status(400).json({message:'Confira os dados da motocicleta.'});
  const input=parsed.data;
  try{
    const [{data:old,error:oldError},{data:owner,error:ownerError}]=await Promise.all([
      db.from('moto').select('id_cliente,modelo').eq('id_moto',id.data).maybeSingle(),
      db.from('cliente').select('id_cliente,excluido_em').eq('id_cliente',input.clientId).maybeSingle(),
    ]);
    if(oldError||ownerError)throw oldError||ownerError;
    if(!old)return res.status(404).json({message:'Motocicleta não encontrada.'});
    if(!owner||owner.excluido_em)return res.status(404).json({message:'Selecione um cliente ativo.'});
    if(old.id_cliente!==input.clientId){
      const {count,error}=await db.from('ordem_servico').select('id_os',{count:'exact',head:true}).eq('id_moto',id.data);
      if(error)throw error;
      if(count)return res.status(409).json({message:'Esta moto possui OS vinculadas. O proprietário não pode ser alterado sem transferir também o histórico.'});
    }
    const normalized=formatarNomeModeloMoto(input.model);
    const {data,error}=await db.from('moto').update({id_cliente:input.clientId,modelo:normalized,placa:input.plate.toUpperCase(),
      ano:input.year,ano_modelo:input.modelYear,cor:input.color||null,quilometragem:input.mileage,chassi:input.chassis||null,
      renavam:input.renavam||null,observacoes:input.notes||null,ativa:input.active}).eq('id_moto',id.data).select('id_moto').maybeSingle();
    if(error?.code==='23505')return res.status(409).json({message:'Esta placa já está cadastrada em outra moto.'});
    if(error)throw error;
    if(!data)return res.status(404).json({message:'Motocicleta não encontrada.'});
    if(normalized!==old.modelo)void enfileirarModelo(db,normalized).catch(err=>console.error('[motorcycles/thumbnail]',err));
    return res.json({ok:true});
  }catch(error){console.error('[motorcycles/edit]',error);return res.status(503).json({message:'Não foi possível salvar a motocicleta.'});}
});

app.delete('/api/motorcycles/:id',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if(!id.success)return res.status(400).json({message:'Motocicleta inválida.'});
  return res.status(409).json({message:'A exclusão de motocicletas foi desativada para preservar o cadastro e o histórico. Edite a motocicleta para marcar o cadastro como inativo.'});
});

app.get('/api/orders/create-options', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  try {
    const [{ data: clients, error: clientError }, { data: motorcycles, error: motoError },
      { data: mechanics, error: mechanicError }] = await Promise.all([
      db.from('cliente').select('id_cliente,nome,telefone,email,cpf').is('excluido_em',null).order('nome').limit(2000),
      db.from('moto').select('id_moto,id_cliente,modelo,placa,ano,cor,quilometragem').order('id_moto',{ ascending:false }).limit(5000),
      db.from('mecanico').select('id_funcionario').limit(500),
    ]);
    if (clientError || motoError || mechanicError) throw clientError || motoError || mechanicError;
    const mechanicIds = (mechanics ?? []).map(item => item.id_funcionario);
    const { data: staff, error: staffError } = mechanicIds.length
      ? await db.from('funcionario').select('id_funcionario,nome').in('id_funcionario',mechanicIds)
      : { data:[],error:null };
    if (staffError) throw staffError;
    return res.json({
      clients:(clients ?? []).map(c => ({ id:c.id_cliente,name:c.nome,phone:c.telefone,email:c.email,cpf:c.cpf })),
      motorcycles:(motorcycles ?? []).map(m => ({ id:m.id_moto,clientId:m.id_cliente,model:m.modelo,plate:m.placa,year:m.ano,color:m.cor,mileage:m.quilometragem })),
      mechanics:(staff ?? []).map(m => ({ id:m.id_funcionario,name:m.nome })),
    });
  } catch (error) {
    console.error('[orders/create-options]',error);
    return res.status(500).json({ message:'Não foi possível carregar clientes e motos para a nova OS.' });
  }
});

app.post('/api/orders', async (req,res) => {
  const db=await ordersClient(req,res); if(!db)return;
  const parsed=createOrderSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({ message:parsed.error.issues[0]?.message || 'Confira os dados da OS.' });
  const input=parsed.data;
  const uploaded:string[]=[];
  try {
    const photos:{url:string}[]=[];
    const draft=randomUUID();
    const validPhotos=input.photos.map(photo=>{
      const match=/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo.data);
      if(!match) throw new Error('As fotos devem ser imagens JPEG válidas.');
      const bytes=Buffer.from(match[1],'base64');
      if(bytes.length > 550_000 || bytes.length < 100 || bytes[0]!==0xff || bytes[1]!==0xd8 || bytes[2]!==0xff)
        throw new Error('Foto inválida ou maior que 550 KB.');
      return bytes;
    });
    for(const [index,bytes] of validPhotos.entries()) {
      const path=`orders/${draft}/entrada-${index+1}.jpg`;
      const { error:uploadError }=await db.storage.from('fotos-os').upload(path,bytes,{ contentType:'image/jpeg',upsert:false });
      if(uploadError) throw uploadError;
      uploaded.push(path);
      photos.push({ url:db.storage.from('fotos-os').getPublicUrl(path).data.publicUrl });
    }
    const { data,error }=await db.rpc('admin_create_order',{
      p_payload:{ ...input,model:input.motorcycleId ? input.model : formatarNomeModeloMoto(input.model),photos,clientCpf:input.clientCpf,year:input.year,mileage:input.mileage },
    });
    if(error) throw error;
    return res.status(201).json(data);
  } catch(error) {
    if(uploaded.length) await db.storage.from('fotos-os').remove(uploaded);
    console.error('[orders/create]',error);
    const message=String((error as { message?:string })?.message ?? '');
    return res.status(message.includes('duplicate key') ? 409 : message.startsWith('Foto') || message.startsWith('As fotos') ? 400 : 500).json({
      message:message.includes('moto_placa_key') ? 'Esta placa já está cadastrada. Selecione a moto existente.'
        : message.includes('não pertence') || message.includes('não encontrado') ? message
        : message.startsWith('Foto') || message.startsWith('As fotos') ? message
        : 'Não foi possível cadastrar a OS. Confira os dados e tente novamente.',
    });
  }
});

const registerEmployeeSchema=z.object({
  name:z.string().trim().min(2).max(100),
  email:z.email().max(150),
  phone:z.string().trim().refine(value => value.replace(/\D/g,'').length >= 10 && value.length <= 20),
  cpf:z.string().regex(/^\d{11}$/),
  position:z.enum(['Administrador','Cliente','Mecânico']),
  profile:z.enum(['Administrador','Cliente','Mecânico']),
  password:z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^\w\s]/),
}).refine(value => value.position === value.profile,{ message:'Cargo e perfil de acesso devem corresponder.' });

app.post('/api/admin/users',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const parsed=registerEmployeeSchema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({ message:parsed.error.issues[0]?.message || 'Confira os dados do usuário.' });
  const input=parsed.data;
  const email=input.email.toLowerCase();
  try {
    if(input.position!=='Cliente') {
      const [{data:byEmail,error:emailError},{data:byCpf,error:cpfError}]=await Promise.all([
        db.from('funcionario').select('id_funcionario').eq('email',email).limit(1),
        db.from('funcionario').select('id_funcionario').eq('cpf',input.cpf).limit(1),
      ]);
      if(emailError||cpfError) throw emailError||cpfError;
      if(byEmail?.length||byCpf?.length) return res.status(409).json({ message:'E-mail ou CPF já cadastrado como funcionário.' });
    }
    const { data:created,error:authError }=await db.auth.admin.createUser({
      email,password:input.password,email_confirm:true,
    });
    if(authError || !created.user) {
      console.error('[users/auth-create]',authError);
      return res.status(409).json({ message:'Não foi possível criar a conta. Verifique se o e-mail já está em uso.' });
    }
    const { data:id,error:profileError }=await db.rpc(input.position==='Cliente'?'admin_register_client':'admin_register_employee',{
      p_payload:{ name:input.name,email,phone:input.phone,cpf:input.cpf,position:input.position,profile:input.profile,authUserId:created.user.id },
    });
    if(profileError) {
      const { error:cleanupError }=await db.auth.admin.deleteUser(created.user.id);
      console.error('[users/profile-create]',profileError,'cleanup',cleanupError);
      return res.status(500).json({ message:cleanupError ? 'A conta Auth foi criada, mas o perfil falhou. Contate o administrador antes de tentar novamente.' : /clientes diferentes|conta vinculada|não confere/.test(String(profileError.message)) ? profileError.message : 'Não foi possível cadastrar o usuário. Nenhuma conta foi mantida.' });
    }
    return res.status(201).json({ id });
  } catch(error) {
    console.error('[users/create]',error);
    return res.status(500).json({ message:'Não foi possível cadastrar o usuário.' });
  }
});

app.get('/api/admin/notifications',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const userId=res.locals.adminUserId as string;
  try {
    const {data:events,error:eventError}=await db.from('admin_notifications')
      .select('id,kind,order_id,title,body,created_at').order('created_at',{ascending:false}).limit(100);
    if(eventError)throw eventError;
    const ids=(events??[]).map(event=>event.id);
    const {data:receipts,error:receiptError}=ids.length
      ?await db.from('admin_notification_receipts').select('notification_id,read_at,dismissed_at')
        .eq('admin_user_id',userId).in('notification_id',ids)
      :{data:[],error:null};
    if(receiptError)throw receiptError;
    const state=new Map((receipts??[]).map(receipt=>[receipt.notification_id,receipt]));
    const items=(events??[]).filter(event=>!state.get(event.id)?.dismissed_at)
      .slice(0,40).map(event=>({id:event.id,kind:event.kind,orderId:event.order_id,
        title:event.title,body:event.body,createdAt:event.created_at,read:!!state.get(event.id)?.read_at}));
    const unreadCount=(events??[]).filter(event=>!state.get(event.id)?.dismissed_at&&!state.get(event.id)?.read_at).length;
    return res.json({items,unreadCount});
  }catch(error){console.error('[notifications/list]',error);return res.status(500).json({message:'Não foi possível carregar as notificações.'});}
});

// "Vi tudo" afeta somente o administrador logado. Mantemos os eventos globais
// para os demais administradores e deixamos eventos criados depois do clique.
app.post('/api/admin/notifications/clear',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const userId=res.locals.adminUserId as string;
  try{
    const {data:latest,error:latestError}=await db.from('admin_notifications')
      .select('id').order('id',{ascending:false}).limit(1).maybeSingle();
    if(latestError)throw latestError;
    if(!latest)return res.json({cleared:0});
    let cursor=0;
    let cleared=0;
    while(true){
      const {data:events,error:listError}=await db.from('admin_notifications')
        .select('id').gt('id',cursor).lte('id',latest.id).order('id').limit(250);
      if(listError)throw listError;
      if(!events?.length)break;
      const now=new Date().toISOString();
      const {error:receiptError}=await db.from('admin_notification_receipts').upsert(
        events.map(event=>({notification_id:event.id,admin_user_id:userId,read_at:now,dismissed_at:now})),
        {onConflict:'notification_id,admin_user_id'});
      if(receiptError)throw receiptError;
      cursor=events[events.length-1].id;
      cleared+=events.length;
      if(events.length<250)break;
    }
    return res.json({cleared});
  }catch(error){console.error('[notifications/clear]',error);return res.status(500).json({message:'Não foi possível limpar todos os avisos. Tente novamente.'});}
});

app.patch('/api/admin/notifications/:id',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const id=Number(req.params.id);
  const action=req.body?.action;
  if(!Number.isSafeInteger(id)||id<1||!['read','dismiss'].includes(action))
    return res.status(400).json({message:'Ação de notificação inválida.'});
  const userId=res.locals.adminUserId as string;
  try {
    const {data:notification,error:findError}=await db.from('admin_notifications').select('id').eq('id',id).maybeSingle();
    if(findError)throw findError;
    if(!notification)return res.status(404).json({message:'Notificação não encontrada.'});
    const {error}=await db.from('admin_notification_receipts').upsert({
      notification_id:id,admin_user_id:userId,read_at:new Date().toISOString(),
      ...(action==='dismiss'?{dismissed_at:new Date().toISOString()}:{}),
    },{onConflict:'notification_id,admin_user_id'});
    if(error)throw error;
    return res.json({ok:true});
  }catch(error){console.error('[notifications/action]',error);return res.status(500).json({message:'Não foi possível atualizar a notificação.'});}
});

app.get('/api/orders', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const parsed = orderQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Filtros inválidos.' });
  try {
    const { data: filterBikes, error: filterError } = parsed.data.clientId
      ? await db.from('moto').select('id_moto').eq('id_cliente', parsed.data.clientId)
      : { data: null, error: null };
    if (filterError) throw filterError;
    const scopedBikeIds = filterBikes?.map(bike => bike.id_moto) ?? [];
    const [result, ...counts] = await Promise.all([
      loadOrders(db, parsed.data),
      ...(['aguardando', 'em andamento', 'aguardando peça', 'pronto', 'entregue', 'cancelada'] as const).map(status => {
        let countQuery = db.from('ordem_servico').select('id_os', { count: 'exact', head: true }).eq('status', status);
        if (parsed.data.clientId) countQuery = countQuery.in('id_moto', scopedBikeIds.length ? scopedBikeIds : [-1]);
        return countQuery;
      }),
    ]);
    if (counts.some(item => item.error)) throw new Error('Não foi possível contar os status.');
    return res.json({ ...result, counts: {
      aguardando: counts[0].count ?? 0, 'em andamento': counts[1].count ?? 0,
      'aguardando peça': counts[2].count ?? 0, pronto: counts[3].count ?? 0,
      entregue: counts[4].count ?? 0, cancelada: counts[5].count ?? 0,
    } });
  } catch (error) {
    console.error('[orders]', error);
    return res.status(500).json({ message: 'Não foi possível carregar as ordens de serviço.' });
  }
});

app.get('/api/orders/export', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const parsed = orderQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Filtros inválidos.' });
  try {
    const all = [];
    for (let page = 1; page <= 1000; page++) {
      const result = await loadOrders(db, { ...parsed.data, page });
      all.push(...result.items);
      if (page * ORDERS_PER_PAGE >= result.total) break;
    }
    const csvCell = (value: unknown) => {
      const raw = String(value ?? '');
      const safe = /^[\s]*[=+@\-]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const lines = [
      ['Nº OS', 'Cliente', 'Telefone', 'Motocicleta', 'Placa', 'Status', 'Entrada', 'Previsão', 'Responsável', 'Total', 'Pagamento'],
      ...all.map(row => [`OS #${row.id}`, row.client, row.phone, row.motorcycle, row.plate, row.status, row.entry, row.forecast, row.mechanic, row.total, row.paymentStatus]),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ordens-de-servico.csv"');
    return res.send('\uFEFF' + lines.map(line => line.map(csvCell).join(';')).join('\r\n'));
  } catch (error) {
    console.error('[orders/export]', error);
    return res.status(500).json({ message: 'Não foi possível exportar as ordens.' });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z.object({ status: z.enum(['aguardando', 'em andamento', 'aguardando peça', 'pronto', 'entregue', 'cancelada']), observation: z.string().trim().max(500).optional() }).strict().safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ message: 'Status ou número da OS inválido.' });
  if(body.data.status==='cancelada'&&!body.data.observation?.trim())return res.status(422).json({message:'Informe o motivo do cancelamento.'});
  try {
    const { data: existing, error: readError } = await db.from('ordem_servico').select('id_os,status').eq('id_os', id.data).maybeSingle();
    if (readError) throw readError;
    if (!existing) return res.status(404).json({ message: 'OS não encontrada.' });
    if (existing.status === body.data.status) return res.status(409).json({ message: 'A OS já está nesse status. Escolha outro para registrar uma alteração.' });
    const { error } = await db.rpc('admin_order_status', { p_id_os: id.data, p_status: body.data.status, p_observation: body.data.observation ?? '', p_actor: res.locals.adminUserId });
    if (error) throw error;
    return res.json({ id: id.data, status: body.data.status });
  } catch (error) {
    console.error('[orders/status]', error);
    return res.status(500).json({ message: 'Não foi possível alterar o status da OS.' });
  }
});

app.get('/api/orders/:id/actions', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
  try {
    const { data: order, error: orderError } = await db.from('ordem_servico')
      .select('id_os,id_moto,status,problema_relatado,observacoes').eq('id_os', id.data).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ message: 'OS não encontrada.' });
    const { data: moto, error: motoError } = await db.from('moto').select('id_cliente,modelo,placa,ano,cor').eq('id_moto', order.id_moto).maybeSingle();
    if (motoError || !moto) throw motoError ?? new Error('Motocicleta não encontrada.');
    const { data: client, error: clientError } = await db.from('cliente').select('nome,telefone,email,cpf').eq('id_cliente', moto.id_cliente).maybeSingle();
    if (clientError || !client) throw clientError ?? new Error('Cliente não encontrado.');
    return res.json({ id: order.id_os, status: order.status, client: { name: client.nome, phone: client.telefone, email: client.email, cpf: client.cpf },
      motorcycle: { model: moto.modelo, plate: moto.placa, year: moto.ano, color: moto.cor },
      problem: order.problema_relatado, observations: order.observacoes });
  } catch (error) {
    console.error('[orders/actions]', error);
    return res.status(500).json({ message: 'Não foi possível carregar as informações da OS.' });
  }
});

const correctOrderSchema = z.object({
  client: z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().max(20),
    email: z.union([z.email().max(150), z.literal('')]), cpf: z.string().trim().max(20).refine(value => !value || (/^[\d.\-\s]+$/.test(value) && value.replace(/\D/g, '').length === 11)) }).strict(),
  motorcycle: z.object({ model: z.string().trim().min(2).max(100), plate: z.string().trim().min(5).max(10).regex(/^[A-Za-z0-9-]+$/),
    year: z.number().int().min(1900).max(2100).nullable(), color: z.string().trim().max(50) }).strict(),
  problem: z.string().trim().max(2000), observations: z.string().trim().max(2000),
}).strict();

app.put('/api/orders/:id/actions', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = correctOrderSchema.safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ message: body.error?.issues.some(issue => issue.path.join('.') === 'client.cpf')
    ? 'O CPF precisa ter 11 dígitos. Confira e tente novamente.' : 'Confira os campos da OS antes de salvar.' });
  const { client, motorcycle, problem, observations } = body.data;
  try {
    const { data: existing, error: readError } = await db.from('ordem_servico').select('id_os').eq('id_os', id.data).maybeSingle();
    if (readError) throw readError;
    if (!existing) return res.status(404).json({ message: 'OS não encontrada.' });
    const { error } = await db.rpc('admin_order_edit', { p_id_os: id.data, p_name: client.name, p_phone: client.phone, p_email: client.email,
      p_cpf: client.cpf ? client.cpf.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '',
      p_model: formatarNomeModeloMoto(motorcycle.model), p_plate: motorcycle.plate.toUpperCase(), p_year: motorcycle.year,
      p_color: motorcycle.color, p_problem: problem, p_observations: observations, p_actor: res.locals.adminUserId });
    if (error?.code === '23505') return res.status(409).json({ message: 'Essa placa já está cadastrada em outra motocicleta.' });
    if (error) throw error;
    void enfileirarModelo(db, formatarNomeModeloMoto(motorcycle.model)).catch(generationError => console.error('[motorcycle-image/edit]', generationError));
    return res.json({ ok: true });
  } catch (error) {
    console.error('[orders/edit]', error);
    return res.status(500).json({ message: 'Não foi possível salvar as informações da OS.' });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z.object({ confirmId: z.number().int().positive(), reason: z.string().trim().max(500).optional() }).strict().safeParse(req.body);
  if (!id.success || !body.success || body.data.confirmId !== id.data) return res.status(400).json({ message: 'Confirme o número da OS para excluir.' });
  try {
    const { data: existing, error: readError } = await db.from('ordem_servico').select('id_os').eq('id_os', id.data).maybeSingle();
    if (readError) throw readError;
    if (!existing) return res.status(404).json({ message: 'OS não encontrada.' });
    const { error } = await db.rpc('admin_order_delete', { p_id_os: id.data, p_actor: res.locals.adminUserId, p_reason: body.data.reason ?? '' });
    if (error) throw error;
    return res.status(204).end();
  } catch (error) {
    console.error('[orders/delete]', error);
    return res.status(500).json({ message: 'Não foi possível excluir a OS.' });
  }
});

app.get('/api/orders/:id/history', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
  try {
    const { data: source, error: sourceError } = await db.from('ordem_servico').select('id_moto').eq('id_os', id.data).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return res.status(404).json({ message: 'OS não encontrada.' });
    const [{ data: moto, error: motoError }, { data: rows, error: rowsError }] = await Promise.all([
      db.from('moto').select('id_moto,id_cliente,modelo,placa,ano,cor,foto,quilometragem').eq('id_moto', source.id_moto).maybeSingle(),
      db.from('ordem_servico').select('id_os,id_mecanico,status,data_entrada,data_saida,quilometragem_entrada,quilometragem_saida,total,problema_relatado,observacoes').eq('id_moto', source.id_moto).order('data_entrada', { ascending: false }).limit(1000),
    ]);
    if (motoError || rowsError || !moto) throw new Error('Falha ao carregar histórico da motocicleta.');
    const os = rows ?? [];
    const ids = os.map(row => row.id_os);
    const mechanicIds = [...new Set(os.map(row => row.id_mecanico).filter((value): value is number => value != null))];
    const [{ data: client, error: clientError }, { data: mechanics, error: mechanicsError }, { data: services, error: servicesError }, { data: parts, error: partsError }, { data: payments, error: paymentsError }, { data: cancellationEvents, error: cancellationError }] = await Promise.all([
      db.from('cliente').select('nome').eq('id_cliente', moto.id_cliente).maybeSingle(),
      mechanicIds.length ? db.from('funcionario').select('id_funcionario,nome').in('id_funcionario', mechanicIds) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from('os_servico').select('id_os,descricao,preco').in('id_os', ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from('os_peca').select('id_os,nome_peca,quantidade,preco_unitario').in('id_os', ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from('pagamento_os').select('id_os,status').in('id_os', ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? db.from('order_status_history').select('order_id,note,changed_at').in('order_id',ids).eq('next_status','cancelada').order('changed_at',{ascending:false}) : Promise.resolve({data:[],error:null}),
    ]);
    if (clientError || mechanicsError || servicesError || partsError || paymentsError || cancellationError) throw new Error('Falha ao carregar itens do histórico.');
    const mechanicNames = new Map((mechanics ?? []).map(person => [person.id_funcionario, person.nome]));
    const paymentStates = new Map((payments ?? []).map(payment => [payment.id_os, payment.status]));
    const cancellationReasons=new Map<number,string|null>();
    for(const event of cancellationEvents??[])if(!cancellationReasons.has(event.order_id))cancellationReasons.set(event.order_id,event.note?.trim()||null);
    const history = os.map(row => ({
      id: row.id_os, status: row.status, entry: row.data_entrada, exit: row.data_saida,
      problem: row.problema_relatado, observations: row.observacoes, cancellationReason:row.status==='cancelada'?cancellationReasons.get(row.id_os)??null:null,
      kmEntry: row.quilometragem_entrada, kmExit: row.quilometragem_saida,
      mechanic: row.id_mecanico ? mechanicNames.get(row.id_mecanico) ?? 'Não informado' : 'Não atribuído',
      paymentStatus: paymentStates.get(row.id_os) === 'pago' ? 'pago' : 'pendente',
      services: (services ?? []).filter(item => item.id_os === row.id_os).map(item => ({ description: item.descricao, price: Number(item.preco) })),
      parts: (parts ?? []).filter(item => item.id_os === row.id_os).map(item => ({ name: item.nome_peca, quantity: Number(item.quantidade), unitPrice: Number(item.preco_unitario) })),
      total: row.total == null ? null : Number(row.total),
    }));
    const partTotals = new Map<string, { name: string; quantity: number; total: number }>();
    for (const part of parts ?? []) {
      const key = part.nome_peca.trim().toLocaleLowerCase('pt-BR');
      const item = partTotals.get(key) ?? { name: part.nome_peca, quantity: 0, total: 0 };
      item.quantity += Number(part.quantidade);
      item.total += Number(part.quantidade) * Number(part.preco_unitario);
      partTotals.set(key, item);
    }
    const km = os.map(row => row.quilometragem_saida ?? row.quilometragem_entrada).filter((value): value is number => value != null);
    return res.json({
      motorcycle: { id: moto.id_moto, model: moto.modelo, plate: moto.placa, year: moto.ano, color: moto.cor, photo: moto.foto,
        km: Math.max(0, Number(moto.quilometragem ?? 0), ...km), client: client?.nome ?? 'Cliente não encontrado' },
      summary: { total: history.length, completed: history.filter(row => row.status === 'entregue').length,
        inProgress: history.filter(row => row.status === 'em andamento').length,
        cancelled: history.filter(row => row.status === 'cancelada').length,
        waitingParts: history.filter(row => row.status === 'aguardando peça').length,
        open: history.filter(row => row.status === 'aguardando').length,
        services: (services ?? []).length, parts: (parts ?? []).reduce((sum, item) => sum + Number(item.quantidade), 0),
        spent: history.reduce((sum, row) => sum + (row.total ?? row.services.reduce((n, item) => n + item.price, 0) + row.parts.reduce((n, item) => n + item.quantity * item.unitPrice, 0)), 0) },
      mostUsedParts: [...partTotals.values()].sort((a, b) => b.quantity - a.quantity || b.total - a.total),
      orders: history,
    });
  } catch (error) {
    console.error('[orders/history]', error);
    return res.status(500).json({ message: 'Não foi possível carregar o histórico da motocicleta.' });
  }
});

const CLIENT_PHOTO_BUCKET='cliente-fotos';
app.get('/api/clients', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  try { return res.json(await diretorioClientes(db)); }
  catch (error) { console.error('[clients/list]', error); return res.status(500).json({ message: 'Não foi possível carregar os clientes.' }); }
});
app.get('/api/clients/:id', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Cliente inválido.' });
  try {
    const profile = await perfilClienteNoDiretorio(db, id.data);
    return profile ? res.json(profile) : res.status(404).json({ message: 'Cliente não encontrado.' });
  } catch (error) { console.error('[clients/profile]', error); return res.status(500).json({ message: 'Não foi possível carregar o perfil do cliente.' }); }
});
app.patch('/api/clients/:id', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const values = z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(30).nullable(),
    email: z.union([z.literal(''), z.string().trim().email().max(254)]).nullable(),
    cpf: z.string().trim().regex(/^(?:\d{11})?$/),
    birthDate: z.iso.date().nullable(),
    postalCode: z.string().regex(/^(?:\d{8})?$/).nullable(),
    address: z.string().trim().max(255).nullable(),
    addressNumber: z.string().trim().max(20).nullable(),
    district: z.string().trim().max(100).nullable(),
    city: z.string().trim().max(100).nullable(),
    state: z.string().trim().regex(/^(?:[A-Z]{2})?$/).nullable(),
    photo: z.string().max(2_800_000).optional(),
  }).safeParse(req.body);
  if (!id.success || !values.success) return res.status(400).json({ message: 'Confira os dados do cliente e tente novamente.' });
  const input = values.data;
  if (input.birthDate && input.birthDate > new Date().toISOString().slice(0, 10)) return res.status(400).json({ message: 'A data de nascimento não pode ser futura.' });
  let newPhoto: Buffer | null = null;
  if (input.photo) {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input.photo);
    if (!match) return res.status(400).json({ message: 'Envie uma foto JPEG válida.' });
    newPhoto = Buffer.from(match[1], 'base64');
    if (!newPhoto.length || newPhoto.length > 2_000_000 || newPhoto[0] !== 0xff || newPhoto[1] !== 0xd8 || newPhoto[2] !== 0xff)
      return res.status(400).json({ message: 'A foto precisa ser JPEG e ter até 2 MB.' });
  }
  let uploadedPath: string | null = null;
  try {
    const { data: existing, error: findError } = await db.from('cliente').select('id_cliente,foto').eq('id_cliente', id.data).is('excluido_em', null).maybeSingle();
    if (findError) throw findError;
    if (!existing) return res.status(404).json({ message: 'Cliente não encontrado.' });
    if (newPhoto) {
      uploadedPath = `clients/${id.data}/admin-${randomUUID()}.jpg`;
      const { error: uploadError } = await db.storage.from(CLIENT_PHOTO_BUCKET).upload(uploadedPath, newPhoto, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
    }
    const { data, error } = await db.from('cliente').update({
      nome: input.name, telefone: input.phone || null, email: input.email || null, cpf: input.cpf || null,
      data_nascimento: input.birthDate, cep: input.postalCode || null, endereco: input.address || null,
      numero: input.addressNumber || null, bairro: input.district || null, cidade: input.city || null,
      estado: input.state || null, ...(uploadedPath ? { foto: uploadedPath } : {}),
    }).eq('id_cliente', id.data).select('id_cliente').maybeSingle();
    if (error) throw error;
    if (uploadedPath && existing.foto?.startsWith(`clients/${id.data}/`) && existing.foto !== uploadedPath)
      void db.storage.from(CLIENT_PHOTO_BUCKET).remove([existing.foto]).then(({ error: cleanupError }) => {
        if (cleanupError) console.error('[clients/old-photo]', cleanupError);
      });
    return data ? res.json({ ok: true }) : res.status(404).json({ message: 'Cliente não encontrado.' });
  } catch (error) {
    if (uploadedPath) await db.storage.from(CLIENT_PHOTO_BUCKET).remove([uploadedPath]);
    console.error('[clients/update]', error); return res.status(500).json({ message: 'Não foi possível atualizar o cliente.' });
  }
});
app.delete('/api/clients/:id', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Cliente inválido.' });
  const reason = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(req.body);
  if (!reason.success) return res.status(400).json({ message: 'Informe o motivo da exclusão (mínimo de 5 caracteres).' });
  try {
    const { data, error } = await db.rpc('admin_client_archive', {
      p_client_id: id.data, p_actor: res.locals.adminUserId, p_reason: reason.data.reason,
    });
    if (error) throw error;
    return data ? res.json({ ok: true }) : res.status(404).json({ message: 'Cliente não encontrado ou já excluído.' });
  } catch (error) {
    console.error('[clients/archive]', error);
    return res.status(500).json({ message: 'Não foi possível excluir o cliente.' });
  }
});
app.get('/api/clients/:id/photo', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Cliente inválido.' });
  try {
    const { data: client, error: clientError } = await db.from('cliente').select('id_cliente,foto').eq('id_cliente', id.data).maybeSingle();
    if (clientError) throw clientError;
    if (!client?.foto || !client.foto.startsWith(`clients/${id.data}/`)) return res.status(404).json({ message: 'Foto não cadastrada.' });
    const { data, error } = await db.storage.from(CLIENT_PHOTO_BUCKET).download(client.foto);
    if (error || !data) return res.status(404).json({ message: 'Foto não encontrada.' });
    const image = Buffer.from(await data.arrayBuffer());
    res.type(client.foto.toLowerCase().endsWith('.png') ? 'png' : 'jpeg');
    return res.send(image);
  } catch (error) { console.error('[clients/photo]', error); return res.status(500).json({ message: 'Não foi possível carregar a foto do cliente.' }); }
});
async function clientForOrder(db:ReturnType<typeof createPrivilegedSupabaseClient>,id:number) {
  if(!db)throw new Error('Conexão de banco indisponível.');
  const {data:order,error:orderError}=await db.from('ordem_servico').select('id_moto').eq('id_os',id).maybeSingle();
  if(orderError)throw orderError;
  if(!order)return null;
  const {data:moto,error:motoError}=await db.from('moto').select('id_cliente').eq('id_moto',order.id_moto).maybeSingle();
  if(motoError)throw motoError;
  if(!moto)return null;
  const {data:client,error:clientError}=await db.from('cliente').select('id_cliente,foto').eq('id_cliente',moto.id_cliente).maybeSingle();
  if(clientError)throw clientError;
  return client;
}
function photoOrderId(req:express.Request,res:express.Response) {
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if(!id.success){res.status(400).json({message:'Número da OS inválido.'});return null;}
  return id.data;
}
app.get('/api/orders/:id/client-photo',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const id=photoOrderId(req,res);if(!id)return;
  try {
    const client=await clientForOrder(db,id);
    if(!client?.foto || !client.foto.startsWith(`clients/${client.id_cliente}/`))return res.status(404).json({message:'Foto não cadastrada.'});
    const {data,error}=await db.storage.from(CLIENT_PHOTO_BUCKET).download(client.foto);
    if(error||!data)return res.status(404).json({message:'Foto não encontrada.'});
    const image=Buffer.from(await data.arrayBuffer());
    res.type(client.foto.endsWith('.png')?'png':'jpeg');
    return res.send(image);
  }catch(error){console.error('[client-photo/read]',error);return res.status(500).json({message:'Não foi possível carregar a foto do cliente.'});}
});
app.get('/api/orders/:id', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
  try {
    const { data: order, error: orderError } = await db.from('ordem_servico')
      .select('id_os,id_moto,id_mecanico,status,data_entrada,data_saida,previsao_entrega,quilometragem_entrada,quilometragem_saida,total,problema_relatado,observacoes')
      .eq('id_os', id.data).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ message: 'OS não encontrada.' });
    const [{ data: moto, error: motoError }, { data: mechanic, error: mechanicError }, { data: services, error: servicesError }, { data: parts, error: partsError }, { data: photos, error: photosError }, { data: payment, error: paymentError }, { data: statusEvents, error: statusError }, { data: adminEvents, error: auditError }] = await Promise.all([
      db.from('moto').select('id_cliente,modelo,placa,ano,cor,foto').eq('id_moto', order.id_moto).maybeSingle(),
      order.id_mecanico ? db.from('funcionario').select('nome').eq('id_funcionario', order.id_mecanico).maybeSingle() : Promise.resolve({ data:null, error:null }),
      db.from('os_servico').select('descricao,preco').eq('id_os', id.data),
      db.from('os_peca').select('nome_peca,quantidade,preco_unitario').eq('id_os', id.data),
      db.from('foto_os').select('id_foto,tipo,url,data_registro').eq('id_os', id.data).eq('tipo', 'entrada').order('data_registro', { ascending:true }),
      db.from('pagamento_os').select('status').eq('id_os', id.data).maybeSingle(),
      db.from('order_status_history').select('id,previous_status,next_status,changed_at,actor_user_id,note').eq('order_id', id.data).order('changed_at', { ascending:false }).limit(200),
      db.from('order_admin_audit').select('id,action,admin_user_id,occurred_at,details').eq('order_id', id.data).eq('action', 'edit').order('occurred_at', { ascending:false }).limit(200),
    ]);
    if (motoError || mechanicError || servicesError || partsError || photosError || paymentError || statusError || auditError) throw new Error('Falha ao carregar dados relacionados à OS.');
    const { data: client, error: clientError } = moto
      ? await db.from('cliente').select('nome,telefone,email,foto').eq('id_cliente', moto.id_cliente).maybeSingle()
      : { data:null, error:null };
    if (clientError) throw clientError;
    const actorIds = [...new Set([...(statusEvents ?? []).map(event => event.actor_user_id), ...(adminEvents ?? []).map(event => event.admin_user_id)].filter((value): value is string => !!value))];
    const { data: actors, error: actorError } = actorIds.length
      ? await db.from('funcionario').select('auth_user_id,nome').in('auth_user_id', actorIds)
      : { data:[], error:null };
    if (actorError) throw actorError;
    const actorNames = new Map((actors ?? []).map(actor => [actor.auth_user_id, actor.nome]));
    const movements = [
      ...(statusEvents ?? []).map(event => ({ id:`status-${event.id}`, action:'status', before:event.previous_status, after:event.next_status,
        note:event.note ?? null, actor:actorNames.get(event.actor_user_id) ?? (event.actor_user_id ? 'Usuário autenticado' : 'Sistema'), at:event.changed_at })),
      ...(adminEvents ?? []).map(event => ({ id:`edit-${event.id}`, action:'edit', before:null, after:null,
        note:null, actor:actorNames.get(event.admin_user_id) ?? 'Administrador', at:event.occurred_at })),
    ].sort((a,b) => Date.parse(b.at) - Date.parse(a.at));
    const serviceTotal = (services ?? []).reduce((sum, item) => sum + Number(item.preco ?? 0), 0);
    const partsTotal = (parts ?? []).reduce((sum, item) => sum + Number(item.quantidade) * Number(item.preco_unitario ?? 0), 0);
    return res.json({
      id:order.id_os, status:order.status, entry:order.data_entrada, exit:order.data_saida,
      forecast:order.previsao_entrega, lastUpdated:movements[0]?.at ?? order.data_saida ?? order.data_entrada,
      movements,
      mechanic:mechanic?.nome ?? 'Não atribuído', total:order.total == null ? null : Number(order.total),
      problem:order.problema_relatado, observations:order.observacoes,
      cancellationReason:order.status==='cancelada'?statusEvents?.find(event=>event.next_status==='cancelada')?.note?.trim()??null:null,
      client:{ name:client?.nome ?? 'Cliente não encontrado', phone:client?.telefone ?? null, email:client?.email ?? null, photo:client?.foto ?? null },
      motorcycle:{ model:moto?.modelo ?? 'Motocicleta não encontrada', plate:moto?.placa ?? null, year:moto?.ano ?? null,
        color:moto?.cor ?? null, photo:moto?.foto ?? null, kmEntry:order.quilometragem_entrada, kmExit:order.quilometragem_saida },
      services:(services ?? []).map(item => ({ description:item.descricao, price:Number(item.preco) })),
      parts:(parts ?? []).map(item => ({ name:item.nome_peca, quantity:item.quantidade, unitPrice:Number(item.preco_unitario) })),
      photos:(photos ?? []).map(item => ({ id:item.id_foto, url:item.url, recordedAt:item.data_registro })),
      serviceTotal, partsTotal, paymentStatus:payment?.status === 'pago' ? 'pago' : 'pendente',
    });
  } catch (error) {
    console.error('[orders/details]', error);
    return res.status(500).json({ message: 'Não foi possível carregar os detalhes da OS.' });
  }
});

async function paymentSummary(db: ReturnType<typeof createSupabaseClient>, id: number) {
  const [{ data: order, error: orderError }, { data: parts, error: partsError }, { data: services, error: servicesError }] = await Promise.all([
    db.from('ordem_servico').select('id_os,id_moto,total').eq('id_os', id).maybeSingle(),
    db.from('os_peca').select('quantidade,preco_unitario').eq('id_os', id),
    db.from('os_servico').select('preco').eq('id_os', id),
  ]);
  if (orderError || partsError || servicesError) throw new Error('Não foi possível consultar o resumo da OS.');
  if (!order) return null;
  const { data: moto, error: motoError } = await db.from('moto').select('id_cliente,modelo,placa').eq('id_moto', order.id_moto).maybeSingle();
  if (motoError) throw new Error('Não foi possível consultar a motocicleta.');
  const { data: client, error: clientError } = moto
    ? await db.from('cliente').select('nome,telefone').eq('id_cliente', moto.id_cliente).maybeSingle()
    : { data: null, error: null };
  if (clientError) throw new Error('Não foi possível consultar o cliente.');
  const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
  const partsCents = (parts ?? []).reduce((sum, part) => sum + cents(Number(part.quantidade) * Number(part.preco_unitario)), 0);
  const servicesCents = (services ?? []).reduce((sum, service) => sum + cents(service.preco), 0);
  const amountCents = order.total == null ? partsCents + servicesCents : cents(order.total);
  if (amountCents < 0 || !Number.isSafeInteger(amountCents)) throw new Error('Valor da OS inválido.');
  return {
    id: order.id_os, client: client?.nome ?? 'Cliente não encontrado', phone: client?.telefone ?? null,
    motorcycle: moto?.modelo ?? 'Motocicleta não encontrada', plate: moto?.placa ?? null,
    partsTotal: partsCents / 100, servicesTotal: servicesCents / 100,
    discount: Math.max(0, partsCents + servicesCents - amountCents) / 100,
    amount: amountCents / 100,
  };
}

async function storedMotorcycleImage(db: ReturnType<typeof createSupabaseClient>, model: string) {
  const cached=await getCachedModelPreview(db,model);
  if (cached) return { bytes:cached,mime:isJpegPreview(cached) ? 'image/jpeg' : 'image/png',origin:'generated' };
  const filename=isBundledModel(model) ? /nxr/i.test(model) ? 'trilha-160.webp' : /fazer/i.test(model) ? 'urbana-250.webp' : 'urbana-160.webp' : null;
  if (filename) return { bytes:await readFile(fileURLToPath(new URL(`../../client/public/assets/models/${filename}`,import.meta.url))),mime:'image/webp',origin:'catalog' };
  return null;
}

// Bearer para React Native; cookie de administrador para o painel web. Nenhuma chave
// de serviço ou do provedor de IA é enviada ao cliente.
async function thumbnailClient(req: express.Request,res: express.Response) {
  const bearer=/^Bearer (.+)$/i.exec(req.header('Authorization') ?? '');
  if (!bearer) return ordersClient(req,res);
  const client=createSupabaseClient();
  const { data:{ user },error }=await client.auth.getUser(bearer[1]);
  if (error || !user) { res.status(401).json({ message:'Sessão inválida.' }); return null; }
  const scoped=createSupabaseClient(bearer[1]);
  const { data:profile, error:profileError }=await scoped.from('funcionario').select('id_funcionario,cargo').eq('auth_user_id',user.id).maybeSingle();
  if (profileError || !profile) { res.status(403).json({ message:'Funcionário sem acesso.' }); return null; }
  const db=createPrivilegedSupabaseClient();
  if (!db) { res.status(503).json({ message:'Servidor de miniaturas não configurado.' }); return null; }
  return db;
}
async function checkedModel(req: express.Request,res: express.Response,db: ReturnType<typeof createSupabaseClient>) {
  const parsed=z.string().trim().min(2).max(100).refine(v => !/[\r\n<>]/.test(v)).safeParse(req.query.model);
  if (!parsed.success) { res.status(400).json({ message:'Informe um modelo válido.' }); return null; }
  const { data,error }=await db.from('moto').select('id_moto').eq('modelo',parsed.data).limit(1);
  if (error) throw error;
  if (!data?.length) { res.status(404).json({ message:'Modelo não cadastrado no projeto.' }); return null; }
  return parsed.data;
}
app.get('/api/motorcycle-thumbnails/by-model',async(req,res)=>{
  const db=await thumbnailClient(req,res); if (!db) return;
  try {
    const model=await checkedModel(req,res,db); if (!model) return;
    const image=await storedMotorcycleImage(db,model);
    if (image) return res.json({ status:'ready',imageUrl:`/api/motorcycle-thumbnails/image?model=${encodeURIComponent(model)}` });
    const job=await enfileirarModelo(db,model);
    return res.status(202).json({ status:job.status,nextRetryAt:job.nextRetryAt,imageUrl:null });
  } catch(error) { console.error('[thumbnail/status]',error); return res.status(503).json({ message:'Falha ao consultar a fila de miniaturas.' }); }
});
app.get('/api/motorcycle-thumbnails/image',async(req,res)=>{
  const db=await thumbnailClient(req,res); if (!db) return;
  try {
    const model=await checkedModel(req,res,db); if (!model) return;
    const image=await storedMotorcycleImage(db,model);
    if (!image) { await enfileirarModelo(db,model); return res.status(202).json({ code:'IMAGE_QUEUED',message:'Miniatura em processamento.' }); }
    res.setHeader('Content-Type',image.mime);return res.send(image.bytes);
  } catch(error) { console.error('[thumbnail/image]',error);return res.status(503).json({ message:'Falha ao carregar miniatura.' }); }
});
// Consulta somente o que já existe: editar o texto no modal nunca cria jobs parciais.
app.get('/api/motorcycle-thumbnails/preview-existing',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  const model=z.string().trim().min(3).max(100).refine(value=>!/[\r\n<>]/.test(value)).safeParse(req.query.model);
  if(!model.success)return res.status(400).json({message:'Modelo inválido.'});
  try{
    const image=await storedMotorcycleImage(db,model.data);
    if(!image)return res.status(404).end();
    res.setHeader('X-Preview-Origin',image.origin);
    res.setHeader('Content-Type',image.mime);return res.send(image.bytes);
  }catch(error){console.error('[thumbnail/preview-existing]',error);return res.status(503).json({message:'Não foi possível consultar a miniatura.'});}
});
app.get('/api/orders/:id/model-preview',async(req,res)=>{
  const db=await ordersClient(req,res); if (!db) return;
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message:'Número da OS inválido.' });
  try {
    const { data:order,error }=await db.from('ordem_servico').select('id_moto').eq('id_os',id.data).maybeSingle();
    if (error) throw error;
    if (!order) return res.status(404).json({ message:'OS não encontrada.' });
    const { data:moto,error:motoError }=await db.from('moto').select('modelo').eq('id_moto',order.id_moto).maybeSingle();
    if (motoError) throw motoError;
    const model=moto?.modelo?.trim();
    if (!model || model.length>100 || /[\r\n<>]/.test(model)) return res.status(422).json({ message:'Modelo inválido.' });
    const image=await storedMotorcycleImage(db,model);
    if (image) { res.setHeader('Content-Type',image.mime); return res.send(image.bytes); }
    const job=await enfileirarModelo(db,model);
    return res.status(202).json({ code:'IMAGE_QUEUED',status:job.status,nextRetryAt:job.nextRetryAt,message:'Miniatura em processamento.' });
  } catch(error) { console.error('[orders/model-preview]',error);return res.status(503).json({ code:'IMAGE_UNAVAILABLE',message:'Não foi possível carregar a miniatura.' }); }
});

// Rascunhos expiram e só podem ser publicados pelo administrador que os gerou.
// Uma tentativa ruim nunca altera o cache compartilhado.
const previewDrafts = new Map<string, { context: string; adminId: string; model: string; bytes: Buffer; expires: number }>();
const previewDraftSchema = z.object({ model: z.string().trim().min(3).max(80).refine(v => !/[\r\n<>]/.test(v)), family:z.string().trim().min(3).max(80).optional(), notes: z.string().trim().max(500).default(''), references: z.array(z.string().max(720_000)).max(4).default([]), reference: z.string().max(720_000).optional() });

app.get('/api/motorcycle-brands',async(req,res)=>{
  const db=await ordersClient(req,res);if(!db)return;
  return res.json({brands:await sugestoesMarcasMotocicleta()});
});
app.get('/api/motorcycle-models', async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const { data, error } = await db.from('moto').select('modelo').order('id_moto', { ascending: false }).limit(500);
  if (error) return res.status(503).json({ message: 'Não foi possível carregar os modelos cadastrados.' });
  return res.json({ models: [...new Set((data ?? []).map(row => row.modelo?.trim()).filter(Boolean))].slice(0, 150) });
});
app.get('/api/motorcycle-models/research', async(req,res)=>{
  const db=await ordersClient(req,res); if(!db) return;
  const model=z.string().trim().min(3).max(100).safeParse(req.query.model);
  if(!model.success) return res.status(400).json({message:'Informe a marca e o modelo.'});
  try {
    const {data,error}=await db.from('moto').select('modelo').limit(500);
    if(error) throw error;
    return res.json(await verificarModeloMotocicleta(model.data,[...new Set((data??[]).map(row=>row.modelo).filter((name):name is string=>!!name))]));
  } catch(error) {console.error('[motorcycle-models/research]',error);return res.status(503).json({message:'Não foi possível consultar os modelos agora.'});}
});

async function orderModelForCandidate(db:ReturnType<typeof createSupabaseClient>,id:number) {
  const {data:order,error}=await db.from('ordem_servico').select('id_moto').eq('id_os',id).maybeSingle();
  if(error) throw error;
  if(!order) return null;
  const {data:moto,error:motoError}=await db.from('moto').select('modelo').eq('id_moto',order.id_moto).maybeSingle();
  if(motoError) throw motoError;
  return moto?.modelo?.trim() || null;
}
async function previewContext(db:ReturnType<typeof createSupabaseClient>,req:express.Request,id:number){
  if(req.path.startsWith('/api/motorcycles/')){
    const {data,error}=await db.from('moto').select('modelo').eq('id_moto',id).maybeSingle();
    if(error)throw error;
    return {key:`motorcycle:${id}`,model:data?.modelo?.trim()||null};
  }
  return {key:`order:${id}`,model:await orderModelForCandidate(db,id)};
}
app.get(['/api/orders/:id/model-preview/candidate','/api/motorcycles/:id/model-preview/candidate'],async(req,res)=>{
  const db=await ordersClient(req,res); if(!db) return;
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if(!id.success) return res.status(400).json({message:'OS inválida.'});
  try {
    const {model}=await previewContext(db,req,id.data);
    if(!model) return res.status(404).json({message:'Modelo da OS não encontrado.'});
    const {data:job,error}=await db.from('motorcycle_thumbnail_jobs').select('status').eq('model_key',chaveModelo(model)).maybeSingle();
    if(error) throw error;
    if(job?.status!=='needs_review') return res.json({candidate:null,status:job?.status || null});
    const bytes=await getCandidatePreview(db,model);
    if(!bytes) return res.json({candidate:null,status:'pending'});
    return res.json({candidate:`data:${previewMime(bytes)};base64,${bytes.toString('base64')}`,status:'needs_review'});
  } catch(error) { console.error('[motorcycle-image/candidate]',error); return res.status(503).json({message:'Não foi possível carregar a prévia da fila.'}); }
});
app.post(['/api/orders/:id/model-preview/candidate/approve','/api/motorcycles/:id/model-preview/candidate/approve'],async(req,res)=>{
  const db=await ordersClient(req,res); if(!db) return;
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if(!id.success || req.body?.confirmed!==true) return res.status(400).json({message:'Confirme que a miniatura corresponde à moto da OS.'});
  try {
    const {model}=await previewContext(db,req,id.data);
    if(!model) return res.status(404).json({message:'Modelo da OS não encontrado.'});
    const {data:job,error}=await db.from('motorcycle_thumbnail_jobs').select('status').eq('model_key',chaveModelo(model)).maybeSingle();
    if(error) throw error;
    if(job?.status!=='needs_review') return res.status(409).json({message:'Esta prévia não está aguardando revisão.'});
    const bytes=await getCandidatePreview(db,model);
    if(!bytes) return res.status(404).json({message:'Prévia da fila não encontrada.'});
    await approveModelPreview(db,model,bytes);
    const {error:updateError}=await db.from('motorcycle_thumbnail_jobs').update({status:'done',last_error:null,updated_at:new Date().toISOString()}).eq('model_key',chaveModelo(model)).eq('status','needs_review');
    if(updateError) throw updateError;
    await db.storage.from(CANDIDATE_MODEL_PREVIEW_BUCKET).remove([candidatePreviewPath(model,'image/jpeg'),candidatePreviewPath(model,'image/png')]);
    return res.json({ok:true});
  } catch(error) { console.error('[motorcycle-image/candidate/approve]',error); return res.status(503).json({message:'Não foi possível aprovar a miniatura.'}); }
});

app.post(['/api/orders/:id/model-preview/draft','/api/motorcycles/:id/model-preview/draft'], async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const parsed = previewDraftSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ message: 'Confira o modelo, a observação e o tamanho da foto.' });
  try {
    const context=await previewContext(db,req,id.data);
    if (!context.model) return res.status(404).json({ message: 'Motocicleta não encontrada.' });
    const inputReferences=parsed.data.references.length ? parsed.data.references : parsed.data.reference ? [parsed.data.reference] : [];
    const references:{bytes:Buffer;mime:'image/jpeg'|'image/png'}[]=[];
    for(const value of inputReferences) {
      const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(value);
      if (!match) return res.status(400).json({ message: 'Envie fotos JPEG ou PNG válidas.' });
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length > 510_000 || bytes.length < 100 || previewMime(bytes) !== match[1]) return res.status(400).json({ message: 'Cada foto deve ser JPEG/PNG e ter no máximo 500 KB.' });
      references.push({ bytes, mime: match[1] as 'image/jpeg' | 'image/png' });
    }
    const model=formatarNomeModeloMoto(parsed.data.model);
    if(req.path.startsWith('/api/motorcycles/')&&model.toLocaleLowerCase('pt-BR')!==context.model.toLocaleLowerCase('pt-BR'))
      return res.status(409).json({message:'Salve o modelo da moto antes de criar a miniatura.'});
    const family=parsed.data.family?formatarNomeModeloMoto(parsed.data.family):model;
    if(family!==model&&!model.toLocaleLowerCase('pt-BR').startsWith(`${family.toLocaleLowerCase('pt-BR')} `))return res.status(400).json({message:'A versão deve pertencer ao nome da moto informado.'});
    const research=await pesquisarMotocicleta(family);
    const bytes = await generateModelCandidate(model, { notes: parsed.data.notes, references,
      research:research?.matched ? `Identificação textual: ${research.title}. ${family===model?'':'Esta fonte confirma a família, não a versão exata; respeite a versão informada. '}${research.summary}` : '' });
    const mime = previewMime(bytes);
    if (!mime) throw new ModelPreviewError('IMAGE_AI_FORMAT', 'Imagem gerada inválida.');
    for (const [key, draft] of previewDrafts) if (draft.expires < Date.now()) previewDrafts.delete(key);
    if (previewDrafts.size > 40) previewDrafts.delete(previewDrafts.keys().next().value!);
    const draftId = randomUUID();
    previewDrafts.set(draftId, { context:context.key, adminId: res.locals.adminUserId, model, bytes, expires: Date.now() + 15 * 60_000 });
    return res.json({ draftId, model, image: `data:${mime};base64,${bytes.toString('base64')}` });
  } catch (error) {
    console.error('[motorcycle-image/draft]', error instanceof Error ? error.message : error);
    return res.status(503).json({ code: error instanceof ModelPreviewError ? error.code : 'IMAGE_UNAVAILABLE', message: error instanceof ModelPreviewError ? error.message : 'Não foi possível gerar a prévia. Tente novamente.' });
  }
});

app.post(['/api/orders/:id/model-preview/approve','/api/motorcycles/:id/model-preview/approve'], async (req, res) => {
  const db = await ordersClient(req, res); if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z.object({ draftId: z.string().uuid() }).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ message: 'Prévia inválida.' });
  const draft = previewDrafts.get(body.data.draftId);
  if (!draft || draft.expires < Date.now() || draft.context !== `${req.path.startsWith('/api/motorcycles/')?'motorcycle':'order'}:${id.data}` || draft.adminId !== res.locals.adminUserId) return res.status(410).json({ message: 'A prévia expirou. Gere outra imagem.' });
  try {
    const {model}=await previewContext(db,req,id.data);
    if(!model)return res.status(404).json({message:'Motocicleta não encontrada.'});
    if(model.toLocaleLowerCase('pt-BR')!==draft.model.toLocaleLowerCase('pt-BR'))return res.status(409).json({message:'Salve primeiro o modelo correto no cadastro da moto antes de aprovar a miniatura.'});
    await approveModelPreview(db, draft.model, draft.bytes);
    const {error:jobError}=await db.from('motorcycle_thumbnail_jobs').update({status:'done',last_error:null,updated_at:new Date().toISOString()}).eq('model_key',chaveModelo(draft.model)).in('status',['needs_review','pending','retry','waiting_quota']);
    if(jobError) throw jobError;
    await db.storage.from(CANDIDATE_MODEL_PREVIEW_BUCKET).remove([candidatePreviewPath(draft.model,'image/jpeg'),candidatePreviewPath(draft.model,'image/png')]);
    previewDrafts.delete(body.data.draftId);
    return res.json({ ok: true });
  } catch (error) {
    console.error('[motorcycle-image/approve]', error instanceof Error ? error.message : error);
    return res.status(503).json({ message: 'Não foi possível salvar a miniatura aprovada no Supabase.' });
  }
});

app.get('/api/orders/:id/observation-history',async(req,res)=>{
  const db=await ordersClient(req,res); if (!db) return;
  const id=z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message:'Número da OS inválido.' });
  try {
    const { data:order,error:orderError }=await db.from('ordem_servico').select('id_os').eq('id_os',id.data).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return res.status(404).json({ message:'OS não encontrada.' });
    const [{ data:prior,error:e1 },{ data:notes,error:e2 }]=await Promise.all([
      db.from('order_observation_history').select('id,kind,body,actor_user_id,created_at').eq('order_id',id.data).order('created_at',{ ascending:false }).limit(200),
      db.from('order_status_history').select('id,note,actor_user_id,changed_at,previous_status,next_status').eq('order_id',id.data).not('note','is',null).order('changed_at',{ ascending:false }).limit(200),
    ]);
    if (e1 || e2) throw e1 ?? e2;
    const actors=[...new Set([...(prior ?? []).map(e=>e.actor_user_id),...(notes ?? []).map(e=>e.actor_user_id)].filter((v):v is string=>!!v))];
    const { data:profiles,error:profileError }=actors.length ? await db.from('funcionario').select('auth_user_id,nome').in('auth_user_id',actors) : { data:[],error:null };
    if (profileError) throw profileError;
    const names=new Map((profiles ?? []).map(p=>[p.auth_user_id,p.nome]));
    const entries=[...(prior ?? []).map(e=>({ id:`observation-${e.id}`,kind:e.kind,body:e.body,at:e.created_at,actor:names.get(e.actor_user_id) ?? 'Sistema',context:null })),
      ...(notes ?? []).filter(e=>e.note?.trim()).map(e=>({ id:`status-${e.id}`,kind:'status_note',body:e.note!,at:e.changed_at,actor:names.get(e.actor_user_id) ?? 'Sistema',context:`${e.previous_status} → ${e.next_status}` }))]
      .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,200);
    return res.json({ entries });
  } catch(error) { console.error('[orders/observation-history]',error); return res.status(503).json({ message:'Não foi possível carregar o histórico.' }); }
});

app.get('/api/orders/:id/payment', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
  try {
    const summary = await paymentSummary(db, id.data);
    return summary ? res.json(summary) : res.status(404).json({ message: 'OS não encontrada.' });
  } catch (error) {
    console.error('[orders/payment-summary]', error);
    return res.status(500).json({ message: 'Não foi possível carregar o resumo do pagamento.' });
  }
});

// Registro administrativo manual. Não envia cobrança Pix ou comando para POS.
app.post('/api/orders/:id/payment', async (req, res) => {
  const db = await ordersClient(req, res);
  if (!db) return;
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  const body = z.discriminatedUnion('paid', [
    z.object({ paid: z.literal(false) }).strict(),
    z.object({ paid: z.literal(true), method: z.enum(['pix', 'credito', 'debito']), terminal: z.enum(['rede', 'stone']).nullable(), installments: z.number().int().min(1).max(12) }).strict(),
  ]).safeParse(req.body);
  if (!id.success || !body.success) return res.status(400).json({ message: 'Dados de pagamento inválidos.' });
  let summary;
  try { summary = await paymentSummary(db, id.data); }
  catch (error) { console.error('[orders/payment]', error); return res.status(500).json({ message: 'Não foi possível consultar a OS.' }); }
  if (!summary) return res.status(404).json({ message: 'OS não encontrada.' });
  if (body.data.paid && summary.amount <= 0) return res.status(422).json({ message: 'Informe o valor da OS ou seus itens antes de registrar o pagamento.' });
  const { data: existing, error: existingError } = await db.from('pagamento_os').select('status').eq('id_os', id.data).maybeSingle();
  if (existingError) return res.status(500).json({ message: 'Não foi possível verificar o pagamento.' });
  if (body.data.paid && existing?.status === 'pago') return res.status(409).json({ message: 'Esta OS já consta como paga.' });
  const paymentStatus = body.data.paid ? 'pago' : 'pendente';
  const { error } = await db.from('pagamento_os').upsert({
    id_os: id.data, status: paymentStatus, pago_em: body.data.paid ? new Date().toISOString() : null,
    atualizado_em: new Date().toISOString(),
    forma: body.data.paid ? body.data.method : null,
    maquininha: body.data.paid ? body.data.terminal : null,
    parcelas: body.data.paid ? body.data.installments : null,
    valor: body.data.paid ? summary.amount : null,
  }, { onConflict: 'id_os' });
  if (error) {
    console.error('[orders/payment]', error);
    return res.status(500).json({ message: 'Não foi possível atualizar o pagamento.' });
  }
  return res.json({ paymentStatus });
});
if (process.env.NODE_ENV === 'production') {
  const siteDir = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  const indexFile = fileURLToPath(new URL('../../client/dist/index.html', import.meta.url));
  app.use(express.static(siteDir, { index: false }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/') || req.path === '/health' ||
        req.path.includes('.') || !req.accepts('html')) return next();
    res.sendFile(indexFile, error => { if (error) next(error); });
  });
}

app.use((_req, res) => {
  res.status(404).json({ message: 'Rota não encontrada.' });
});

// Resposta JSON consistente para erros assíncronos, inclusive falhas de rede.
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ code: 'INVALID_JSON', message: 'O corpo da solicitação não é um JSON válido.' });
    return;
  }
  console.error('[api]', error instanceof Error ? error.message : 'Falha inesperada');
  res.status(503).json({ code: 'SERVICE_UNAVAILABLE', message: 'O serviço está temporariamente indisponível. Tente novamente em instantes.' });
});

app.listen(PORT, () => {
  if (!SUPABASE_SECRET_KEY) {
    console.warn('[config] SUPABASE_SECRET_KEY ausente. Acrescente SUPABASE_SECRET_KEY=sb_secret_... em server/.env e reinicie o servidor; a listagem de OS ficará indisponível até lá. Rode npm run check:env na raiz para conferir sem exibir a chave.');
  }
  console.log(`Servidor de autenticação ativo na porta ${PORT}.`);
  if (SUPABASE_SECRET_KEY) iniciarFilaMiniaturas(createPrivilegedSupabaseClient);
  if (!isModelImageConfigured()) console.warn('[motorcycle-image] Configure o provedor de IA em server/.env; a fila aguardará as credenciais.');
});
