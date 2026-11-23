import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icone } from '../MenuAdmin';
import { useAncoraVisual } from '../../hooks/useAncoraVisual';
import { type PreferenciasLeitura } from '../../services/preferenciasGlobais';
import {
  moverItem,
  encaixesLivres,
  type OrganizacaoInterface,
} from '../../services/organizacaoInterface';
import { nomesEncaixes, inserirAtalhoVisual } from '../../services/edicaoVisual';
export type SelecaoVisual = {
  elemento: HTMLElement;
  chave: string;
  nome: string;
  escalaPadrao: number;
  area?: string;
  bloco?: string;
  menuItem?: string;
  cartao?: { pagina: string; id: string };
  substituido?: boolean;
};
type Props = {
  selecao: SelecaoVisual;
  preferencias: PreferenciasLeitura;
  alterar: (valor: PreferenciasLeitura) => void;
  trocar: (ancora: HTMLElement) => void;
  limpar: () => void;
};
export default function FerramentasElemento({
  selecao,
  preferencias,
  alterar,
  trocar,
  limpar,
}: Props) {
  const [redimensionando, setRedimensionando] = useState(false);
  const posicao = useAncoraVisual(selecao.elemento);
  const perfilLeitura = selecao.elemento.matches('.settings-personalizacao-presets > button');
  const selecaoCartao = !!selecao.cartao || perfilLeitura;
  const rotuloSelecao = selecaoCartao
    ? 'Cartão selecionado'
    : selecao.area === 'cabecalho'
      ? 'Cabeçalho selecionado'
      : selecao.area === 'menu'
        ? 'Menu principal selecionado'
        : selecao.bloco
          ? 'Atalho selecionado'
          : selecao.area
            ? 'Barra selecionada'
            : `${selecao.nome} selecionado`;
  const [alvoFerramentas, setAlvoFerramentas] = useState<HTMLElement | null>(null);
  const exibirFerramentas = !perfilLeitura || alvoFerramentas === selecao.elemento;
  const ajuste = preferencias.elementos[selecao.chave];
  const organizacao = preferencias.organizacao;
  const barra = organizacao.barras.find((item) => item.id === selecao.area);
  const itens = selecao.area === 'cabecalho' ? organizacao.cabecalho : barra?.itens;
  const indice = itens?.findIndex((item) => item.id === selecao.bloco) ?? -1;
  const salvarOrganizacao = (valor: OrganizacaoInterface) =>
    alterar({ ...preferencias, organizacao: valor });
  const escalonar = (campo: 'escala' | 'fonte', delta: number) => {
    const valor = {
      escala: ajuste?.escala ?? selecao.escalaPadrao,
      fonte: ajuste?.fonte ?? preferencias.tamanhoFonte,
    };
    valor[campo] = Math.max(campo === 'fonte' ? 90 : 80, Math.min(200, valor[campo] + delta));
    alterar({ ...preferencias, elementos: { ...preferencias.elementos, [selecao.chave]: valor } });
  };
  const redimensionar = (evento: ReactPointerEvent<HTMLButtonElement>, direcao: string) => {
    evento.preventDefault();
    evento.stopPropagation();
    const alvo = selecao.elemento;
    const caixa = alvo.getBoundingClientRect();
    const inicioX = evento.clientX;
    const inicioY = evento.clientY;
    const inicio = ajuste?.escala ?? selecao.escalaPadrao;
    const zoomAnterior = alvo.style.zoom;
    const eixoX = direcao.includes('e') ? 1 : direcao.includes('w') ? -1 : 0;
    const eixoY = direcao.includes('s') ? 1 : direcao.includes('n') ? -1 : 0;
    let escalaFinal = inicio;
    setRedimensionando(true);
    evento.currentTarget.setPointerCapture(evento.pointerId);
    const mover = (movimento: PointerEvent) => {
      const deltaX = eixoX
        ? ((movimento.clientX - inicioX) * eixoX * 100) / Math.max(caixa.width, 40)
        : 0;
      const deltaY = eixoY
        ? ((movimento.clientY - inicioY) * eixoY * 100) / Math.max(caixa.height, 40)
        : 0;
      escalaFinal = Math.max(
        80,
        Math.min(200, Math.round(inicio + (deltaX + deltaY) / (eixoX && eixoY ? 2 : 1))),
      );
      alvo.style.zoom = String(escalaFinal / 100);
    };
    const finalizar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', finalizar);
      window.removeEventListener('pointercancel', cancelar);
      alvo.style.zoom = zoomAnterior;
      setRedimensionando(false);
      if (escalaFinal !== inicio)
        alterar({
          ...preferencias,
          elementos: {
            ...preferencias.elementos,
            [selecao.chave]: {
              escala: escalaFinal,
              fonte: ajuste?.fonte ?? preferencias.tamanhoFonte,
            },
          },
        });
    };
    const cancelar = () => {
      escalaFinal = inicio;
      finalizar();
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', finalizar, { once: true });
    window.addEventListener('pointercancel', cancelar, { once: true });
  };
  const mudarOrdem = (delta: number) => {
    if (selecao.menuItem) {
      const de = organizacao.ordemMenu.indexOf(selecao.menuItem);
      salvarOrganizacao({
        ...organizacao,
        ordemMenu: moverItem(organizacao.ordemMenu, de, de + delta),
      });
    } else if (itens && indice >= 0) {
      const proximos = moverItem(itens, indice, indice + delta);
      salvarOrganizacao(
        selecao.area === 'cabecalho'
          ? { ...organizacao, cabecalho: proximos }
          : {
              ...organizacao,
              barras: organizacao.barras.map((item) =>
                item.id === selecao.area ? { ...item, itens: proximos } : item,
              ),
            },
      );
    }
  };
  const posicaoAtual =
    !selecao.bloco && !selecao.menuItem
      ? selecao.area === 'menu'
        ? organizacao.posicaoMenu
        : barra?.posicao
      : undefined;
  const podeTrocar =
    !!selecao.bloco ||
    (!selecao.area &&
      !selecao.elemento.closest('[data-editor-protegido]') &&
      selecao.elemento.matches(
        'button,a,input[type="button"],input[type="submit"],[role="button"]',
      )) ||
    selecao.substituido;
  return (
    <>
      <div
        className="canvas-selection-frame"
        data-personalizador
        data-editor-ui
        data-resizing={redimensionando || undefined}
        style={{
          top: posicao.retangulo.top - 3,
          left: posicao.retangulo.left - 3,
          width: posicao.retangulo.width + 6,
          height: posicao.retangulo.height + 6,
        }}
      >
        {perfilLeitura ? (
          <button
            className="canvas-selection-label"
            type="button"
            aria-expanded={exibirFerramentas}
            onClick={() => setAlvoFerramentas(exibirFerramentas ? null : selecao.elemento)}
          >
            {rotuloSelecao}
          </button>
        ) : (
          <span className="canvas-selection-label">{rotuloSelecao}</span>
        )}
        {!posicaoAtual &&
          (!selecao.area || !!selecao.bloco || !!selecao.menuItem || selecao.substituido) &&
          (selecaoCartao
            ? (['nw', 'ne', 'se', 'sw'] as const)
            : (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const)
          ).map((direcao) => (
            <button
              key={direcao}
              type="button"
              className={`canvas-resize-handle canvas-resize-${direcao}`}
              aria-label={`Redimensionar ${selecao.nome} pelo ${
                (
                  {
                    nw: 'canto superior esquerdo',
                    n: 'centro superior',
                    ne: 'canto superior direito',
                    e: 'centro direito',
                    se: 'canto inferior direito',
                    s: 'centro inferior',
                    sw: 'canto inferior esquerdo',
                    w: 'centro esquerdo',
                  } as const
                )[direcao]
              }`}
              onPointerDown={(evento) => redimensionar(evento, direcao)}
            />
          ))}
      </div>
      <div
        ref={posicao.painel}
        hidden={!exibirFerramentas}
        data-personalizador
        data-editor-ui
        className="canvas-element-tools"
        style={{ top: posicao.top, left: posicao.left, width: posicao.width }}
        role="region"
        aria-label={`Editar ${selecao.nome}`}
      >
        <header>
          <div>
            <small>
              <Icone name={posicaoAtual ? 'layers' : 'pointer'} size={13} />{' '}
              {posicaoAtual ? 'ÁREA' : selecao.bloco ? 'ATALHO' : 'ELEMENTO'}
            </small>
            <strong>{selecao.nome}</strong>
          </div>
          <button
            aria-label="Fechar ferramentas do elemento"
            onClick={perfilLeitura ? () => setAlvoFerramentas(null) : limpar}
          >
            <Icone name="close" size={17} />
          </button>
        </header>
        {!posicaoAtual &&
          (!selecao.area || !!selecao.bloco || !!selecao.menuItem || selecao.substituido) && (
            <>
              <div className="canvas-stepper">
                <span>Tamanho</span>
                <button
                  aria-label="Diminuir tamanho do elemento"
                  disabled={(ajuste?.escala ?? selecao.escalaPadrao) <= 80}
                  onClick={() => escalonar('escala', -5)}
                >
                  −
                </button>
                <output>{ajuste?.escala ?? selecao.escalaPadrao}%</output>
                <button
                  aria-label="Aumentar tamanho do elemento"
                  disabled={(ajuste?.escala ?? selecao.escalaPadrao) >= 200}
                  onClick={() => escalonar('escala', 5)}
                >
                  +
                </button>
              </div>
              <div className="canvas-stepper">
                <span>Texto</span>
                <button
                  aria-label="Diminuir fonte do elemento"
                  disabled={(ajuste?.fonte ?? preferencias.tamanhoFonte) <= 90}
                  onClick={() => escalonar('fonte', -5)}
                >
                  A−
                </button>
                <output>{ajuste?.fonte ?? preferencias.tamanhoFonte}%</output>
                <button
                  aria-label="Aumentar fonte do elemento"
                  disabled={(ajuste?.fonte ?? preferencias.tamanhoFonte) >= 200}
                  onClick={() => escalonar('fonte', 5)}
                >
                  A+
                </button>
              </div>
            </>
          )}
        {posicaoAtual && (
          <div className="canvas-position-options" aria-label="Posição da área">
            {encaixesLivres(organizacao, selecao.area).map((posicao) => (
              <button
                key={posicao}
                aria-pressed={posicaoAtual === posicao}
                onClick={() =>
                  salvarOrganizacao(
                    selecao.area === 'menu'
                      ? { ...organizacao, posicaoMenu: posicao }
                      : {
                          ...organizacao,
                          barras: organizacao.barras.map((item) =>
                            item.id === selecao.area ? { ...item, posicao } : item,
                          ),
                        },
                  )
                }
              >
                {nomesEncaixes[posicao]}
              </button>
            ))}
          </div>
        )}
        {barra && !selecao.bloco && (
          <label className="canvas-bar-name">
            Nome da barra
            <input
              aria-label="Nome da barra"
              value={barra.nome}
              maxLength={40}
              onChange={(evento) =>
                salvarOrganizacao({
                  ...organizacao,
                  barras: organizacao.barras.map((item) =>
                    item.id === barra.id ? { ...item, nome: evento.target.value } : item,
                  ),
                })
              }
            />
          </label>
        )}
        <div className="canvas-context-actions">
          {podeTrocar && (
            <button onClick={(evento) => trocar(evento.currentTarget)}>
              <Icone name="swap" size={16} /> Trocar por atalho
            </button>
          )}
          {(selecao.bloco || selecao.menuItem) && (
            <>
              <button aria-label="Mover elemento para cima" onClick={() => mudarOrdem(-1)}>
                <Icone name="up" size={16} />
              </button>
              <button aria-label="Mover elemento para baixo" onClick={() => mudarOrdem(1)}>
                <Icone name="down" size={16} />
              </button>
            </>
          )}
          {selecao.area && !selecao.bloco && selecao.area !== 'menu' && (
            <button onClick={(evento) => inserirAtalhoVisual(selecao.area!, evento.currentTarget)}>
              <Icone name="plus" size={16} /> Adicionar atalho
            </button>
          )}
          {selecao.bloco && itens && (
            <button
              onClick={() => {
                const proximos = itens.filter((item) => item.id !== selecao.bloco);
                salvarOrganizacao(
                  selecao.area === 'cabecalho'
                    ? { ...organizacao, cabecalho: proximos }
                    : {
                        ...organizacao,
                        barras: organizacao.barras.map((item) =>
                          item.id === selecao.area ? { ...item, itens: proximos } : item,
                        ),
                      },
                );
                limpar();
              }}
            >
              <Icone name="trash" size={15} />
              Remover atalho
            </button>
          )}
          {barra && !selecao.bloco && (
            <button
              onClick={() => {
                salvarOrganizacao({
                  ...organizacao,
                  barras: organizacao.barras.filter((item) => item.id !== barra.id),
                });
                limpar();
              }}
            >
              <Icone name="trash" size={15} />
              Remover barra
            </button>
          )}
          {selecao.cartao && (
            <button
              onClick={() => {
                const { pagina, id } = selecao.cartao!;
                const visiveis = organizacao.cartoes[pagina];
                window.dispatchEvent(
                  new CustomEvent('app-editor-cartao', {
                    detail: {
                      pagina,
                      id,
                      mostrar: visiveis !== undefined && !visiveis.includes(id),
                    },
                  }),
                );
              }}
            >
              {preferencias.organizacao.cartoes[selecao.cartao.pagina] !== undefined &&
              !preferencias.organizacao.cartoes[selecao.cartao.pagina].includes(selecao.cartao.id)
                ? 'Mostrar cartão'
                : 'Ocultar cartão'}
            </button>
          )}
          {!posicaoAtual && (
            <button
              onClick={() => {
                const elementos = { ...preferencias.elementos };
                const substituicoes = { ...preferencias.substituicoes };
                delete elementos[selecao.chave];
                delete substituicoes[selecao.chave];
                alterar({ ...preferencias, elementos, substituicoes });
                limpar();
              }}
            >
              <Icone name="refresh" size={15} />
              Restaurar elemento
            </button>
          )}
        </div>
      </div>
    </>
  );
}
