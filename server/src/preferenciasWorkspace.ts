import { normalizarEncaixes } from './shared/encaixesInterface.js';
import { z } from 'zod';
import { atalhosInterface, cartoesInterface, rotasMenu } from './shared/catalogoInterface.js';
const id = z.string().regex(/^[a-z0-9-]{1,70}$/);
const posicao = z.enum(['esquerda', 'direita', 'superior-antes', 'superior-depois', 'inferior']);
const bloco = z
  .object({ id, atalho: z.enum(atalhosInterface.map((item) => item.id) as [string, ...string[]]) })
  .strict();
export const organizacaoInterfaceSchema = z
  .object({
    posicaoMenu: posicao,
    ordemMenu: z.array(z.enum(rotasMenu as [string, ...string[]])).max(rotasMenu.length),
    cabecalho: z.array(bloco).max(24),
    barras: z
      .array(
        z.object({ id, nome: z.string().max(40), posicao, itens: z.array(bloco).max(24) }).strict(),
      )
      .max(6),
    cartoes: z.partialRecord(
      z.enum(Object.keys(cartoesInterface) as [string, ...string[]]),
      z.array(z.string().max(40)).max(12),
    ),
  })
  .strict()
  .transform(normalizarEncaixes);
