// Tentativas e bloqueios sao temporarios e ficam na memoria deste processo.
// Reiniciar o servidor limpa os contadores; eles nao sao um registro de auditoria.
import express from 'express';
import { createHash } from 'node:crypto';
import { normalizarEmail } from './sessao.js';

export type EstadoTentativasEntrada = {
  failures: number;
  strikeLevel: number;
  blockedUntil: number;
  lastSeenAt: number;
};

export const tentativasEntrada = new Map<string, EstadoTentativasEntrada>();

export const FALHAS_ANTES_BLOQUEIO = 5;

export const DURACOES_BLOQUEIO_MILISSEGUNDOS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  15 * 60_000, // 15 min
  30 * 60_000, // 30 min
  60 * 60_000, // 1 h
  2 * 60 * 60_000, // 2 h
];

export const VALIDADE_TENTATIVAS_MILISSEGUNDOS = 24 * 60 * 60_000;

export function ipCliente(req: express.Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function chaveTentativaEntrada(req: express.Request, identificador: string) {
  return createHash('sha256')
    .update(`${ipCliente(req)}|${normalizarEmail(identificador)}`)
    .digest('hex');
}

export function removerTentativasExpiradas() {
  const dadosLimite = Date.now() - VALIDADE_TENTATIVAS_MILISSEGUNDOS;
  for (const [chave, estado] of tentativasEntrada) {
    if (estado.lastSeenAt < dadosLimite) tentativasEntrada.delete(chave);
  }
}

export function obterBloqueioEntrada(req: express.Request, identificador: string) {
  removerTentativasExpiradas();
  const chave = chaveTentativaEntrada(req, identificador);
  const estado = tentativasEntrada.get(chave);
  if (!estado) return null;

  estado.lastSeenAt = Date.now();

  if (estado.blockedUntil > Date.now()) {
    return {
      key: chave,
      retryAfterSeconds: Math.max(1, Math.ceil((estado.blockedUntil - Date.now()) / 1000)),
    };
  }

  // O periodo terminou: mantem o nivel de reincidencia, mas zera a contagem do novo ciclo.
  if (estado.blockedUntil > 0) {
    estado.blockedUntil = 0;
    estado.failures = 0;
  }

  return null;
}

export function registrarFalhaEntrada(req: express.Request, identificador: string) {
  const chave = chaveTentativaEntrada(req, identificador);
  const agora = Date.now();
  const estado = tentativasEntrada.get(chave) ?? {
    failures: 0,
    strikeLevel: 0,
    blockedUntil: 0,
    lastSeenAt: agora,
  };

  estado.failures += 1;
  estado.lastSeenAt = agora;

  if (estado.failures >= FALHAS_ANTES_BLOQUEIO) {
    const duracaoIndice = Math.min(estado.strikeLevel, DURACOES_BLOQUEIO_MILISSEGUNDOS.length - 1);
    const duracaoMilissegundos = DURACOES_BLOQUEIO_MILISSEGUNDOS[duracaoIndice];

    estado.failures = 0;
    estado.strikeLevel += 1;
    estado.blockedUntil = agora + duracaoMilissegundos;
    tentativasEntrada.set(chave, estado);

    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(duracaoMilissegundos / 1000),
      attemptsRemaining: 0,
    };
  }

  tentativasEntrada.set(chave, estado);
  return {
    blocked: false,
    retryAfterSeconds: 0,
    attemptsRemaining: FALHAS_ANTES_BLOQUEIO - estado.failures,
  };
}

export function limparFalhasEntrada(req: express.Request, identificador: string) {
  tentativasEntrada.delete(chaveTentativaEntrada(req, identificador));
}

export function formatarDuracaoBloqueio(segundos: number) {
  if (segundos < 60) return `${segundos} segundo${segundos === 1 ? '' : 's'}`;
  const minutos = Math.ceil(segundos / 60);
  if (minutos < 60) return `${minutos} minuto${minutos === 1 ? '' : 's'}`;
  const horas = Math.ceil(minutos / 60);
  return `${horas} hora${horas === 1 ? '' : 's'}`;
}

export type EstadoLimiteRecuperacao = { lastRequestAt: number };

export const limitesRecuperacao = new Map<string, EstadoLimiteRecuperacao>();

export const INTERVALO_RECUPERACAO_MILISSEGUNDOS = 60_000;

export function chaveLimiteRecuperacao(req: express.Request, email: string) {
  return createHash('sha256')
    .update(`${ipCliente(req)}|${normalizarEmail(email)}`)
    .digest('hex');
}

export function obterEsperaRecuperacao(req: express.Request, email: string) {
  const chave = chaveLimiteRecuperacao(req, email);
  const anterior = limitesRecuperacao.get(chave);
  if (!anterior) return 0;
  return Math.max(0, INTERVALO_RECUPERACAO_MILISSEGUNDOS - (Date.now() - anterior.lastRequestAt));
}

export function registrarEsperaRecuperacao(req: express.Request, email: string) {
  const agora = Date.now();
  for (const [chave, registro] of limitesRecuperacao) {
    if (agora - registro.lastRequestAt >= INTERVALO_RECUPERACAO_MILISSEGUNDOS)
      limitesRecuperacao.delete(chave);
  }
  limitesRecuperacao.set(chaveLimiteRecuperacao(req, email), { lastRequestAt: agora });
}
