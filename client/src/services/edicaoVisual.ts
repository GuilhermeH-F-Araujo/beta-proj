import { type PosicaoBarra, type OrganizacaoInterface } from './organizacaoInterface';
import { lerPreferenciasLeitura, type PreferenciasLeitura } from './preferenciasGlobais';
export const nomesEncaixes: Record<PosicaoBarra, string> = {
  esquerda: 'Lateral esquerda',
  direita: 'Lateral direita',
  'superior-antes': 'Acima do cabeçalho',
  'superior-depois': 'Abaixo do cabeçalho',
  inferior: 'Parte inferior',
};
export function selecionarAreaVisual(elemento: HTMLElement) {
  window.dispatchEvent(new CustomEvent('app-editor-selecionar', { detail: elemento }));
}
export function inserirAtalhoVisual(container: string, ancora: HTMLElement) {
  window.dispatchEvent(new CustomEvent('app-editor-inserir', { detail: { container, ancora } }));
}
export function registrarEdicaoVisual(valor: PreferenciasLeitura) {
  window.dispatchEvent(new CustomEvent('app-editor-alterar', { detail: valor }));
}
export const seletorInterfaceEdicao = '[data-personalizador],[data-editor-ui]';

export function registrarOrganizacaoVisual(organizacao: OrganizacaoInterface) {
  registrarEdicaoVisual({ ...lerPreferenciasLeitura(), organizacao });
}
