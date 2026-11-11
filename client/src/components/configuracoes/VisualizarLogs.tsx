import {useDadosVivos} from '../../hooks/useDadosVivos';
import Skeleton from '../Skeleton';
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../MenuAdmin";
import SeletorFiltro from "../SeletorFiltro";
import SeletorPeriodo, { type DateRange } from "../SeletorPeriodo";
import { CfgDialog, baixarArquivo } from "./ConfiguracoesUI";
import {
  buscarAtividadesSistema,
  type AtividadeSistema,
} from "../../services/configuracoesSistema";
function intervaloInicial(): DateRange {
  const format = (date: Date) =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  return {
    from: format(new Date(Date.now() - 29 * 86400000)),
    to: format(new Date()),
  };
}
const acao = (item: AtividadeSistema) =>
  item.kind === "clients"
    ? "Arquivar cliente"
    : item.title.includes("excluída")
      ? "Excluir OS"
      : "Atualizar OS";
const cor = (item: AtividadeSistema) =>
  acao(item) === "Atualizar OS" ? "amber" : "red";
const dia = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
  }).format(new Date(value));
const hora = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export default function VisualizarLogs({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<DateRange | null>(intervaloInicial);
  const [items, setItems] = useState<AtividadeSistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [user, setUser] = useState("all");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{
    field: "at" | "actor" | "action" | "kind" | "ip";
    ascending: boolean;
  }>({ field: "at", ascending: false });
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    buscarAtividadesSistema(30, "all", range)
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : "Não foi possível consultar os registros.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range, retry]);
  useDadosVivos(async valido=>{try{const result=await buscarAtividadesSistema(30,'all',range);if(valido()){setItems(result.items);setError('')}}catch(e){if(valido())setError(e instanceof Error?e.message:'Não foi possível atualizar os registros.')}},!loading,JSON.stringify(range));
  const users = useMemo(
    () => [
      { value: "all", label: "Todos" },
      ...Array.from(new Set(items.map((i) => i.actor)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((name) => ({ value: name, label: name })),
    ],
    [items],
  );
  const filtered = useMemo(() => {
    const normalized = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const term = normalized(search.trim());
    return items
      .filter(
        (item) =>
          (user === "all" || item.actor === user) &&
          (action === "all" || acao(item) === action) &&
          (!term ||
            normalized(
              `${item.actor} ${item.actorRole || ""} ${acao(item)} ${item.title} ${item.detail}`,
            ).includes(term)),
      )
      .sort((a, b) => {
        const va =
          sort.field === "action" ? acao(a) : String(a[sort.field] || "");
        const vb =
          sort.field === "action" ? acao(b) : String(b[sort.field] || "");
        const result =
          va.localeCompare(vb, "pt-BR", { numeric: true }) ||
          a.id.localeCompare(b.id, "pt-BR", { numeric: true });
        return sort.ascending ? result : -result;
      });
  }, [items, user, action, search, sort]);
  const count = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, count);
  const rows = filtered.slice((current - 1) * 8, current * 8);
  function ordenar(field: typeof sort.field) {
    setSort((old) => ({
      field,
      ascending: old.field === field ? !old.ascending : true,
    }));
    setPage(1);
  }
  function exportar() {
    const escape = (value: string) =>
      `"${(/^[\s\u0000-\u001f]*[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const data = [
      [
        "Data",
        "Hora",
        "Usuário",
        "Função",
        "Ação",
        "Módulo",
        "Descrição",
        "IP",
        "Status",
      ],
      ...filtered.map((i) => [
        dia(i.at),
        hora(i.at),
        i.actor,
        i.actorRole || "",
        acao(i),
        i.kind === "os" ? "Ordens de Serviço" : "Clientes",
        `${i.title} · ${i.detail}`,
        i.ip || "Não registrado",
        "Sucesso",
      ]),
    ];
    baixarArquivo(
      "estacao-motos-logs.csv",
      "\uFEFF" + data.map((row) => row.map(escape).join(";")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  const paginas = Array.from({ length: count }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === count || Math.abs(n - current) <= 2,
  );
  const cabecalho = (label: string, field: typeof sort.field) => (
    <button onClick={() => ordenar(field)} title={`Ordenar por ${label}`}>
      {label}
      <Icon name="chevron" size={11} />
    </button>
  );
  return (
    <CfgDialog
      className="cfg-logs-dialog"
      title="Visualizar Logs"
      description="Histórico de atividades registradas no sistema."
      icon="clipboard"
      onClose={onClose}
      footer={
        <div className="cfg-logs-footer">
          <span className="cfg-logs-total">
            <Icon name="info" size={16} />
            Total de registros: <b>{loading ? "—" : filtered.length}</b>
          </span>
          <div className="cfg-logs-pagination">
            <button
              className="cfg-log-page arrow"
              aria-label="Página anterior"
              disabled={current === 1 || loading}
              onClick={() => setPage(current - 1)}
            >
              <Icon name="left" size={15} />
            </button>
            {paginas.map((n, index) => (
              <span key={n}>
                {index > 0 && n - paginas[index - 1] > 1 && <i>…</i>}
                <button
                  className={`cfg-log-page ${n === current ? "active" : ""}`}
                  aria-label={`Página ${n}`}
                  aria-current={n === current ? "page" : undefined}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              </span>
            ))}
            <button
              className="cfg-log-page arrow"
              aria-label="Próxima página"
              disabled={current === count || loading}
              onClick={() => setPage(current + 1)}
            >
              <Icon name="right" size={15} />
            </button>
          </div>
          <button
            className="cfg-logs-export"
            disabled={loading || !!error || !filtered.length}
            onClick={exportar}
          >
            <Icon name="download" size={16} />
            Exportar Logs
          </button>
        </div>
      }
    >
      <div className="cfg-logs-filters">
        <div className="cfg-logs-period">
          <span>
            <Icon name="calendar" size={15} />
            Período
          </span>
          <SeletorPeriodo
            value={range}
            onApply={(value) => {
              setRange(value);
              setPage(1);
            }}
            label="Período dos logs"
            placeholder="Últimos 30 dias"
          />
        </div>
        <div>
          <span>
            <Icon name="user" size={15} />
            Usuário
          </span>
          <SeletorFiltro
            variant="staff"
            label="Usuário dos logs"
            value={user}
            options={users}
            onChange={(value) => {
              setUser(value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <span>
            <Icon name="settings" size={15} />
            Ação
          </span>
          <SeletorFiltro
            variant="staff"
            label="Ação dos logs"
            value={action}
            options={[
              "all",
              "Atualizar OS",
              "Excluir OS",
              "Arquivar cliente",
            ].map((value) => ({
              value,
              label: value === "all" ? "Todas" : value,
            }))}
            onChange={(value) => {
              setAction(value);
              setPage(1);
            }}
          />
        </div>
        <label className="cfg-logs-search">
          <Icon name="search" size={16} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por usuário, ação ou descrição..."
            aria-label="Buscar logs"
          />
        </label>
      </div>
      <div className="cfg-logs-table-wrap">
        <table className="cfg-logs-table">
          <thead>
            <tr>
              <th aria-label="Tipo de atividade" />
              <th>{cabecalho("Data / Hora", "at")}</th>
              <th>{cabecalho("Usuário", "actor")}</th>
              <th>{cabecalho("Ação", "action")}</th>
              <th>{cabecalho("Módulo", "kind")}</th>
              <th>Descrição</th>
              <th>{cabecalho("IP", "ip")}</th>
              <th>
                Status <Icon name="chevron" size={11} />
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              !error &&
              rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className={`cfg-log-icon ${cor(item)}`}>
                      <Icon
                        name={
                          item.kind === "clients"
                            ? "users"
                            : item.title.includes("excluída")
                              ? "trash"
                              : "clipboard"
                        }
                        size={20}
                      />
                    </span>
                  </td>
                  <td className="cfg-log-date">
                    <b>{dia(item.at)}</b>
                    <span>{hora(item.at)}</span>
                  </td>
                  <td>
                    <div className="cfg-log-user">
                      <span>
                        <Icon name="user" size={18} />
                      </span>
                      <div>
                        <b>{item.actor}</b>
                        <small>{item.actorRole || "Não informado"}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`cfg-log-action ${cor(item)}`}>
                      {acao(item)}
                    </span>
                  </td>
                  <td>
                    {item.kind === "os" ? "Ordens de Serviço" : "Clientes"}
                  </td>
                  <td className="cfg-log-description">
                    <b>{item.title}</b>
                    <span>{item.detail}</span>
                  </td>
                  <td
                    title={
                      item.ip
                        ? "Endereço registrado no evento"
                        : "O endereço IP não foi registrado neste histórico."
                    }
                    className={!item.ip ? "cfg-log-no-ip" : ""}
                  >
                    {item.ip || "—"}
                  </td>
                  <td>
                    <span
                      className="cfg-log-success"
                      title="Operação confirmada no histórico"
                    >
                      Sucesso
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {loading ? (
          <Skeleton tipo="tabela"/>
        ) : error ? (
          <div className="cfg-logs-empty">
            <p role="alert">{error}</p>
            <button
              className="cfg-button"
              onClick={() => setRetry((v) => v + 1)}
            >
              Tentar novamente
            </button>
          </div>
        ) : !rows.length ? (
          <div className="cfg-logs-empty">
            <Icon name="search" size={29} />
            <b>Nenhum registro encontrado</b>
            <p>
              Altere o período ou os filtros para consultar outras atividades.
            </p>
          </div>
        ) : null}
      </div>
    </CfgDialog>
  );
}
