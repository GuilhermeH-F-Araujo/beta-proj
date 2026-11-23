import { ControlesArea, CriarBarraVisual } from '../edicaoVisual/ControlesArea';
import { lerOrganizacaoInterface } from '../../services/preferenciasGlobais';
import {
  useArrasteInterface,
  useOrganizacaoInterface,
  type PosicaoBarra,
} from '../../services/organizacaoInterface';
import { BlocoAtalho } from './AtalhosPainel';
export default function BarrasAtalhos({ posicao }: { posicao: PosicaoBarra }) {
  const arraste = useArrasteInterface();
  const organizacao = useOrganizacaoInterface(lerOrganizacaoInterface);
  return (
    <>
      {organizacao.barras
        .filter((barra) => barra.posicao === posicao)
        .map((barra) => (
          <nav
            key={barra.id}
            className={`workspace-shortcut-bar workspace-bar-${posicao}`}
            data-workspace-bar={barra.id}
            data-editor-area={barra.id}
            data-editor-nome={barra.nome}
            aria-label={barra.nome}
            draggable={arraste}
            onDragStart={(evento) => {
              if (arraste) {
                evento.dataTransfer.setData('application/x-estacao-barra', barra.id);
                evento.dataTransfer.effectAllowed = 'move';
                const indicador = document.createElement('div');
                indicador.className = 'canvas-drag-ghost';
                indicador.textContent = `Movendo · ${barra.nome}`;
                document.body.append(indicador);
                evento.dataTransfer.setDragImage(indicador, 18, 18);
                requestAnimationFrame(() => indicador.remove());
                document.documentElement.dataset.appDragging = 'true';
              }
            }}
            onDragEnd={() => delete document.documentElement.dataset.appDragging}
          >
            <ControlesArea area={barra.id} nome={barra.nome} />
            <span className="workspace-bar-title">{barra.nome}</span>
            {barra.itens.map((bloco) => (
              <BlocoAtalho key={bloco.id} bloco={bloco} />
            ))}
          </nav>
        ))}
      <CriarBarraVisual posicao={posicao} />
    </>
  );
}
