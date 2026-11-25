export type VerificacaoPublicacaoMiniatura = {
  automatica?: boolean;
  direcao?: string;
  inteira?: boolean;
  vistaLateral?: boolean;
  fundoTransparente?: boolean;
  fidelidade?: string;
  pontuacaoFidelidade?: number;
};
export function impedimentoPublicacaoMiniatura(
  verificacao?: VerificacaoPublicacaoMiniatura | null,
) {
  if (verificacao?.automatica && verificacao.direcao === 'esquerda')
    return 'A IA identificou a frente para a esquerda. Gere outra imagem com o farol e a roda dianteira para a direita.';
  if (verificacao?.automatica && verificacao.vistaLateral === false)
    return 'A moto precisa estar totalmente de lado, sem perspectiva em três quartos. Gere outra imagem em perfil lateral, com a frente à direita.';
  if (verificacao?.automatica && verificacao.inteira === false)
    return 'A IA identificou partes da moto cortadas. Gere outra imagem mostrando as duas rodas e os retrovisores por inteiro.';
  return null;
}
export function exigeConferenciaManualMiniatura(
  verificacao?: VerificacaoPublicacaoMiniatura | null,
) {
  return (
    !verificacao?.automatica ||
    verificacao.vistaLateral !== true ||
    verificacao.direcao !== 'direita' ||
    verificacao.inteira !== true ||
    verificacao.fidelidade !== 'compativel' ||
    verificacao.pontuacaoFidelidade !== 100
  );
}

// O banco existente valida estes campos efetivos. A analise original fica preservada.
export function prepararVerificacaoPublicacao(
  verificacao: VerificacaoPublicacaoMiniatura & Record<string, unknown>,
  adminId: string,
  candidato: string,
) {
  return {
    ...verificacao,
    analise_original: verificacao.analise_original || { ...verificacao },
    direcao: 'direita',
    inteira: true,
    vistaLateral: true,
    fundoTransparente: true,
    confirmado_por: adminId,
    confirmado_em: new Date().toISOString(),
    candidato_confirmado: candidato,
    enquadramento_confirmado_manualmente:
      !verificacao.automatica ||
      verificacao.vistaLateral !== true ||
      verificacao.direcao !== 'direita' ||
      verificacao.inteira !== true,
    fidelidade_confirmada_manualmente: exigeConferenciaManualMiniatura(verificacao),
  };
}

export const statusMiniaturaEmAberto = [
  'rascunho',
  'pendente',
  'processando',
  'revisao',
  'informacao',
  'falhou',
] as const;
export function miniaturaEmAberto(status: string) {
  return (statusMiniaturaEmAberto as readonly string[]).includes(status);
}
