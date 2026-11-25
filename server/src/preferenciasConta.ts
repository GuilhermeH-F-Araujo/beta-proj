import { eventosNotificacao } from './shared/catalogoNotificacoes.js';
import { atalhosInterface, fontesInterface } from './shared/catalogoInterface.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { organizacaoInterfaceSchema } from './preferenciasWorkspace.js';
const sons = z.enum(['brisa', 'sino', 'madeira', 'toque', 'personalizado']);
const regra = z
  .object({
    painel: z.boolean(),
    som: z.boolean(),
    toque: z.union([sons, z.literal('padrao')]),
  })
  .strict();
const regraOpcional = regra.optional();
export const leituraSchema = z
  .object({
    tema: z.enum(['claro', 'escuro']).optional(),
    tamanhoIcones: z.number().min(90).max(180).default(100),
    areaClique: z.number().min(40).max(64).default(40),
    fonteInterface: z
      .enum(fontesInterface.map((fonte) => fonte.id) as [string, ...string[]])
      .default('sistema'),
    organizacao: organizacaoInterfaceSchema.optional(),
    painelPersonalizacao: z
      .object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })
      .strict()
      .optional(),
    tamanhoFonte: z.number().min(90).max(200).default(100),
    tamanhoCampos: z.number().min(90).max(150).default(100),
    espacoLetras: z.number().min(0).max(5).default(0),
    destacarFoco: z.boolean().default(true),
    sublinharLinks: z.boolean().default(false),
    substituicoes: z
      .record(
        z.string().regex(/^item-[a-z0-9]+$/),
        z.enum(atalhosInterface.map((item) => item.id) as [string, ...string[]]),
      )
      .refine((itens) => Object.keys(itens).length <= 200)
      .optional(),
    elementos: z
      .record(
        z.string().regex(/^item-[a-z0-9]+$/),
        z
          .object({ escala: z.number().min(80).max(200), fonte: z.number().min(90).max(200) })
          .strict(),
      )
      .refine((itens) => Object.keys(itens).length <= 200)
      .default({}),
    tamanhoTexto: z.number().min(90).max(150),
    tamanhoMenu: z.number().min(90).max(140),
    tamanhoCabecalho: z.number().min(90).max(130),
    tamanhoModais: z.number().min(90).max(150),
    tamanhoBotoes: z.number().min(80).max(150).default(100),
    pesoTexto: z.number().min(400).max(700),
    espacoLinhas: z.number().min(12).max(18),
    contraste: z.boolean(),
    reduzirMovimento: z.boolean(),
    densidade: z.enum(['confortavel', 'compacta']),
    periodoDashboard: z.enum(['diario', 'semanal', 'mensal']),
  })
  .strict();
export const notificacoesSchema = z
  .object({
    ativo: z.boolean(),
    toque: sons,
    volume: z.number().min(0).max(100),
    silencio: z.boolean(),
    inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    fim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    eventos: z.strictObject(
      Object.fromEntries(eventosNotificacao.map(({ id }) => [id, regraOpcional])) as Record<
        (typeof eventosNotificacao)[number]['id'],
        typeof regraOpcional
      >,
    ),
  })
  .strict();
export const segurancaSchema = z
  .object({
    // 0 ("nunca") foi removido; contas antigas com 0 passam a usar 1 hora.
    inatividade: z
      .union([z.literal(0), z.literal(10), z.literal(20), z.literal(30), z.literal(60)])
      .transform((minutos) => (minutos === 0 ? 60 : minutos)),
  })
  .strict();
export const somSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    base64: z.string().max(2000000),
  })
  .strict();
