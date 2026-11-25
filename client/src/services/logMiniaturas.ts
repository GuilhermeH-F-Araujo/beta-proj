import type { PedidoMiniatura } from './centralMiniaturas';
export type EventoLogMiniatura = {
  etapa: string;
  descricao: string;
  detalhes?: string;
  iniciado_em?: string;
  concluido_em?: string;
  duracao_ms?: number;
  tentativa?: number;
  fontes?: { titulo: string; url: string }[];
};
function dataValida(valor?: string) {
  return valor && Number.isFinite(Date.parse(valor)) ? valor : undefined;
}
export function montarLogMiniatura(pedido: PedidoMiniatura): EventoLogMiniatura[] {
  const fontes = (pedido.pesquisa?.fontes || []).flatMap((fonte) => {
    try {
      const url = new URL(fonte.url);
      return url.protocol === 'https:' ? [{ titulo: fonte.titulo, url: fonte.url }] : [];
    } catch {
      return [];
    }
  });
  const eventos: EventoLogMiniatura[] = (pedido.pesquisa?.progresso || []).map((evento) => ({
    ...evento,
  }));
  if (!eventos.length) {
    if (dataValida(pedido.criado_em))
      eventos.push({
        etapa: 'pedido',
        descricao: 'Recebi o pedido da miniatura',
        iniciado_em: pedido.criado_em,
      });
    if (fontes.length)
      eventos.push({
        etapa: 'fontes',
        descricao: `Encontrei ${fontes.length} ${fontes.length === 1 ? 'fonte' : 'fontes'} sobre esta moto`,
        iniciado_em: dataValida(pedido.pesquisa?.feita_em),
        fontes,
      });
    if (pedido.referencias?.length)
      eventos.push({
        etapa: 'referencias',
        descricao: `Tenho ${pedido.referencias.length} ${pedido.referencias.length === 1 ? 'foto de referência' : 'fotos de referência'} para comparar`,
      });
    if (pedido.verificacao?.automatica)
      eventos.push({
        etapa: 'conferencia',
        descricao: 'Conferi o enquadramento da candidata',
        detalhes: `Frente ${pedido.verificacao.direcao === 'direita' ? 'para a direita' : 'não confirmada para a direita'}; moto ${pedido.verificacao.inteira ? 'inteira' : 'com enquadramento a revisar'}.`,
      });
    if (pedido.imagem || pedido.candidato)
      eventos.push({
        etapa: 'revisao',
        descricao: 'A candidata está disponível para sua conferência',
      });
    const estados: Record<string, string> = {
      pendente: 'Pedido aguardando na fila',
      processando: 'Pedido em processamento',
      revisao: 'Pedido pronto para sua conferência',
      informacao: 'Preciso de uma foto de referência para continuar',
      falhou: 'Não consegui concluir este pedido',
      aprovada: 'Miniatura publicada',
      descartada: 'Solicitação descartada',
      rascunho: 'Preparação do pedido',
    };
    eventos.push({
      etapa: pedido.status,
      descricao: estados[pedido.status] || 'Pedido atualizado',
      iniciado_em: dataValida(pedido.atualizado_em),
    });
  } else if (fontes.length) {
    const pesquisa =
      eventos.find((evento) => evento.etapa === 'referencias') ||
      eventos.find((evento) => evento.etapa === 'pesquisa');
    if (pesquisa) pesquisa.fontes = fontes;
  }
  return eventos;
}
