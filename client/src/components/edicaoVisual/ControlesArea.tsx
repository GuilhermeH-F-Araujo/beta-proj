import { Icone } from '../MenuAdmin';
import {
  encaixesLivres,
  useOrganizacaoInterface,
  useArrasteInterface,
  type PosicaoBarra,
} from '../../services/organizacaoInterface';
import {
  lerPreferenciasLeitura,
  lerOrganizacaoInterface,
} from '../../services/preferenciasGlobais';
import {
  inserirAtalhoVisual,
  selecionarAreaVisual,
  registrarEdicaoVisual,
  nomesEncaixes,
} from '../../services/edicaoVisual';
export function ControlesArea({ area, nome }: { area: string; nome: string }) {
  const ativo = useArrasteInterface();
  if (!ativo) return null;
  return (
    <div className="canvas-area-controls" data-editor-ui data-personalizador>
      <button
        type="button"
        aria-label={`Editar ${nome}`}
        onClick={(evento) => {
          const alvo = evento.currentTarget.closest<HTMLElement>('[data-editor-area]');
          if (alvo) selecionarAreaVisual(alvo);
        }}
      >
        <Icone name="grip" size={15} /> <span>{nome}</span>
      </button>
      {area !== 'menu' && (
        <button
          type="button"
          className="canvas-inline-plus"
          aria-label={`Adicionar atalho em ${nome}`}
          onClick={(evento) => inserirAtalhoVisual(area, evento.currentTarget)}
        >
          <Icone name="plus" size={16} />
        </button>
      )}
    </div>
  );
}
export function CriarBarraVisual({ posicao }: { posicao: PosicaoBarra }) {
  const ativo = useArrasteInterface();
  const organizacao = useOrganizacaoInterface(lerOrganizacaoInterface);
  if (!ativo || !encaixesLivres(organizacao).includes(posicao)) return null;
  return (
    <button
      type="button"
      data-editor-ui
      data-personalizador
      className={`canvas-new-bar canvas-new-${posicao}`}
      aria-label={`Criar barra em ${nomesEncaixes[posicao]}`}
      onClick={() => {
        const atual = lerPreferenciasLeitura();
        if (!encaixesLivres(atual.organizacao).includes(posicao)) return;
        registrarEdicaoVisual({
          ...atual,
          organizacao: {
            ...atual.organizacao,
            barras: [
              ...atual.organizacao.barras,
              {
                id: `barra-${crypto.randomUUID()}`,
                nome: `Atalhos ${atual.organizacao.barras.length + 1}`,
                posicao,
                itens: [],
              },
            ],
          },
        });
      }}
    >
      <Icone name="plus" size={16} /> <span>Barra · {nomesEncaixes[posicao]}</span>
    </button>
  );
}
