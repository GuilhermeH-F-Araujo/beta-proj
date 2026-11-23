import { z } from 'zod';

export const entradaSchema = z.object({
  identifier: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
  remember: z.boolean().default(false),
});

export const recuperacaoSchema = z.object({
  email: z.string().trim().email().max(254),
  clientOrigin: z.string().url().max(512).optional(),
});

export const novaSenhaSchema = z
  .object({
    password: z.string().min(8).max(128),
    tokenHash: z.string().min(10).max(2048).optional(),
    accessToken: z.string().min(10).max(8192).optional(),
    refreshToken: z.string().min(10).max(8192).optional(),
  })
  .refine((valor) => Boolean(valor.tokenHash || (valor.accessToken && valor.refreshToken)));
