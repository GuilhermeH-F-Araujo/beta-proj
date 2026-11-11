import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { permitir } from "./cargos.js";
const text = (max: number) => z.string().max(max),
  id = text(100).min(1);
const categoria = z
  .object({
    id,
    nome: text(150).min(1),
    descricao: text(1000),
    cor: z.string().regex(/^#[a-f\d]{6}$/i),
    icone: text(500),
  })
  .strict();
const servico = z
  .object({
    id,
    nome: text(150).min(1),
    categoriaId: id,
    descricao: text(3000),
    preco: z.number().finite().nonnegative(),
    custo: z.number().finite().nonnegative(),
    duracao: text(100),
    ativo: z.boolean(),
    icone: text(500),
    adicional: text(3000),
  })
  .strict();
const agenda = z
  .object({
    id: z.number().int().positive(),
    cliente: text(150).min(1),
    telefone: text(30),
    moto: text(150),
    placa: text(15),
    servico: text(150),
    status: z.enum(["Confirmado", "Pendente", "Concluído", "Cancelado"]),
    data: z.iso.date(),
    hora: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    mecanico: text(150),
    duracao: text(100),
    observacoes: text(3000),
  })
  .strict();
export const schemasCompartilhados = {
  catalogo: z
    .object({
      categorias: z.array(categoria).max(1000),
      servicos: z.array(servico).max(10000),
    })
    .strict(),
  agenda: z.array(agenda).max(10000),
};
function listas(data: any, key: string) {
  return key === "agenda"
    ? [data ?? []]
    : [data?.servicos ?? [], data?.categorias ?? []];
}
export function acoesAlteradas(before: unknown, after: unknown, key: string) {
  const actions = new Set<string>();
  const old = listas(before, key),
    next = listas(after, key);
  for (let i = 0; i < next.length; i++) {
    const anteriores = new Map(old[i].map((x: any) => [x.id, x]));
    for (const item of next[i]) {
      const original = anteriores.get(item.id);
      if (!original) actions.add("criar");
      else if (JSON.stringify(original) !== JSON.stringify(item))
        actions.add("editar");
      anteriores.delete(item.id);
    }
    if (anteriores.size) actions.add("excluir");
  }
  return [...actions];
}
export function dadosUnicos(data: any, key: string) {
  const lists = listas(data, key);
  if (
    lists.some(
      (list) => new Set(list.map((x: any) => x.id)).size !== list.length,
    )
  )
    return false;
  if (key === "catalogo") {
    const cats = new Set(data.categorias.map((x: any) => x.id));
    if (data.servicos.some((x: any) => !cats.has(x.categoriaId))) return false;
  }
  return true;
}
export function rotasDadosCompartilhados(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const router = Router();
  router.get("/:chave", async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const key = String(req.params.chave);
    if (!Object.hasOwn(schemasCompartilhados, key)) {
      res.status(404).json({ message: "Cadastro não encontrado." });
      return;
    }
    const { data, error } = await db
      .from("oficina_painel")
      .select("dados,versao")
      .eq("chave", key)
      .maybeSingle();
    if (error) {
      res
        .status(503)
        .json({
          message:
            "Não foi possível carregar os dados compartilhados. Confira a implantação do banco.",
        });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ dados: data?.dados ?? null, versao: data?.versao ?? 0 });
  });
  router.put("/:chave", async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const key = String(req.params.chave);
    if (!Object.hasOwn(schemasCompartilhados, key)) {
      res.status(404).json({ message: "Cadastro não encontrado." });
      return;
    }
    const input = z
      .object({ versao: z.number().int().nonnegative(), dados: z.unknown() })
      .strict()
      .safeParse(req.body);
    const parsed = input.success
      ? schemasCompartilhados[
          key as keyof typeof schemasCompartilhados
        ].safeParse(input.data.dados)
      : null;
    if (!input.success || !parsed?.success || !dadosUnicos(parsed.data, key)) {
      res.status(400).json({ message: "Confira os dados antes de salvar." });
      return;
    }
    const existing = await db
      .from("oficina_painel")
      .select("dados,versao")
      .eq("chave", key)
      .maybeSingle();
    if (existing.error) {
      res
        .status(503)
        .json({
          message: "Não foi possível acessar o cadastro compartilhado.",
        });
      return;
    }
    if ((existing.data?.versao ?? 0) !== input.data.versao) {
      res
        .status(409)
        .json({
          message:
            "Outra pessoa atualizou este cadastro. Os dados foram atualizados; confira seu rascunho e salve novamente.",
        });
      return;
    }
    const modulo = key === "agenda" ? "agendamentos" : "servicos";
    if (
      acoesAlteradas(existing.data?.dados, parsed.data, key).some(
        (action) => !permitir(res.locals.acesso, modulo, action),
      )
    ) {
      res
        .status(403)
        .json({ message: "Seu acesso não permite esta alteração." });
      return;
    }
    const row = {
      chave: key,
      dados: parsed.data,
      versao: input.data.versao + 1,
      atualizado_em: new Date().toISOString(),
    };
    const result = existing.data
      ? await db
          .from("oficina_painel")
          .update(row)
          .eq("chave", key)
          .eq("versao", input.data.versao)
          .select("versao")
          .maybeSingle()
      : await db
          .from("oficina_painel")
          .insert(row)
          .select("versao")
          .maybeSingle();
    if (result.error || !result.data) {
      res
        .status(result.error && result.error.code !== "23505" ? 503 : 409)
        .json({
          message:
            result.error && result.error.code !== "23505"
              ? "Não foi possível salvar. Seu rascunho foi preservado."
              : "Outra pessoa atualizou este cadastro. Confira e tente salvar novamente.",
        });
      return;
    }
    res.json({ dados: parsed.data, versao: result.data.versao });
  });
  return router;
}
