import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
export const modulos = [
  "dashboard",
  "clientes",
  "motocicletas",
  "ordens",
  "funcionarios",
  "servicos",
  "agendamentos",
] as const;
const operacoes = ["visualizar", "criar", "editar", "excluir"] as const;
export type Acesso = {
  administrador: boolean;
  cargo: string;
  permissoes: Record<
    string,
    Partial<Record<(typeof operacoes)[number], boolean>>
  >;
};
const normal = (v: string) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const administrador = (p: { cargo: string; perfil_acesso: string }) =>
  normal(p.cargo) === "administrador" &&
  normal(p.perfil_acesso) === "administrador";
export async function lerAcesso(
  db: SupabaseClient,
  profile: { id_funcionario: number; cargo: string; perfil_acesso: string },
): Promise<Acesso | null> {
  if (administrador(profile))
    return { administrador: true, cargo: "Administrador", permissoes: {} };
  const { data: v, error } = await db
    .from("cargo_vinculo")
    .select("id_cargo")
    .eq("id_funcionario", profile.id_funcionario)
    .maybeSingle();
  if (error) throw error;
  if (!v) return null;
  const { data: c, error: err } = await db
    .from("cargo_acesso")
    .select("nome,permissoes,ativo")
    .eq("id", v.id_cargo)
    .maybeSingle();
  if (err) throw err;
  return c?.ativo
    ? { administrador: false, cargo: c.nome, permissoes: c.permissoes }
    : null;
}
export function permitir(a: Acesso, modulo: string, acao: string) {
  return (
    a.administrador ||
    (a.permissoes[modulo]?.visualizar === true &&
      a.permissoes[modulo]?.[acao as "visualizar"] === true)
  );
}
export function tiposAvisos(a: Acesso): string[] | null {
  if (a.administrador) return null;
  return [
    ...(permitir(a, "clientes", "visualizar")
      ? ["novo_cliente", "cliente_atualizado"]
      : []),
    ...(permitir(a, "ordens", "visualizar")
      ? [
          "nova_os",
          "os_atualizada",
          "status_os",
          "aguardando_peca",
          "pronta",
          "entregue",
          "cancelada",
        ]
      : []),
  ];
}
export function permitirRequisicao(a: Acesso, method: string, path: string, body?:unknown) {
  if (a.administrador) return true;
  const p = path.split("?")[0].replace(/\/+$/, '');
  if(method==='HEAD')method='GET';
  if(method==='GET'&&/^\/api\/postal-code\/\d{8}$/.test(p))return ['clientes','funcionarios','configuracoes'].some(modulo=>permitir(a,modulo,'visualizar'));
  if(/^\/api\/shared\/(catalogo|agenda)$/.test(p))return ['GET','PUT'].includes(method)&&(permitir(a,p.endsWith('/agenda')?'agendamentos':'servicos','visualizar')||(method==='GET'&&p.endsWith('/catalogo')&&permitir(a,'agendamentos','visualizar')));
  if(method==='GET'&&p==='/api/employees/options')return permitir(a,'agendamentos','visualizar')||permitir(a,'ordens','criar');
  if(method==='POST'&&p==='/api/admin/users'){const b=body as {position?:string;profile?:string}|null;return b?.position==='Cliente'&&b.profile==='Cliente'&&permitir(a,'clientes','criar');}
  if(method==='GET'&&p==='/api/orders/create-options')return permitir(a,'ordens','visualizar')||permitir(a,'motocicletas','visualizar');
  if (/^\/api\/admin\/(profile(?:\/|$)|preferences(?:\/|$))/.test(p))
    return true;
  if (/^\/api\/admin\/notifications(?:\/|$)/.test(p)) return true;
  let modulo = /^\/api\/orders(?:\/|$)/.test(p)
    ? "ordens"
    : /^\/api\/clients(?:\/|$)/.test(p)
      ? "clientes"
      : /^\/api\/motorcycles(?:\/|$)/.test(p)
        ? "motocicletas"
        : /^\/api\/employees(?:\/|$)/.test(p)
          ? "funcionarios"
          : p === "/api/admin/dashboard"
            ? "dashboard"
            : "";
  if (/^\/api\/motorcycle-(brands|models|thumbnails)(?:\/|$)/.test(p))
    return (
      method === "GET" &&
      (permitir(a, "motocicletas", "visualizar") ||
        permitir(a, "ordens", "visualizar"))
    );
  if (!modulo) return false;
  if (modulo === "funcionarios" && method !== "GET") return false;
  const acao =
    method === "GET"
      ? "visualizar"
      : method === "DELETE"
        ? "excluir"
        : method === "POST" &&
            ["/api/orders", "/api/clients", "/api/motorcycles"].includes(p)
          ? "criar"
          : "editar";
  return permitir(a, modulo, acao);
}
const regra = z
  .object({
    visualizar: z.boolean().optional(),
    criar: z.boolean().optional(),
    editar: z.boolean().optional(),
    excluir: z.boolean().optional(),
  })
  .strict();
