import { lerPreferenciasLeitura } from './preferenciasGlobais';
export function abrirPersonalizador() {
  window.dispatchEvent(new Event('app-personalizar'));
}
const seletor =
  'form,div,button,a,label,input,select,textarea,p,span,small,strong,b,h1,h2,h3,h4,h5,h6,td,th,dt,dd,li,summary';
function textoOriginal(elemento: Element) {
  if (!elemento.querySelector('[data-editor-mount],[data-editor-ui]'))
    return elemento.textContent || '';
  const copia = elemento.cloneNode(true) as Element;
  copia.querySelectorAll('[data-editor-mount],[data-editor-ui]').forEach((item) => item.remove());
  return copia.textContent || '';
}
export function chaveElemento(elemento: HTMLElement) {
  const origem = elemento.closest<HTMLElement>('[data-editor-origem]')?.dataset.editorOrigem;
  if (origem && /^item-[a-z0-9]+$/.test(origem)) return origem;
  const partes: string[] = [];
  let atual: HTMLElement | null = elemento;
  while (atual && atual !== document.body) {
    const irmaos = atual.parentElement
      ? Array.from(atual.parentElement.children).filter(
          (item) => !item.hasAttribute('data-editor-mount'),
        )
      : [];
    partes.push(
      `${atual.tagName}:${atual.id || atual.getAttribute('name') || irmaos.filter((item) => item.tagName === atual!.tagName).indexOf(atual)}`,
    );
    atual = atual.parentElement;
  }
  const regiao = elemento.closest('.admin-menu')
    ? 'menu'
    : elemento.closest('.orders-header')
      ? 'cabecalho'
      : elemento.closest('[data-workspace-bar]')?.getAttribute('data-workspace-bar') ||
        document.documentElement.dataset.appPage ||
        window.location.pathname;
  const identidade = elemento.getAttribute('data-personalizar-id');
  const contexto =
    identidade ||
    (elemento.closest('tr') ? textoOriginal(elemento.closest('tr')!) : '') ||
    elemento.getAttribute('aria-label') ||
    textoOriginal(elemento) ||
    '';
  let hash = 2166136261;
  for (const letra of `${regiao}|${identidade || partes.join('/')}|${contexto}`)
    hash = Math.imul(hash ^ letra.charCodeAt(0), 16777619);
  return `item-${(hash >>> 0).toString(36)}`;
}
export function alvoPersonalizavel(alvo: EventTarget | null): HTMLElement | null {
  if (!(alvo instanceof Element) || alvo.closest('[data-personalizador],[data-editor-ui]'))
    return null;
  const elemento =
    alvo.closest('form[data-editor-bloco]') ||
    alvo.closest('button,a,input,select,textarea,[role="button"]') ||
    alvo.closest(seletor);
  return elemento instanceof HTMLElement &&
    (elemento.tagName !== 'DIV' ||
      Array.from(elemento.childNodes).some((no) => no.nodeType === 3 && no.textContent?.trim()))
    ? elemento
    : null;
}
export function iniciarPersonalizacaoElementos() {
  let agendado = 0;
  let bases = new WeakMap<HTMLElement, number>();
  const raiz = document.documentElement;
  const limpar = (elemento: HTMLElement) => {
    delete elemento.dataset.appFont;
    delete elemento.dataset.appFontManaged;
    delete elemento.dataset.appCustom;
    elemento.style.removeProperty('--app-local-font');
    elemento.style.removeProperty('--app-local-scale');
  };
  document
    .querySelectorAll<HTMLElement>('[data-app-font],[data-app-font-managed],[data-app-custom]')
    .forEach(limpar);
  const atualizar = () => {
    const preferencias = lerPreferenciasLeitura();
    const elementos = Array.from(document.querySelectorAll<HTMLElement>(seletor)).filter(
      (item) =>
        !item.closest(
          '[data-personalizador],[data-app-preference-control],script,style,[aria-hidden="true"]',
        ) &&
        (item.tagName !== 'DIV' ||
          Array.from(item.childNodes).some((no) => no.nodeType === 3 && no.textContent?.trim())),
    );
    const novos = elementos.filter((elemento) => !bases.has(elemento));
    if (novos.length) {
      // Desliga tambem transicoes: o estilo interpolado nunca pode virar a base.
      raiz.dataset.appMeasuring = 'true';
      try {
        for (const elemento of novos) {
          const tamanho = parseFloat(window.getComputedStyle(elemento).fontSize);
          if (Number.isFinite(tamanho) && tamanho > 0) bases.set(elemento, tamanho);
        }
      } finally {
        delete raiz.dataset.appMeasuring;
      }
    }
    const chaves = new WeakMap<HTMLElement, string>();
    const chave = (elemento: HTMLElement) => {
      let valor = chaves.get(elemento);
      if (!valor) {
        valor = chaveElemento(elemento);
        chaves.set(elemento, valor);
      }
      return valor;
    };
    const temAjustes = Object.keys(preferencias.elementos).length > 0;
    const temFonte =
      preferencias.tamanhoFonte !== 100 ||
      Object.values(preferencias.elementos).some((ajuste) => ajuste.fonte !== 100);
    for (const elemento of elementos) {
      const ajuste = temAjustes ? preferencias.elementos[chave(elemento)] : undefined;
      let ancestral = elemento.parentElement;
      let fonte = ajuste?.fonte;
      while (temAjustes && fonte === undefined && ancestral && ancestral !== document.body) {
        fonte = preferencias.elementos[chave(ancestral)]?.fonte;
        ancestral = ancestral.parentElement;
      }
      fonte ??= preferencias.tamanhoFonte;
      const base = bases.get(elemento);
      if (base !== undefined) elemento.dataset.appFontManaged = 'true';
      if (temFonte && base !== undefined) {
        elemento.style.setProperty('--app-local-font', `${Math.round(base * fonte) / 100}px`);
        elemento.dataset.appFont = 'true';
      } else {
        delete elemento.dataset.appFont;
        elemento.style.removeProperty('--app-local-font');
      }
      if (ajuste) {
        elemento.dataset.appCustom = 'true';
        elemento.style.setProperty('--app-local-scale', String(ajuste.escala / 100));
      } else {
        delete elemento.dataset.appCustom;
        elemento.style.removeProperty('--app-local-scale');
      }
    }
  };
  const agendar = () => {
    window.cancelAnimationFrame(agendado);
    agendado = window.requestAnimationFrame(atualizar);
  };
  const renovarBases = () => {
    bases = new WeakMap();
    agendar();
  };
  const observador = new MutationObserver((registros) => {
    for (const registro of registros) {
      if (registro.type === 'attributes' && registro.target instanceof HTMLElement) {
        bases.delete(registro.target);
        registro.target
          .querySelectorAll<HTMLElement>('*')
          .forEach((elemento) => bases.delete(elemento));
      }
    }
    agendar();
  });
  observador.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden'],
  });
  window.addEventListener('app-preferences-change', atualizar);
  window.addEventListener('resize', renovarBases);
  document.addEventListener('load', renovarBases, true);
  atualizar();
  return () => {
    observador.disconnect();
    window.cancelAnimationFrame(agendado);
    window.removeEventListener('app-preferences-change', atualizar);
    window.removeEventListener('resize', renovarBases);
    document.removeEventListener('load', renovarBases, true);
    document
      .querySelectorAll<HTMLElement>('[data-app-font],[data-app-font-managed],[data-app-custom]')
      .forEach(limpar);
    delete raiz.dataset.appMeasuring;
  };
}
