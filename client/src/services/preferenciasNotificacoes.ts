import { eventosNotificacao, type EventoNotificacao } from './catalogoNotificacoes';
import { enfileirarPreferenciaConta } from './sincronizacaoConta';
import type { SomNotificacao } from './sonsNotificacao';
export { eventosNotificacao, type EventoNotificacao } from './catalogoNotificacoes';
export type RegraEvento = {
  painel: boolean;
  som: boolean;
  toque: SomNotificacao | 'padrao';
};
export type ConfiguracaoNotificacoes = {
  ativo: boolean;
  toque: SomNotificacao;
  volume: number;
  silencio: boolean;
  inicio: string;
  fim: string;
  eventos: Record<EventoNotificacao, RegraEvento>;
};
let usuario = '';
const memoriaNotificacoes = new Map<string, ConfiguracaoNotificacoes>();
export function invalidarMemoriaNotificacoes() {
  memoriaNotificacoes.delete(chaveNotificacoes());
}
export function setUsuarioNotificacoes(id: string) {
  usuario = id;
}
export function chaveNotificacoes(sufixo = 'config') {
  return `estacao-notificacoes-${usuario || 'local'}-${sufixo}`;
}
export function padraoNotificacoes(): ConfiguracaoNotificacoes {
  return {
    ativo: false,
    toque: 'brisa',
    volume: 35,
    silencio: false,
    inicio: '18:00',
    fim: '08:00',
    eventos: Object.fromEntries(
      eventosNotificacao.map((eventoRecebido) => [
        eventoRecebido.id,
        {
          painel: true,
          som: ['nova_os', 'pronta', 'cancelada'].includes(eventoRecebido.id),
          toque: 'padrao',
        },
      ]),
    ) as Record<EventoNotificacao, RegraEvento>,
  };
}
export function lerConfiguracaoNotificacoes(): ConfiguracaoNotificacoes {
  const base = padraoNotificacoes();
  try {
    const textoAtual =
      memoriaNotificacoes.get(chaveNotificacoes()) ||
      JSON.parse(localStorage.getItem(chaveNotificacoes()) || 'null');
    if (!textoAtual || typeof textoAtual !== 'object') return base;
    const sons = ['brisa', 'sino', 'madeira', 'toque', 'personalizado'];
    return {
      ...base,
      ativo: textoAtual.ativo === true,
      toque: sons.includes(textoAtual.toque) ? textoAtual.toque : base.toque,
      volume:
        typeof textoAtual.volume === 'number' && Number.isFinite(textoAtual.volume)
          ? Math.max(0, Math.min(100, textoAtual.volume))
          : base.volume,
      silencio: textoAtual.silencio === true,
      inicio: /^([01]\d|2[0-3]):[0-5]\d$/.test(textoAtual.inicio) ? textoAtual.inicio : base.inicio,
      fim: /^([01]\d|2[0-3]):[0-5]\d$/.test(textoAtual.fim) ? textoAtual.fim : base.fim,
      eventos: Object.fromEntries(
        eventosNotificacao.map((eventoRecebido) => {
          const resultadoAtual = textoAtual.eventos?.[eventoRecebido.id];
          return [
            eventoRecebido.id,
            {
              painel:
                typeof resultadoAtual?.painel === 'boolean'
                  ? resultadoAtual.painel
                  : base.eventos[eventoRecebido.id].painel,
              som:
                typeof resultadoAtual?.som === 'boolean'
                  ? resultadoAtual.som
                  : base.eventos[eventoRecebido.id].som,
              toque:
                resultadoAtual?.toque === 'padrao' || sons.includes(resultadoAtual?.toque)
                  ? resultadoAtual.toque
                  : 'padrao',
            },
          ];
        }),
      ) as ConfiguracaoNotificacoes['eventos'],
    };
  } catch {
    return base;
  }
}
export function receberConfiguracaoNotificacoes(configuracao: ConfiguracaoNotificacoes) {
  memoriaNotificacoes.set(chaveNotificacoes(), configuracao);
  try {
    localStorage.setItem(chaveNotificacoes(), JSON.stringify(configuracao));
  } catch {}
  window.dispatchEvent(new Event('notification-preferences-change'));
}
export function salvarConfiguracaoNotificacoes(configuracao: ConfiguracaoNotificacoes) {
  receberConfiguracaoNotificacoes(configuracao);
  enfileirarPreferenciaConta('notificacoes', lerConfiguracaoNotificacoes());
}
export function estaEmSilencio(configuracao: ConfiguracaoNotificacoes, dados = new Date()) {
  if (!configuracao.silencio) return false;
  const agora = dados.getHours() * 60 + dados.getMinutes();
  const minutos = (valorAtual: string) =>
    Number(valorAtual.slice(0, 2)) * 60 + Number(valorAtual.slice(3));
  const inicio = minutos(configuracao.inicio);
  const fim = minutos(configuracao.fim);
  return (
    inicio === fim ||
    (inicio < fim ? agora >= inicio && agora < fim : agora >= inicio || agora < fim)
  );
}
export function eventoVisivel(tipo: string, configuracao = lerConfiguracaoNotificacoes()) {
  return configuracao.eventos[tipo as EventoNotificacao]?.painel !== false;
}
export function somDoEvento(
  tipo: string,
  configuracao = lerConfiguracaoNotificacoes(),
  dados = new Date(),
): SomNotificacao | null {
  const regra = configuracao.eventos[tipo as EventoNotificacao];
  if (
    !configuracao.ativo ||
    configuracao.volume === 0 ||
    estaEmSilencio(configuracao, dados) ||
    !regra?.painel ||
    !regra.som
  )
    return null;
  return regra.toque === 'padrao' ? configuracao.toque : regra.toque;
}
