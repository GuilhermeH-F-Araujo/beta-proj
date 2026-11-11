export const idsAbasConfiguracao = [
  "geral",
  "preferencias",
  "seguranca",
  "integracoes",
  "notificacoes",
  "sobre",
] as const;
export type AbaConfiguracao = (typeof idsAbasConfiguracao)[number];
export function selecionarAbaConfiguracao(
  raw: string | null,
  administrador: boolean,
): AbaConfiguracao {
  return idsAbasConfiguracao.includes(raw as AbaConfiguracao) &&
    (administrador || raw === "preferencias" || raw === "notificacoes")
    ? (raw as AbaConfiguracao)
    : administrador
      ? "geral"
      : "preferencias";
}
export function proximaOpcao(
  tecla: string,
  atual: number,
  total: number,
  vertical = false,
) {
  if (total < 1) return null;
  if (tecla === "Home") return 0;
  if (tecla === "End") return total - 1;
  if (tecla === (vertical ? "ArrowDown" : "ArrowRight"))
    return (atual + 1) % total;
  if (tecla === (vertical ? "ArrowUp" : "ArrowLeft"))
    return (atual - 1 + total) % total;
  return null;
}
