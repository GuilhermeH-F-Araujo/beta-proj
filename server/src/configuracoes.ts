import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
type Authorize = (
  req: Request,
  res: Response,
) => Promise<SupabaseClient | null>;
export function rotasConfiguracoes(authorize: Authorize) {
  const router = Router();
  router.get("/diagnostics", async (req, res) => {
    const db = await authorize(req, res);
    if (!db) return;
    try {
      const definitions = [
        ["cadastros", "cliente", "id_cliente"],
        ["ordens", "ordem_servico", "id_os"],
        ["notificacoes", "admin_notify", "id,id_cliente"],
        ["historico", "os_historico", "id"],
      ] as const;
      const checks = await Promise.all(
        definitions.map(async ([id, table, columns]) => {
          const start = Date.now();
          try {
            const { error } = await db.from(table).select(columns).limit(1);
            return { id, ok: !error, ms: Date.now() - start };
          } catch {
            return { id, ok: false, ms: Date.now() - start };
          }
        }),
      );
      return res.json({
        checkedAt: new Date().toISOString(),
        checks,
        version: "1.0.0",
      });
    } catch {
      return res
        .status(503)
        .json({ message: "Não foi possível verificar os serviços." });
    }
  });
  router.get("/activity", async (req, res) => {
    const db = await authorize(req, res);
    if (!db) return;
    const days = Number(req.query.days || 30),
      kind = String(req.query.kind || "all");
    if (![7, 30, 90].includes(days) || !["all", "os", "clients"].includes(kind))
      return res
        .status(400)
        .json({ message: "Escolha um período e uma categoria válidos." });
    const from =
      typeof req.query.dateFrom === "string" ? req.query.dateFrom : "";
    const to = typeof req.query.dateTo === "string" ? req.query.dateTo : "";
    const validDate = (value: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
      new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
    if (
      (from || to) &&
      (!validDate(from) ||
        !validDate(to) ||
        from > to ||
        Date.parse(to) - Date.parse(from) > 366 * 86400000)
    )
      return res
        .status(400)
        .json({ message: "Escolha um intervalo válido de até um ano." });
    try {
      const since = from
        ? from + "T00:00:00-03:00"
        : new Date(Date.now() - days * 86400000).toISOString();
      const until = to
        ? new Date(Date.parse(to + "T12:00:00Z") + 86400000)
            .toISOString()
            .slice(0, 10) + "T00:00:00-03:00"
        : new Date().toISOString();
      const [orders, clients] = await Promise.all([
        kind !== "clients"
          ? db
              .from("os_historico")
              .select("id,id_os,tipo,id_usuario,criado_em,anterior,novo")
              .gte("criado_em", since)
              .lt("criado_em", until)
              .in("tipo", ["edicao", "exclusao", "status"])
              .order("criado_em", { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
        kind !== "os"
          ? db
              .from("cliente_historico")
              .select("id,id_cliente,acao,id_usuario,criado_em")
              .gte("criado_em", since)
              .lt("criado_em", until)
              .order("criado_em", { ascending: false })
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (orders.error || clients.error) throw orders.error || clients.error;
      const actors = [
        ...new Set(
          [...(orders.data || []), ...(clients.data || [])]
            .map((x) => x.id_usuario)
            .filter(Boolean),
        ),
      ];
      const profiles = actors.length
        ? await db
            .from("funcionario")
            .select("auth_user_id,nome,cargo")
            .in("auth_user_id", actors)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const names = new Map(
        (profiles.data || []).map((p) => [p.auth_user_id, p.nome]),
      );
      const roles = new Map(
        (profiles.data || []).map((p) => [p.auth_user_id, p.cargo]),
      );
      const items = [
        ...(orders.data || []).map((e) => ({
          id: `os-${e.id}`,
          kind: "os",
          targetId: e.id_os,
          title:
            e.tipo === "status"
              ? `Status da OS #${e.id_os} alterado`
              : e.tipo === "exclusao"
                ? `OS #${e.id_os} excluída`
                : `OS #${e.id_os} atualizada`,
          detail:
            e.tipo === "status"
              ? `${e.anterior || "—"} → ${e.novo || "—"}`
              : "Alteração registrada no histórico da ordem",
          at: e.criado_em,
          actor: names.get(e.id_usuario) || "Autor não registrado",
          actorRole: roles.get(e.id_usuario) || null,
          ip: null,
        })),
        ...(clients.data || []).map((e) => ({
          id: `cliente-${e.id}`,
          kind: "clients",
          targetId: e.id_cliente,
          title: `Cliente #${e.id_cliente} arquivado`,
          detail: "Arquivamento registrado no histórico do cliente",
          at: e.criado_em,
          actor: names.get(e.id_usuario) || "Autor não registrado",
          actorRole: roles.get(e.id_usuario) || null,
          ip: null,
        })),
      ]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 100);
      return res.json({ items, limit: 100 });
    } catch (error) {
      console.error("[settings/activity]", error);
      return res.status(503).json({
        message: "Não foi possível consultar os registros. Tente novamente.",
      });
    }
  });
  return router;
}
