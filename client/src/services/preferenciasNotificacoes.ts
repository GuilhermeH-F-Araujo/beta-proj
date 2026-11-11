import { enfileirarPreferenciaConta } from './sincronizacaoConta';
import type { SomNotificacao } from "./sonsNotificacao";
export const eventosNotificacao = [
  {
    id: "novo_cliente",
    grupo: "Clientes",
    titulo: "Novo cliente",
    descricao: "Um novo cadastro entrou na oficina.",
    icone: "users",
  },
  {
    id: "cliente_atualizado",
    grupo: "Clientes",
    titulo: "Cliente atualizado",
    descricao: "Nome, contato ou endereço foi alterado.",
    icone: "pencil",
  },
  {
    id: "nova_os",
    grupo: "Ordens de serviço",
    titulo: "Nova ordem de serviço",
    descricao: "Um novo atendimento está disponível.",
    icone: "clipboard",
  },
  {
    id: "os_atualizada",
    grupo: "Ordens de serviço",
    titulo: "Ordem atualizada",
    descricao: "Alterações nos dados, prazo ou observações.",
    icone: "pencil",
  },
  {
    id: "status_os",
    grupo: "Ordens de serviço",
    titulo: "Mudança de andamento",
    descricao: "A OS mudou para outro estágio do atendimento.",
    icone: "activity",
  },
  {
    id: "aguardando_peca",
    grupo: "Ordens de serviço",
    titulo: "Aguardando peça",
    descricao: "O serviço depende de uma reposição.",
    icone: "package",
  },
  {
    id: "pronta",
    grupo: "Ordens de serviço",
    titulo: "Pronta para entrega",
    descricao: "A motocicleta já pode ser retirada.",
    icone: "check",
  },
  {
    id: "entregue",
    grupo: "Ordens de serviço",
    titulo: "Entrega concluída",
    descricao: "A entrega da motocicleta foi registrada.",
    icone: "bike",
  },
  {
    id: "cancelada",
    grupo: "Ordens de serviço",
    titulo: "Ordem cancelada",
    descricao: "Um atendimento foi cancelado.",
    icone: "close",
  },
] as const;
export type EventoNotificacao = (typeof eventosNotificacao)[number]["id"];
export type RegraEvento = {
  painel: boolean;
  som: boolean;
  toque: SomNotificacao | "padrao";
};
export type ConfigNotificacoes = {
  ativo: boolean;
  toque: SomNotificacao;
  volume: number;
  silencio: boolean;
  inicio: string;
  fim: string;
  eventos: Record<EventoNotificacao, RegraEvento>;
};
let usuario = "";
const memoriaNotificacoes=new Map<string,ConfigNotificacoes>();
export function invalidarCacheNotificacoes(){memoriaNotificacoes.delete(chaveNotificacoes());}
export function definirUsuarioNotificacoes(id: string) {
  usuario = id;
}
export function chaveNotificacoes(sufixo = "config") {
  return `estacao-notificacoes-${usuario || "local"}-${sufixo}`;
}
export function padraoNotificacoes(): ConfigNotificacoes {
  return {
    ativo: false,
    toque: "brisa",
    volume: 35,
    silencio: false,
    inicio: "18:00",
    fim: "08:00",
    eventos: Object.fromEntries(
      eventosNotificacao.map((e) => [
        e.id,
        {
          painel: true,
          som: ["nova_os", "pronta", "cancelada"].includes(e.id),
          toque: "padrao",
        },
      ]),
    ) as Record<EventoNotificacao, RegraEvento>,
  };
}
export function lerConfigNotificacoes(): ConfigNotificacoes {
  const base = padraoNotificacoes();
  try {
    const s = memoriaNotificacoes.get(chaveNotificacoes()) || JSON.parse(localStorage.getItem(chaveNotificacoes()) || "null");
    if (!s || typeof s !== "object") return base;
    const sons = ["brisa", "sino", "madeira", "toque", "personalizado"];
    return {
      ...base,
      ativo: s.ativo === true,
      toque: sons.includes(s.toque) ? s.toque : base.toque,
      volume:
        typeof s.volume === "number" && Number.isFinite(s.volume)
          ? Math.max(0, Math.min(100, s.volume))
          : base.volume,
      silencio: s.silencio === true,
      inicio: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.inicio)
        ? s.inicio
        : base.inicio,
      fim: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.fim) ? s.fim : base.fim,
      eventos: Object.fromEntries(
        eventosNotificacao.map((e) => {
          const r = s.eventos?.[e.id];
          return [
            e.id,
            {
              painel:
                typeof r?.painel === "boolean"
                  ? r.painel
                  : base.eventos[e.id].painel,
              som: typeof r?.som === "boolean" ? r.som : base.eventos[e.id].som,
              toque:
                r?.toque === "padrao" || sons.includes(r?.toque)
                  ? r.toque
                  : "padrao",
            },
          ];
        }),
      ) as ConfigNotificacoes["eventos"],
    };
  } catch {
    return base;
  }
}
export function receberConfigNotificacoes(config: ConfigNotificacoes) {
  memoriaNotificacoes.set(chaveNotificacoes(),config);
  try{localStorage.setItem(chaveNotificacoes(), JSON.stringify(config));}catch{}
  window.dispatchEvent(new Event("notification-preferences-change"));
}
export function salvarConfigNotificacoes(config:ConfigNotificacoes){receberConfigNotificacoes(config);enfileirarPreferenciaConta('notificacoes',lerConfigNotificacoes());}
export function estaEmSilencio(config: ConfigNotificacoes, data = new Date()) {
  if (!config.silencio) return false;
  const agora = data.getHours() * 60 + data.getMinutes();
  const minutos = (v: string) =>
    Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  const inicio = minutos(config.inicio),
    fim = minutos(config.fim);
  return (
    inicio === fim ||
    (inicio < fim
      ? agora >= inicio && agora < fim
      : agora >= inicio || agora < fim)
  );
}
export function eventoVisivel(tipo: string, config = lerConfigNotificacoes()) {
  return config.eventos[tipo as EventoNotificacao]?.painel !== false;
}
export function somDoEvento(
  tipo: string,
  config = lerConfigNotificacoes(),
  data = new Date(),
): SomNotificacao | null {
  const regra = config.eventos[tipo as EventoNotificacao];
  if (
    !config.ativo ||
    config.volume === 0 ||
    estaEmSilencio(config, data) ||
    !regra?.painel ||
    !regra.som
  )
    return null;
  return regra.toque === "padrao" ? config.toque : regra.toque;
}
