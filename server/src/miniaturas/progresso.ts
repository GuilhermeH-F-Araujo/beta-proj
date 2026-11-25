export type RegistroProgressoMiniatura = {
  etapa: string;
  descricao: string;
  tentativa: number;
  iniciado_em: string;
  concluido_em?: string;
  duracao_ms?: number;
  detalhes?: string;
};
export function criarProgressoMiniatura(
  anteriores: RegistroProgressoMiniatura[] = [],
  tentativa = 1,
  agora: () => number = () => Date.now(),
) {
  const eventos = structuredClone(Array.isArray(anteriores) ? anteriores : []).filter(
    (evento) =>
      evento &&
      typeof evento.iniciado_em === 'string' &&
      Number.isFinite(Date.parse(evento.iniciado_em)),
  );
  const concluir = () => {
    const ultimo = eventos.at(-1);
    if (ultimo && !ultimo.concluido_em) {
      const instante = agora();
      ultimo.concluido_em = new Date(instante).toISOString();
      ultimo.duracao_ms = Math.max(0, instante - Date.parse(ultimo.iniciado_em));
    }
  };
  return {
    registrar(etapa: string, descricao: string, detalhes = '', final = false) {
      concluir();
      const instante = new Date(agora()).toISOString();
      eventos.push({
        etapa,
        descricao,
        tentativa,
        iniciado_em: instante,
        ...(detalhes ? { detalhes: detalhes.slice(0, 1000) } : {}),
        ...(final ? { concluido_em: instante, duracao_ms: 0 } : {}),
      });
      if (eventos.length > 120) eventos.splice(0, eventos.length - 120);
      return structuredClone(eventos);
    },
  };
}
