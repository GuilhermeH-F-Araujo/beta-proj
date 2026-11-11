import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
const sons = z.enum(["brisa", "sino", "madeira", "toque", "personalizado"]);
const regra = z
  .object({
    painel: z.boolean(),
    som: z.boolean(),
    toque: z.union([sons, z.literal("padrao")]),
  })
  .strict();
const eventos = [
  "novo_cliente",
  "cliente_atualizado",
  "nova_os",
  "os_atualizada",
  "status_os",
  "aguardando_peca",
  "pronta",
  "entregue",
  "cancelada",
] as const;
export const leituraSchema = z
  .object({
    tamanhoTexto: z.number().min(90).max(150),
    tamanhoMenu: z.number().min(90).max(140),
    tamanhoCabecalho: z.number().min(90).max(130),
    tamanhoModais: z.number().min(90).max(150),
    pesoTexto: z.number().min(400).max(700),
    espacoLinhas: z.number().min(12).max(18),
    contraste: z.boolean(),
    reduzirMovimento: z.boolean(),
    densidade: z.enum(["confortavel", "compacta"]),
    periodoDashboard: z.enum(["diario", "semanal", "mensal"]),
  })
  .strict();
const notificacoesSchema = z
  .object({
    ativo: z.boolean(),
    toque: sons,
    volume: z.number().min(0).max(100),
    silencio: z.boolean(),
    inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    fim: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    eventos: z
      .object(
        Object.fromEntries(eventos.map((e) => [e, regra])) as Record<
          (typeof eventos)[number],
          typeof regra
        >,
      )
      .strict(),
  })
  .strict();
const segurancaSchema = z
  .object({
    inatividade: z.union([
      z.literal(0),
      z.literal(10),
      z.literal(20),
      z.literal(30),
      z.literal(60),
    ]),
  })
  .strict();
const somSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    base64: z.string().max(2000000),
  })
  .strict();
export function validarSomConta(input: { name: string; base64: string }) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))
    throw new Error("Base64 inválido.");
  const b = Buffer.from(input.base64, "base64");
  if (
    b.toString("base64") !== input.base64 ||
    b.length < 44 ||
    b.length > 1500000
  )
    throw new Error("Tamanho do áudio inválido.");
  if (
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE" ||
    b.toString("ascii", 12, 16) !== "fmt " ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString("ascii", 36, 40) !== "data"
  )
    throw new Error("Envie somente áudio PCM WAV validado.");
  const canais = b.readUInt16LE(22),
    taxa = b.readUInt32LE(24),
    bytes = b.readUInt32LE(40);
  if (
    ![1, 2].includes(canais) ||
    taxa < 8000 ||
    taxa > 44100 ||
    b.readUInt32LE(4) !== b.length - 8 ||
    bytes !== b.length - 44 ||
    b.readUInt16LE(32) !== canais * 2 ||
    b.readUInt32LE(28) !== taxa * canais * 2 ||
    bytes % (canais * 2) !== 0
  )
    throw new Error("Cabeçalho do áudio inválido.");
  const duration = bytes / (taxa * canais * 2);
  if (duration < 0.25 || duration > 8)
    throw new Error("Use um áudio entre 0,25 e 8 segundos.");
  return {
    name: input.name.replace(/[\x00-\x1f\x7f]/g, "") || "som-personalizado.wav",
    base64: input.base64,
    duration,
    size: b.length,
    mimeType: "audio/wav",
  };
}
type Authorize = (
  req: Request,
  res: Response,
) => Promise<SupabaseClient | null>;
export function rotasPreferenciasConta(authorize: Authorize) {
  const router = Router();
  router.get("/", async (req, res) => {
    const db = await authorize(req, res);
    if (!db) return;
    const conta = res.locals.adminUserId as string;
    try {
      const { data, error } = await db
        .from("usuario_preferencia")
        .select(
          "leitura,notificacoes,seguranca,som_atualizado_em,atualizado_em",
        )
        .eq("id_usuario", conta)
        .maybeSingle();
      if (error) throw error;
      return res.json({
        conta,
        leitura: data?.leitura || null,
        notificacoes: data?.notificacoes || null,
        seguranca: data?.seguranca || null,
        somVersao: data?.som_atualizado_em || null,
        atualizadoEm: data?.atualizado_em || null,
      });
    } catch {
      return res
        .status(503)
        .json({
          message:
            "Não foi possível carregar suas preferências da conta. Tente novamente.",
        });
    }
  });
  router.put("/:secao", async (req, res) => {
    const db = await authorize(req, res);
    if (!db) return;
    const conta = res.locals.adminUserId as string;
    const payload = z
      .object({ conta: z.string().uuid(), valor: z.unknown() })
      .strict()
      .safeParse(req.body);
    if (!payload.success)
      return res.status(400).json({ message: "Preferências inválidas." });
    if (payload.data.conta !== conta)
      return res
        .status(409)
        .json({ message: "A conta mudou. Entre novamente antes de salvar." });
    const section = String(req.params.secao);
    let value: unknown;
    try {
      if (section === "leitura")
        value = leituraSchema.parse(payload.data.valor);
      else if (section === "notificacoes")
        value = notificacoesSchema.parse(payload.data.valor);
      else if (section === "seguranca")
        value = segurancaSchema.parse(payload.data.valor);
      else if (section === "som")
        value =
          payload.data.valor === null
            ? null
            : validarSomConta(somSchema.parse(payload.data.valor));
      else
        return res
          .status(400)
          .json({ message: "Seção de preferências inválida." });
    } catch {
      return res
        .status(400)
        .json({
          message:
            "Confira os valores. O áudio precisa ser um WAV validado de até 8 segundos e 1,5 MB.",
        });
    }
    try {
      const { error } = await db.rpc("salvar_preferencia_usuario", {
        p_usuario: conta,
        p_secao: section,
        p_valor: value,
      });
      if (error) throw error;
      const { data, error: readError } = await db
        .from("usuario_preferencia")
        .select("atualizado_em,som_atualizado_em")
        .eq("id_usuario", conta)
        .single();
      if (readError) throw readError;
      return res.json({
        ok: true,
        conta,
        atualizadoEm: data.atualizado_em,
        somVersao: data.som_atualizado_em,
      });
    } catch {
      return res
        .status(503)
        .json({
          message:
            section === "som"
              ? "Não foi possível salvar o áudio na conta. Tente enviar o arquivo novamente."
              : "A alteração foi mantida neste navegador, mas ainda não pôde ser salva na sua conta.",
        });
    }
  });
  router.get("/som", async (req, res) => {
    const db = await authorize(req, res);
    if (!db) return;
    const conta = res.locals.adminUserId as string;
    try {
      const { data, error } = await db
        .from("usuario_preferencia")
        .select("som,som_atualizado_em")
        .eq("id_usuario", conta)
        .maybeSingle();
      if (error) throw error;
      return res.json({
        conta,
        som: data?.som || null,
        versao: data?.som_atualizado_em || null,
      });
    } catch {
      return res
        .status(503)
        .json({
          message:
            "Não foi possível carregar o áudio da sua conta. Tente novamente.",
        });
    }
  });
  return router;
}