export function validarSomConta(entrada: { name: string; base64: string }) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(entrada.base64)) throw new Error('Base64 inválido.');
  const segundoElemento = Buffer.from(entrada.base64, 'base64');
  if (
    segundoElemento.toString('base64') !== entrada.base64 ||
    segundoElemento.length < 44 ||
    segundoElemento.length > 1500000
  )
    throw new Error('Tamanho do áudio inválido.');
  if (
    segundoElemento.toString('ascii', 0, 4) !== 'RIFF' ||
    segundoElemento.toString('ascii', 8, 12) !== 'WAVE' ||
    segundoElemento.toString('ascii', 12, 16) !== 'fmt ' ||
    segundoElemento.readUInt32LE(16) !== 16 ||
    segundoElemento.readUInt16LE(20) !== 1 ||
    segundoElemento.readUInt16LE(34) !== 16 ||
    segundoElemento.toString('ascii', 36, 40) !== 'data'
  )
    throw new Error('Envie somente áudio PCM WAV validado.');
  const canais = segundoElemento.readUInt16LE(22);
  const taxa = segundoElemento.readUInt32LE(24);
  const bytes = segundoElemento.readUInt32LE(40);
  if (
    ![1, 2].includes(canais) ||
    taxa < 8000 ||
    taxa > 44100 ||
    segundoElemento.readUInt32LE(4) !== segundoElemento.length - 8 ||
    bytes !== segundoElemento.length - 44 ||
    segundoElemento.readUInt16LE(32) !== canais * 2 ||
    segundoElemento.readUInt32LE(28) !== taxa * canais * 2 ||
    bytes % (canais * 2) !== 0
  )
    throw new Error('Cabeçalho do áudio inválido.');
  const duracao = bytes / (taxa * canais * 2);
  if (duracao < 0.25 || duracao > 8) throw new Error('Use um áudio entre 0,25 e 8 segundos.');
  return {
    name: entrada.name.replace(/[\x00-\x1f\x7f]/g, '') || 'som-personalizado.wav',
    base64: entrada.base64,
    duration: duracao,
    size: segundoElemento.length,
    mimeType: 'audio/wav',
  };
}
type Autorizar = (req: Request, res: Response) => Promise<SupabaseClient | null>;
export function rotasPreferenciasConta(autorizar: Autorizar) {
  const roteador = Router();
  roteador.get('/', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const conta = res.locals.adminUserId as string;
    try {
      const { data: dados, error: erro } = await db
        .from('usuario_preferencia')
        .select('leitura,notificacoes,seguranca,som_atualizado_em,atualizado_em')
        .eq('id_usuario', conta)
        .maybeSingle();
      if (erro) throw erro;
      return res.json({
        conta,
        leitura: dados?.leitura || null,
        notificacoes: dados?.notificacoes || null,
        seguranca: dados?.seguranca || null,
        somVersao: dados?.som_atualizado_em || null,
        atualizadoEm: dados?.atualizado_em || null,
      });
    } catch {
      return res.status(503).json({
        message: 'Não foi possível carregar suas preferências da conta. Tente novamente.',
      });
    }
  });
  roteador.put('/:secao', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const conta = res.locals.adminUserId as string;
    const conteudoEnviado = z
      .object({ conta: z.string().uuid(), valor: z.unknown() })
      .strict()
      .safeParse(req.body);
    if (!conteudoEnviado.success)
      return res.status(400).json({ message: 'Preferências inválidas.' });
    if (conteudoEnviado.data.conta !== conta)
      return res.status(409).json({ message: 'A conta mudou. Entre novamente antes de salvar.' });
    const secaoLocal = String(req.params.secao);
    let valorLocal: unknown;
    try {
      if (secaoLocal === 'leitura') valorLocal = leituraSchema.parse(conteudoEnviado.data.valor);
      else if (secaoLocal === 'notificacoes')
        valorLocal = notificacoesSchema.parse(conteudoEnviado.data.valor);
      else if (secaoLocal === 'seguranca')
        valorLocal = segurancaSchema.parse(conteudoEnviado.data.valor);
      else if (secaoLocal === 'som')
        valorLocal =
          conteudoEnviado.data.valor === null
            ? null
            : validarSomConta(somSchema.parse(conteudoEnviado.data.valor));
      else return res.status(400).json({ message: 'Seção de preferências inválida.' });
    } catch {
      return res.status(400).json({
        message:
          'Confira os valores. O áudio precisa ser um WAV validado de até 8 segundos e 1,5 MB.',
      });
    }
    try {
      const { error: erro } = await db.rpc('salvar_preferencia_usuario', {
        p_usuario: conta,
        p_secao: secaoLocal,
        p_valor: valorLocal,
      });
      if (erro) throw erro;
      const { data: dados, error: lerErro } = await db
        .from('usuario_preferencia')
        .select('atualizado_em,som_atualizado_em')
        .eq('id_usuario', conta)
        .single();
      if (lerErro) throw lerErro;
      return res.json({
        ok: true,
        conta,
        atualizadoEm: dados.atualizado_em,
        somVersao: dados.som_atualizado_em,
      });
    } catch {
      return res.status(503).json({
        message:
          secaoLocal === 'som'
            ? 'Não foi possível salvar o áudio na conta. Tente enviar o arquivo novamente.'
            : 'A alteração foi mantida neste navegador, mas ainda não pôde ser salva na sua conta.',
      });
    }
  });
  roteador.get('/som', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const conta = res.locals.adminUserId as string;
    try {
      const { data: dados, error: erro } = await db
        .from('usuario_preferencia')
        .select('som,som_atualizado_em')
        .eq('id_usuario', conta)
        .maybeSingle();
      if (erro) throw erro;
      return res.json({
        conta,
        som: dados?.som || null,
        versao: dados?.som_atualizado_em || null,
      });
    } catch {
      return res.status(503).json({
        message: 'Não foi possível carregar o áudio da sua conta. Tente novamente.',
      });
    }
  });
  return roteador;
}