export const cargoSchema = z
  .object({
    id: z.uuid().nullable(),
    nome: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .refine((n) => !["administrador", "administradores"].includes(normal(n))),
    descricao: z.string().trim().max(240),
    ativo: z.boolean(),
    versao: z.number().int().positive().nullable(),
    membros: z.array(z.number().int().positive()).max(500),
    permissoes: z
      .object(Object.fromEntries(modulos.map((m) => [m, regra.optional()])))
      .strict(),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const [mod, r] of Object.entries(c.permissoes) as [
      string,
      Record<string, boolean>,
    ][])
      if (r) {
        if (!r.visualizar && Object.values(r).some(Boolean))
          ctx.addIssue({
            code: "custom",
            message: "Ações exigem visualizar",
            path: ["permissoes", mod],
          });
        if (
          ["dashboard", "funcionarios"].includes(mod) &&
          ["criar", "editar", "excluir"].some((k) => r[k])
        )
          ctx.addIssue({
            code: "custom",
            message: "Módulo somente de consulta",
            path: ["permissoes", mod],
          });
      }
  });
export function rotasCargos(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const db = await autorizar(req, res);
      if (!db) return;
      if (!res.locals.acesso?.administrador)
        return res
          .status(403)
          .json({ message: "Somente administradores gerenciam cargos." });
      res.locals.cargosDb = db;
      res.setHeader("Cache-Control", "private, no-store");
      next();
    } catch (e) {
      next(e);
    }
  });
  router.get("/", async (_req, res, next) => {
    try {
      const db = res.locals.cargosDb as SupabaseClient;
      const [c, f, v] = await Promise.all([
        db.from("cargo_acesso").select("*").order("nome"),
        db
          .from("funcionario")
          .select("id_funcionario,nome,cargo,perfil_acesso,auth_user_id")
          .order("nome"),
        db.from("cargo_vinculo").select("*"),
      ]);
      if (c.error || f.error || v.error) throw c.error || f.error || v.error;
      res.json({
        cargos: c.data,
        funcionarios: f.data.map((p) => ({
          id: p.id_funcionario,
          nome: p.nome,
          cargo: p.cargo,
          administrador: administrador(p),
          temConta: !!p.auth_user_id,
          idCargo:
            v.data.find((x) => x.id_funcionario === p.id_funcionario)
              ?.id_cargo ?? null,
        })),
      });
    } catch (e) {
      next(e);
    }
  });
  router.put("/", async (req, res, next) => {
    try {
      const b = cargoSchema.safeParse(req.body);
      if (!b.success)
        return res
          .status(400)
          .json({
            message:
              "Confira o nome, os funcionários e as permissões do cargo.",
          });
      const c = b.data;
      const { data, error } = await (res.locals.cargosDb as SupabaseClient).rpc(
        "salvar_cargo_acesso",
        {
          p_id: c.id,
          p_nome: c.nome,
          p_descricao: c.descricao,
          p_permissoes: c.permissoes,
          p_ativo: c.ativo,
          p_membros: c.membros,
          p_versao: c.versao,
          p_usuario: res.locals.adminUserId,
        },
      );
      if (error) {
        if (error.code === "23505")
          return res
            .status(409)
            .json({ message: "Já existe um cargo com esse nome." });
        if (error.code === "P0001")
          return res.status(409).json({ message: error.message });
        throw error;
      }
      res.json({ id: data });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
