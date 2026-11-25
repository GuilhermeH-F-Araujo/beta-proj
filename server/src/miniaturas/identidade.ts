import { createHash } from 'node:crypto';
import { z } from 'zod';

export const identidadeSchema = z.object({
  modelo: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .refine((valor) => !/[<>\r\n]/.test(valor)),
  ano: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 2)
    .nullable()
    .default(null),
  variante: z.string().trim().max(80).default(''),
  motoId: z.number().int().positive().nullable().default(null),
});
export type Identidade = z.infer<typeof identidadeSchema>;
export function normalizarModelo(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
export function chaveCatalogo(identidade: Identidade) {
  // Nao usamos similaridade: Spyder e a versao comum nunca compartilham a chave.
  return createHash('sha256')
    .update(
      JSON.stringify([
        normalizarModelo([identidade.modelo, identidade.variante].filter(Boolean).join(' ')),
        identidade.ano,
        identidade.motoId,
      ]),
    )
    .digest('hex');
}
export function nomeCompleto(identidade: Identidade) {
  return [identidade.modelo, identidade.variante, identidade.ano].filter(Boolean).join(' ');
}
export const ACERVO = 'miniaturas-acervo';
export type Referencia = {
  caminho: string;
  nome: string;
  origem: 'admin' | 'celular' | 'web';
  url?: string;
  licenca?: string;
};
export type Verificacao = {
  direcao: 'direita' | 'esquerda' | 'incerta';
  inteira: boolean;
  vistaLateral?: boolean;
  problemas: string[];
  automatica: boolean;
  pontuacaoFidelidade?: number;
  fidelidade?: 'compativel' | 'divergente' | 'inconclusiva';
};

export type FundoChaveMiniatura = 'magenta' | 'verde';

export const fundosChaveMiniatura = {
  magenta: { nome: 'magenta', hex: '#FF00FF' },
  verde: { nome: 'green', hex: '#00FF00' },
} as const;

export function escolherFundoChave(tentativa: number, corInformada: string): FundoChaveMiniatura {
  const texto = normalizarModelo(corInformada);
  if (/\b(?:magenta|fucsia|rosa|pink|fuchsia)\b/.test(texto)) return 'verde';
  if (/\b(?:verde|green)\b/.test(texto)) return 'magenta';
  return tentativa % 2 === 0 ? 'verde' : 'magenta';
}
