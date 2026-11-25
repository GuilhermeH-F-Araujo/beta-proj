import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  alvoPersonalizavel,
  chaveElemento,
  iniciarPersonalizacaoElementos,
} from '../services/personalizacaoElementos';
import {
  lerPreferenciasLeitura,
  salvarPreferenciasLeitura,
  type PreferenciasLeitura,
} from '../services/preferenciasGlobais';
import {
  encaixesLivres,
  ativarArrasteInterface,
  novoBloco,
  organizacaoPadrao,
} from '../services/organizacaoInterface';
import { cartoesInterface } from '../services/catalogoInterface';
import { seletorInterfaceEdicao } from '../services/edicaoVisual';
import { estadoSincronizacao, sincronizarPreferenciasConta } from '../services/sincronizacaoConta';
import SituacaoPreferenciasConta from './configuracoes/SituacaoPreferenciasConta';
import FerramentasElemento, { type SelecaoVisual } from './edicaoVisual/FerramentasElemento';
import InseridorAtalhos from './edicaoVisual/InseridorAtalhos';
import SubstituicoesInterface from './edicaoVisual/SubstituicoesInterface';
import './edicaoVisual/edicao-visual.css';
import { Icone } from './MenuAdmin';
type Insercao = { ancora: HTMLElement; container?: string; trocar?: SelecaoVisual };
export default function PersonalizadorInterface() {
  const [editando, setEditando] = useState(false);
  const [selecionando, setSelecionando] = useState(true);
  const [selecao, setSelecao] = useState<SelecaoVisual | null>(null);
  const [insercao, setInsercao] = useState<Insercao | null>(null);
  const [preferencias, setPreferencias] = useState(lerPreferenciasLeitura);
  const [aviso, setAviso] = useState('');
  const historico = useRef<{ antes: PreferenciasLeitura[]; depois: PreferenciasLeitura[] }>({
    antes: [],
    depois: [],
  });
  const [revisao, setRevisao] = useState(0);
  const entrada = useRef<HTMLElement | null>(null);
  const rota = useLocation();
  useEffect(iniciarPersonalizacaoElementos, []);
  const alterar = useCallback((valor: PreferenciasLeitura) => {
    const atual = lerPreferenciasLeitura();
    if (
      Object.keys(valor.elementos).length > 200 ||
      Object.keys(valor.substituicoes).length > 200
    ) {
      setAviso('Limite de 200 ajustes individuais. Restaure um elemento antes de adicionar outro.');
      return;
    }
    if (JSON.stringify(atual) === JSON.stringify(valor)) return;
    historico.current = { antes: [...historico.current.antes, atual].slice(-30), depois: [] };
    setRevisao((i) => i + 1);
    setAviso('');
    salvarPreferenciasLeitura(valor);
  }, []);
  const selecionar = useCallback((alvo: HTMLElement) => {
    const bloco = alvo.closest<HTMLElement>('[data-editor-bloco]');
    const area = alvo.closest<HTMLElement>('[data-editor-area]')?.dataset.editorArea;
    const menuItem = alvo.closest<HTMLElement>('[data-editor-menu-item]')?.dataset.editorMenuItem;
    const cartao = alvo.closest<HTMLElement>('[data-editor-cartao]');
    const chaveCartao = cartao?.dataset.editorCartao?.split(':');
    const marca = alvo.dataset.appCustom;
    delete alvo.dataset.appCustom;
    const escalaPadrao = Math.round((parseFloat(window.getComputedStyle(alvo).zoom) || 1) * 100);
    if (marca !== undefined) alvo.dataset.appCustom = marca;
    setSelecao({
      elemento: alvo,
      chave: chaveElemento(alvo),
      nome:
        alvo.getAttribute('aria-label') ||
        alvo.getAttribute('data-editor-nome') ||
        alvo.textContent?.trim().slice(0, 70) ||
        'Elemento',
      escalaPadrao,
      area: bloco || alvo.dataset.editorArea ? area : undefined,
      bloco: bloco?.dataset.editorBloco,
      menuItem,
      cartao:
        chaveCartao?.length === 2 ? { pagina: chaveCartao[0], id: chaveCartao[1] } : undefined,
      substituido: !!alvo.closest('[data-editor-origem]'),
    });
    setInsercao(null);
  }, []);
  const sair = useCallback(() => {
    setEditando(false);
    setSelecionando(true);
    setSelecao(null);
    setInsercao(null);
    ativarArrasteInterface(false);
    entrada.current?.focus();
  }, []);
  useEffect(() => {
    const abrir = () => {
      entrada.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEditando(true);
      setSelecionando(true);
      ativarArrasteInterface(true);
      setSelecao(null);
      setInsercao(null);
    };
    const atualizar = () => setPreferencias(lerPreferenciasLeitura());
    window.addEventListener('app-personalizar', abrir);
    window.addEventListener('app-organizar', abrir);
    window.addEventListener('app-preferences-change', atualizar);
    return () => {
      window.removeEventListener('app-personalizar', abrir);
      window.removeEventListener('app-organizar', abrir);
      window.removeEventListener('app-preferences-change', atualizar);
      ativarArrasteInterface(false);
      delete document.documentElement.dataset.appEditing;
      delete document.documentElement.dataset.appEditingPaused;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.appPage = rota.pathname;
    window.dispatchEvent(new Event('app-preferences-change'));
    setSelecao(null);
    setInsercao(null);
  }, [rota.pathname]);
  useEffect(() => {
    ativarArrasteInterface(editando && selecionando);
  }, [editando, selecionando]);
  useEffect(() => {
    if (!editando) {
      delete document.documentElement.dataset.appEditing;
      delete document.documentElement.dataset.appEditingPaused;
      return;
    }
    document.documentElement.dataset.appEditing = 'true';
    if (!selecionando) document.documentElement.dataset.appEditingPaused = 'true';
    else delete document.documentElement.dataset.appEditingPaused;
    let hover: HTMLElement | null = null;
    const eInterface = (alvo: EventTarget | null) =>
      alvo instanceof Element && !!alvo.closest(seletorInterfaceEdicao);
    const apontar = (evento: PointerEvent) => {
      if (!selecionando) return;
      if (eInterface(evento.target)) return;
      hover?.removeAttribute('data-app-pick');
      hover = alvoPersonalizavel(evento.target);
      hover?.setAttribute('data-app-pick', 'true');
    };
    const clique = (evento: MouseEvent) => {
      if (!selecionando) return;
      if (eInterface(evento.target)) return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      const alvo = alvoPersonalizavel(evento.target);
      if (alvo) selecionar(alvo);
      else {
        setSelecao(null);
        setInsercao(null);
      }
    };
    const bloquear = (evento: Event) => {
      if (!selecionando) return;
      if (eInterface(evento.target)) return;
      evento.stopImmediatePropagation();
      if (
        evento.type !== 'pointerdown' ||
        !(evento.target instanceof Element) ||
        !evento.target.closest('[draggable="true"]') ||
        evento.target.closest('input,select,textarea')
      )
        evento.preventDefault();
    };
    const teclado = (evento: KeyboardEvent) => {
      if (!selecionando) return;
      if (evento.key === 'Escape') {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        if (insercao) setInsercao(null);
        else if (selecao) setSelecao(null);
        else sair();
        return;
      }
      if (eInterface(evento.target)) return;
      if (evento.key === 'Tab') return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      if (evento.key === 'Enter' || evento.key === ' ') {
        const alvo = alvoPersonalizavel(document.activeElement);
        if (alvo) selecionar(alvo);
      }
    };
    const selecionarArea = (evento: Event) =>
      selecionar((evento as CustomEvent<HTMLElement>).detail);
    const inserir = (evento: Event) => {
      setSelecao(null);
      setInsercao((evento as CustomEvent<Insercao>).detail);
    };
    const receber = (evento: Event) => alterar((evento as CustomEvent<PreferenciasLeitura>).detail);
    const cartao = (evento: Event) => {
      const { pagina, id, mostrar } = (
        evento as CustomEvent<{ pagina: string; id: string; mostrar: boolean }>
      ).detail;
      const atual = lerPreferenciasLeitura();
      const ids =
        atual.organizacao.cartoes[pagina] ||
        cartoesInterface[pagina]?.itens.map((item) => item.id) ||
        [];
      alterar({
        ...atual,
        organizacao: {
          ...atual.organizacao,
          cartoes: {
            ...atual.organizacao.cartoes,
            [pagina]: mostrar ? [...new Set([...ids, id])] : ids.filter((item) => item !== id),
          },
        },
      });
    };
    document.addEventListener('pointerover', apontar, true);
    document.addEventListener('click', clique, true);
    document.addEventListener('auxclick', clique, true);
    document.addEventListener('dblclick', clique, true);
    document.addEventListener('keydown', teclado, true);
    const eventos = ['pointerdown', 'pointerup', 'submit', 'input', 'change', 'contextmenu'];
    for (const nome of eventos) document.addEventListener(nome, bloquear, true);
    window.addEventListener('app-editor-selecionar', selecionarArea);
    window.addEventListener('app-editor-inserir', inserir);
    window.addEventListener('app-editor-alterar', receber);
    window.addEventListener('app-editor-cartao', cartao);
    return () => {
      hover?.removeAttribute('data-app-pick');
      document.removeEventListener('pointerover', apontar, true);
      document.removeEventListener('click', clique, true);
      document.removeEventListener('auxclick', clique, true);
      document.removeEventListener('dblclick', clique, true);
      document.removeEventListener('keydown', teclado, true);
      for (const nome of eventos) document.removeEventListener(nome, bloquear, true);
      window.removeEventListener('app-editor-selecionar', selecionarArea);
      window.removeEventListener('app-editor-inserir', inserir);
      window.removeEventListener('app-editor-alterar', receber);
      window.removeEventListener('app-editor-cartao', cartao);
    };
  }, [editando, selecionando, insercao, selecao, selecionar, sair, alterar]);
  useEffect(() => {
    if (!selecao) return;
    const atualizar = () => {
      if (selecao.elemento.isConnected && selecao.elemento.dataset.appReplaced !== 'true') return;
      const id = selecao.bloco;
      const alvo =
        selecao.area && !id
          ? Array.from(document.querySelectorAll<HTMLElement>('[data-editor-area]')).find(
              (item) => item.dataset.editorArea === selecao.area,
            )
          : id
            ? Array.from(document.querySelectorAll<HTMLElement>('[data-editor-bloco]')).find(
                (item) => item.dataset.editorBloco === id,
              )
            : document.querySelector<HTMLElement>(
                `[data-editor-origem="${selecao.chave}"] button,[data-editor-origem="${selecao.chave}"] input`,
              );
      if (alvo) selecionar(alvo);
      else if (!selecao.elemento.isConnected) setSelecao(null);
    };
    const observador = new MutationObserver(atualizar);
    observador.observe(document.body, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, [selecao, selecionar]);
  const escolherAtalho = (id: string) => {
    if (!insercao) return;
    const atual = lerPreferenciasLeitura();
    const org = atual.organizacao;
    const alvo = insercao.trocar;
    if (alvo?.bloco) {
      const transformar = (itens: typeof org.cabecalho) =>
        itens.map((item) => (item.id === alvo.bloco ? { ...item, atalho: id } : item));
      alterar({
        ...atual,
        organizacao:
          alvo.area === 'cabecalho'
            ? { ...org, cabecalho: transformar(org.cabecalho) }
            : {
                ...org,
                barras: org.barras.map((barra) =>
                  barra.id === alvo.area ? { ...barra, itens: transformar(barra.itens) } : barra,
                ),
              },
      });
    } else if (alvo)
      alterar({ ...atual, substituicoes: { ...atual.substituicoes, [alvo.chave]: id } });
    else if (insercao.container) {
      const itens =
        insercao.container === 'cabecalho'
          ? org.cabecalho
          : org.barras.find((barra) => barra.id === insercao.container)?.itens;
      if (!itens || itens.length >= 24) {
        setAviso('Esta barra comporta até 24 atalhos. Crie outra barra para adicionar mais.');
        setInsercao(null);
        return;
      }
      alterar({
        ...atual,
        organizacao:
          insercao.container === 'cabecalho'
            ? { ...org, cabecalho: [...itens, novoBloco(id)] }
            : {
                ...org,
                barras: org.barras.map((barra) =>
                  barra.id === insercao.container
                    ? { ...barra, itens: [...itens, novoBloco(id)] }
                    : barra,
                ),
              },
      });
    }
    setInsercao(null);
  };
  const desfazer = (refazer = false) => {
    const origem = refazer ? historico.current.depois : historico.current.antes;
    const valor = origem.at(-1);
    if (!valor) return;
    const atual = lerPreferenciasLeitura();
    historico.current = refazer
      ? { antes: [...historico.current.antes, atual], depois: origem.slice(0, -1) }
      : { antes: origem.slice(0, -1), depois: [...historico.current.depois, atual] };
    setRevisao((i) => i + 1);
    salvarPreferenciasLeitura(valor);
    setSelecao(null);
    setInsercao(null);
  };
  const concluir = async () => {
    await sincronizarPreferenciasConta();
    if (estadoSincronizacao().estado === 'erro') {
      setAviso(
        'Não foi possível confirmar o salvamento. Suas alterações continuam no rascunho local.',
      );
      return;
    }
    sair();
  };
  return (
    <>
      <SubstituicoesInterface valores={preferencias.substituicoes} />
      {editando &&
        createPortal(
          <>
            <div
              data-personalizador
              data-editor-ui
              className="canvas-editor-bar"
              role="toolbar"
              aria-label="Modo edição da minha interface"
              data-revision={revisao}
            >
              <div className="canvas-editor-dock-start">
                <button className="canvas-editor-back" onClick={sair} title="Voltar à tela">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 12H4m7-7-7 7 7 7" />
                  </svg>
                  <span>Voltar</span>
                </button>
                <span className="canvas-editor-divider" aria-hidden="true" />
                <button
                  className={`canvas-editor-mode${selecionando ? ' is-selecting' : ' is-browsing'}`}
                  aria-pressed={selecionando}
                  onClick={() => {
                    setSelecionando((atual) => !atual);
                    setSelecao(null);
                    setInsercao(null);
                  }}
                  title={
                    selecionando
                      ? 'Pausar seleção e navegar pela tela'
                      : 'Voltar a selecionar itens'
                  }
                >
                  {selecionando ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                      <path d="M2 7V2h5m10 0h5v5M2 17v5h5m15-5v5h-4" />
                      <path d="m13 11 7 6-3 .4-1.6 3L13 11Z" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                      <path d="M5 3.5a.6.6 0 0 0-.9.6l3.2 16a.6.6 0 0 0 1.1.2l3.2-5.3 5.5 3.8a.6.6 0 0 0 .9-.4l1.2-4.4a.6.6 0 0 0-.3-.7L5 3.5Z" />
                      <path d="m14 4 1-2m4 5 2-1m-2 9 2 1" />
                    </svg>
                  )}
                  <span className="canvas-editor-mode-copy">
                    <strong>{selecionando ? 'Selecionar itens' : 'Navegar pela tela'}</strong>
                    <small>
                      {selecionando
                        ? 'Scroll livre · clique para navegar'
                        : 'Links e modais liberados · clique para editar'}
                    </small>
                  </span>
                </button>
              </div>
              <span className="canvas-editor-divider canvas-editor-divider-main" aria-hidden="true" />
              <div className="canvas-editor-dock-actions">
                <div
                  className="canvas-editor-history"
                  role="group"
                  aria-label="Histórico de edição"
                >
                  <button
                    title="Desfazer alteração"
                    aria-label="Desfazer alteração"
                    disabled={!historico.current.antes.length}
                    onClick={() => desfazer()}
                  >
                    <Icone name="undo" size={23} />
                    <span>Desfazer</span>
                  </button>
                  <span className="canvas-editor-divider" aria-hidden="true" />
                  <button
                    title="Refazer alteração"
                    aria-label="Refazer alteração"
                    disabled={!historico.current.depois.length}
                    onClick={() => desfazer(true)}
                  >
                    <Icone name="redo" size={23} />
                    <span>Refazer</span>
                  </button>
                </div>
                <span className="canvas-editor-divider" aria-hidden="true" />
                <button
                  className="canvas-editor-add"
                  title="Criar uma nova barra de atalhos"
                  disabled={!encaixesLivres(preferencias.organizacao).length}
                  onClick={() =>
                    alterar({
                      ...preferencias,
                      organizacao: {
                        ...preferencias.organizacao,
                        barras: [
                          ...preferencias.organizacao.barras,
                          {
                            id: `barra-${crypto.randomUUID()}`,
                            nome: `Atalhos ${preferencias.organizacao.barras.length + 1}`,
                            posicao: encaixesLivres(preferencias.organizacao)[0] || 'inferior',
                            itens: [],
                          },
                        ],
                      },
                    })
                  }
                >
                  <Icone name="plus" size={16} />
                  <span>Adicionar barra</span>
                </button>
                <span className="canvas-editor-divider" aria-hidden="true" />
                <details className="canvas-reset-menu">
                  <summary aria-label="Restaurar layout" title="Restaurar layout">
                    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
                      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                    <span>Restaurar</span>
                  </summary>
                  <button
                    onClick={() => {
                      alterar({
                        ...preferencias,
                        organizacao: organizacaoPadrao(),
                        elementos: {},
                        substituicoes: {},
                      });
                      setSelecao(null);
                      setInsercao(null);
                    }}
                  >
                    Restaurar disposição e elementos
                  </button>
                </details>
              </div>
              <span className="canvas-editor-divider canvas-editor-divider-main" aria-hidden="true" />
              <button
                className="canvas-editor-finish"
                onClick={() => void concluir()}
                title="Salvar as alterações na conta e concluir"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m3 12 6 6L21 6" />
                </svg>
                <span>Concluir edição</span>
              </button>
            </div>
            <div data-personalizador data-editor-ui className="canvas-editor-save-status">
              <SituacaoPreferenciasConta compacta modoEditor />
            </div>
            {aviso && (
              <div
                data-personalizador
                data-editor-ui
                className="canvas-editor-notice"
                role="status"
              >
                {aviso}
                <button aria-label="Fechar aviso" onClick={() => setAviso('')}>
                  <Icone name="close" size={16} />
                </button>
              </div>
            )}
            {selecao && !insercao && (
              <FerramentasElemento
                selecao={selecao}
                preferencias={preferencias}
                alterar={alterar}
                limpar={() => setSelecao(null)}
                trocar={(ancora) => setInsercao({ ancora, trocar: selecao })}
              />
            )}
            {insercao && (
              <InseridorAtalhos
                ancora={insercao.ancora}
                titulo={insercao.trocar ? 'Trocar este elemento por…' : 'Adicionar atalho aqui'}
                escolher={escolherAtalho}
                fechar={() => setInsercao(null)}
              />
            )}
          </>,
          document.body,
        )}
    </>
  );
}
