import { atalhosInterface, fontesInterface, type FonteInterface } from './catalogoInterface';
import { normalizarOrganizacao, type OrganizacaoInterface } from './organizacaoInterface';
// Aplica preferencias de leitura no conteudo e nos portais de modais.
// As escalas de menu, cabecalho e conteudo sao independentes.
import { enfileirarPreferenciaConta } from './sincronizacaoConta';
export type AjusteElemento = { escala: number; fonte: number };
export type PreferenciasLeitura = {
  tema: 'claro' | 'escuro';
  tamanhoIcones: number;
  areaClique: number;
  fonteInterface: FonteInterface;
  organizacao: OrganizacaoInterface;
  painelPersonalizacao: { x: number; y: number };
  tamanhoFonte: number;
  tamanhoCampos: number;
  espacoLetras: number;
  destacarFoco: boolean;
  sublinharLinks: boolean;
  elementos: Record<string, AjusteElemento>;
  substituicoes: Record<string, string>;
  tamanhoTexto: number;
  tamanhoMenu: number;
  tamanhoCabecalho: number;
  tamanhoModais: number;
  tamanhoBotoes: number;
  pesoTexto: number;
  espacoLinhas: number;
  contraste: boolean;
  reduzirMovimento: boolean;
  densidade: 'confortavel' | 'compacta';
  periodoDashboard: 'diario' | 'semanal' | 'mensal';
};
export const chaveLeitura = 'estacao-config-preferencias';
export function normalizarLeitura(
  dados: Partial<PreferenciasLeitura> & { fonte?: string } = {},
): PreferenciasLeitura {
  const numero = (valor: unknown, padrao: number, minimo: number, maximo: number) =>
    typeof valor === 'number' && Number.isFinite(valor)
      ? Math.max(minimo, Math.min(maximo, valor))
      : padrao;
  return {
    tema: dados.tema === 'escuro' ? 'escuro' : 'claro',
    tamanhoIcones: numero(dados.tamanhoIcones, 100, 90, 180),
    areaClique: numero(dados.areaClique, 40, 40, 64),
    fonteInterface: fontesInterface.some((fonte) => fonte.id === dados.fonteInterface)
      ? dados.fonteInterface!
      : 'sistema',
    organizacao: normalizarOrganizacao(dados.organizacao),
    painelPersonalizacao: {
      x: numero(dados.painelPersonalizacao?.x, 100, 0, 100),
      y: numero(dados.painelPersonalizacao?.y, 0, 0, 100),
    },
    tamanhoFonte: numero(dados.tamanhoFonte, 100, 90, 200),
    tamanhoCampos: numero(dados.tamanhoCampos, 100, 90, 150),
    espacoLetras: numero(dados.espacoLetras, 0, 0, 5),
    destacarFoco: dados.destacarFoco !== false,
    sublinharLinks: dados.sublinharLinks === true,
    substituicoes: Object.fromEntries(
      Object.entries(dados.substituicoes || {})
        .filter(
          ([chave, id]) =>
            /^item-[a-z0-9]+$/.test(chave) && atalhosInterface.some((atalho) => atalho.id === id),
        )
        .slice(0, 200),
    ),
    elementos: Object.fromEntries(
      Object.entries(dados.elementos || {})
        .filter(
          ([chave, valor]) => /^item-[a-z0-9]+$/.test(chave) && valor && typeof valor === 'object',
        )
        .slice(0, 200)
        .map(([chave, valor]) => [
          chave,
          { escala: numero(valor.escala, 100, 80, 200), fonte: numero(valor.fonte, 100, 90, 200) },
        ]),
    ),
    tamanhoTexto: numero(
      dados.tamanhoTexto,
      dados.fonte === 'extra' ? 120 : dados.fonte === 'padrao' ? 100 : 110,
      90,
      150,
    ),
    tamanhoMenu: numero(dados.tamanhoMenu, 100, 90, 140),
    tamanhoCabecalho: numero(dados.tamanhoCabecalho, 100, 90, 130),
    tamanhoModais: numero(dados.tamanhoModais, 100, 90, 150),
    tamanhoBotoes: numero(dados.tamanhoBotoes, 100, 80, 150),
    pesoTexto: numero(dados.pesoTexto, 500, 400, 700),
    espacoLinhas: numero(dados.espacoLinhas, 14, 12, 18),
    contraste: dados.contraste === true,
    reduzirMovimento: dados.reduzirMovimento === true,
    densidade: dados.densidade === 'compacta' ? 'compacta' : 'confortavel',
    periodoDashboard: ['diario', 'semanal', 'mensal'].includes(dados.periodoDashboard || '')
      ? dados.periodoDashboard!
      : 'semanal',
  };
}
let usuarioLeitura = '';
const memoriaLeitura = new Map<string, PreferenciasLeitura>();
export const chaveLeituraConta = (id = usuarioLeitura) => `estacao-conta-${id}-leitura`;
export function setUsuarioLeitura(id: string) {
  usuarioLeitura = id;
}
export function receberPreferenciasLeitura(dados: Partial<PreferenciasLeitura>) {
  const valorLocal = normalizarLeitura(dados);
  memoriaLeitura.set(usuarioLeitura ? chaveLeituraConta() : chaveLeitura, valorLocal);
  try {
    localStorage.setItem(chaveLeituraConta(), JSON.stringify(valorLocal));
    localStorage.setItem(chaveLeitura, JSON.stringify(valorLocal));
  } catch {}
  aplicarPreferenciasLeitura(valorLocal);
  window.dispatchEvent(new Event('app-preferences-change'));
  return valorLocal;
}
export function lerPreferenciasLeitura(): PreferenciasLeitura {
  const memoria = memoriaLeitura.get(usuarioLeitura ? chaveLeituraConta() : chaveLeitura);
  if (memoria) return memoria;
  try {
    return normalizarLeitura(
      JSON.parse(
        localStorage.getItem(usuarioLeitura ? chaveLeituraConta() : chaveLeitura) || '{}',
      ) || {},
    );
  } catch {
    return normalizarLeitura();
  }
}
export function aplicarPreferenciasLeitura(preferencias = lerPreferenciasLeitura()) {
  const raiz = document.documentElement;
  raiz.dataset.appReading = 'true';
  raiz.dataset.appTheme = preferencias.tema;
  raiz.style.setProperty('color-scheme', preferencias.tema === 'escuro' ? 'dark' : 'light');
  raiz.style.setProperty('--app-reading-font-scale', String(preferencias.tamanhoFonte / 100));
  raiz.dataset.appFontFamily = preferencias.fonteInterface;
  raiz.style.setProperty(
    '--app-selected-font-family',
    fontesInterface.find((fonte) => fonte.id === preferencias.fonteInterface)!.familia,
  );
  raiz.style.setProperty('--app-icon-scale', String(preferencias.tamanhoIcones / 100));
  raiz.style.setProperty('--app-touch-size', `${preferencias.areaClique}px`);
  raiz.dataset.appFocus = String(preferencias.destacarFoco);
  raiz.dataset.appLinks = String(preferencias.sublinharLinks);
  raiz.style.setProperty('--app-field-scale', String(preferencias.tamanhoCampos / 100));
  raiz.style.setProperty('--app-letter-spacing', `${preferencias.espacoLetras / 10}em`);
  raiz.dataset.appTextScale = String(preferencias.tamanhoTexto);
  raiz.dataset.appContrast = String(preferencias.contraste);
  raiz.dataset.appMotion = String(!preferencias.reduzirMovimento);
  raiz.dataset.appDensity = preferencias.densidade;
  raiz.style.setProperty('--app-ui-scale', String(preferencias.tamanhoModais / 100));
  raiz.style.setProperty('--app-content-scale', String(preferencias.tamanhoTexto / 100));
  raiz.style.setProperty('--app-menu-scale', String(preferencias.tamanhoMenu / 100));
  raiz.style.setProperty('--app-header-scale', String(preferencias.tamanhoCabecalho / 100));
  raiz.style.setProperty('--app-modal-scale', String(preferencias.tamanhoModais / 100));
  raiz.style.setProperty('--app-button-scale', String(preferencias.tamanhoBotoes / 100));
  raiz.style.setProperty('--app-font-weight', String(preferencias.pesoTexto));
  raiz.style.setProperty(
    '--app-heading-weight',
    String(Math.min(900, preferencias.pesoTexto + 200)),
  );
  raiz.style.setProperty('--app-line-height', String(preferencias.espacoLinhas / 10));
  try {
    localStorage.setItem('estacao-periodo-dashboard', preferencias.periodoDashboard);
  } catch {}
}
export function salvarPreferenciasLeitura(dados: PreferenciasLeitura) {
  const valorLocal = receberPreferenciasLeitura(dados);
  enfileirarPreferenciaConta('leitura', valorLocal);
}
export function iniciarPreferenciasGlobais() {
  aplicarPreferenciasLeitura();
  const atualizar = () => aplicarPreferenciasLeitura();
  window.addEventListener('app-preferences-change', atualizar);
  window.addEventListener('storage', (evento) => {
    if (evento.key === chaveLeitura || evento.key === chaveLeituraConta()) {
      memoriaLeitura.delete(usuarioLeitura ? chaveLeituraConta() : chaveLeitura);
      atualizar();
    }
  });
  const marcarModal = (elemento: Element) => {
    if (!(elemento instanceof HTMLElement)) return;
    const pai = elemento.parentElement?.closest('[data-app-modal-root],dialog');
    if (pai) return;
    elemento.dataset.appModalRoot = 'true';
    elemento.dataset.appModalInline =
      elemento.parentElement === document.body
        ? 'none'
        : elemento.closest('.orders-header')
          ? 'header'
          : elemento.closest('.admin-menu')
            ? 'menu'
            : elemento.closest('main')
              ? 'content'
              : 'none';
  };
  const marcar = (elemento: Element) => {
    if (
      elemento instanceof HTMLElement &&
      elemento.parentElement === document.body &&
      elemento.id !== 'root' &&
      !['SCRIPT', 'STYLE', 'LINK'].includes(elemento.tagName)
    )
      elemento.dataset.appPortalRoot = 'true';
    if (elemento.matches('dialog,[aria-modal="true"],[class*="backdrop"],[class*="overlay"]'))
      marcarModal(elemento);
    elemento
      .querySelectorAll('dialog,[aria-modal="true"],[class*="backdrop"],[class*="overlay"]')
      .forEach(marcarModal);
  };
  Array.from(document.body.children).forEach(marcar);
  const observador = new MutationObserver((registros) => {
    for (const registro of registros)
      for (const elementoLocal of registro.addedNodes)
        if (elementoLocal instanceof Element) marcar(elementoLocal);
  });
  observador.observe(document.body, { childList: true, subtree: true });
  return () => observador.disconnect();
}
export function escalaAtual(elemento?: Element | null) {
  if (elemento?.closest('[data-personalizador]')) return 1;
  const chave = elemento?.closest('[data-app-modal-root],dialog')
    ? '--app-modal-scale'
    : elemento?.closest('.orders-header')
      ? '--app-header-scale'
      : elemento?.closest('.admin-menu')
        ? '--app-menu-scale'
        : '--app-content-scale';
  const valorLocal = Number(document.documentElement.style.getPropertyValue(chave));
  return Number.isFinite(valorLocal) && valorLocal > 0 ? valorLocal : 1;
}

export const lerOrganizacaoInterface = () => lerPreferenciasLeitura().organizacao;
export function salvarOrganizacaoInterface(organizacao: OrganizacaoInterface) {
  salvarPreferenciasLeitura({ ...lerPreferenciasLeitura(), organizacao });
}
