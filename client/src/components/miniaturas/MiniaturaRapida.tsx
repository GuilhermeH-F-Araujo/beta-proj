import { useEffect, useState } from 'react';
import { useEstadoRascunho } from '../../hooks/useEstadoRascunho';
import { useDadosVivos } from '../../hooks/useDadosVivos';
import {
  buscarPedidoMiniatura,
  requisitarMiniaturas,
  type PedidoMiniatura,
} from '../../services/centralMiniaturas';
import { Icone } from '../MenuAdmin';
import EstudioMiniatura from './EstudioMiniatura';

type Props = {
  modeloInicial?: string;
  motoId?: number;
  pedidoId?: string;
  aoPublicar?: () => void;
};
export default function MiniaturaRapida({
  modeloInicial = '',
  motoId,
  pedidoId,
  aoPublicar,
}: Props) {
  const escopo = `miniatura-rapida-${pedidoId || motoId || modeloInicial || 'nova'}`;
  const [modelo, setModelo] = useEstadoRascunho(escopo, 'modelo', modeloInicial);
  const [idSalvo, setIdSalvo] = useEstadoRascunho<string | null>(escopo, 'pedido', null);
  const [pedido, setPedido] = useState<PedidoMiniatura | null>(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ajustes, setAjustes] = useState(false);
  const [ignorarInicial, setIgnorarInicial] = useState(false);
  const id = idSalvo || (ignorarInicial ? null : pedidoId);
  const carregar = async (alvo = id) => {
    if (alvo) setPedido(await buscarPedidoMiniatura(alvo));
  };
  useEffect(() => {
    if (!id) {
      setPedido(null);
      return;
    }
    let ativo = true;
    const atualizar = () => {
      if (document.visibilityState === 'hidden') return;
      buscarPedidoMiniatura(id)
        .then((dados) => {
          if (ativo) setPedido(dados);
        })
        .catch((falha) => {
          if (ativo) setErro(falha.message);
        });
    };
    atualizar();
    return () => {
      ativo = false;
    };
  }, [id]);
  useDadosVivos(async (valido) => {
    if (!id || document.visibilityState === 'hidden') return;
    try {
      const dados = await buscarPedidoMiniatura(id);
      if (valido()) setPedido(dados);
    } catch (falha) {
      if (valido()) setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar.');
    }
  }, Boolean(id), id ?? '');
  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      await acao();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };
  const salvar = async () => {
    if (id) return id;
    const resultado = await requisitarMiniaturas<{ id: string }>('/api/admin/miniaturas', 'POST', {
      modelo,
      modo: 'referencia',
    });
    setIdSalvo(resultado.id);
    return resultado.id;
  };
  const gerar = () =>
    executar(async () => {
      const alvo = await salvar();
      await requisitarMiniaturas(`/api/admin/miniaturas/${alvo}/gerar`, 'POST', {});
      await carregar(alvo);
      setAviso('A IA está cuidando disso. Você pode continuar trabalhando.');
    });
  const emPreparo = pedido && ['pendente', 'processando'].includes(pedido.status);
  useEffect(() => {
    if (pedido && !['pendente', 'processando'].includes(pedido.status)) setAviso('');
  }, [pedido?.status]);
  const podeGerar =
    !pedido || ['rascunho', 'informacao', 'falhou', 'revisao'].includes(pedido.status);
  return (
    <div className="mini-quick">
      <section className="mini-card mini-quick-form">
        <span className="mini-eyebrow">A IA FAZ A PESQUISA POR VOCÊ</span>
        <h2>Qual é o modelo da moto?</h2>
        <p>
          Digite a marca e o modelo. A busca das fotos e a preparação da miniatura ficam com o
          sistema.
        </p>
        <label>
          Marca e modelo
          <input
            value={pedido?.catalogo.modelo || modelo}
            onChange={(e) => {
              setModelo(e.target.value);
              if (id) {
                setIdSalvo(null);
                setIgnorarInicial(true);
                setPedido(null);
                setAjustes(false);
                setErro('');
                setAviso('');
              }
            }}
            disabled={!!emPreparo || ocupado}
            maxLength={100}
            placeholder="Ex.: Honda CG 150 Titan"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && podeGerar && modelo.trim().length >= 3) void gerar();
            }}
          />
        </label>
        <button
          type="button"
          className="mini-primary"
          disabled={
            ocupado ||
            !podeGerar ||
            (!id && modelo.trim().length < 3) ||
            (pedido?.tentativas || 0) >= 6
          }
          onClick={() => void gerar()}
        >
          <Icone name="plus" size={19} />
          {ocupado ? 'Preparando…' : pedido?.imagem ? 'Tentar outra opção' : 'Gerar miniatura'}
        </button>
        <p className="mini-help">
          Foto e observação são opcionais. A IA procura referências e corrige o enquadramento
          automaticamente.
        </p>
        {id && (
          <button
            type="button"
            className="mini-link"
            onClick={() => {
              setIdSalvo(null);
              setIgnorarInicial(true);
              setPedido(null);
              setModelo('');
              setAjustes(false);
            }}
          >
            Gerar outro modelo
          </button>
        )}
      </section>
      <section className="mini-card mini-quick-result">
        {emPreparo ? (
          <div className="mini-quick-progress" role="status">
            <span className="mini-working" />
            <h2>
              {pedido.status === 'pendente'
                ? 'Sua moto está na fila'
                : pedido.pesquisa?.etapa === 'gerando'
                  ? 'Gerando sua miniatura'
                  : pedido.pesquisa?.etapa === 'conferindo'
                    ? 'Conferindo a miniatura'
                    : 'Pesquisando o modelo na internet'}
            </h2>
            <p>
              Buscando referências, gerando e conferindo a imagem. Não precisa deixar esta tela
              aberta.
            </p>
            {pedido.erro && <p>{pedido.erro}</p>}
          </div>
        ) : pedido?.imagem ? (
          <>
            <img
              className="mini-quick-bike"
              src={pedido.imagem}
              alt={`Miniatura de ${pedido.catalogo.modelo}`}
            />
            <div className="mini-inline">
              <h2>{pedido.status === 'aprovada' ? 'Miniatura aprovada' : 'É esta a moto?'}</h2>
              <span className="mini-help">Frente para a direita →</span>
            </div>
            {pedido.verificacao?.problemas?.length ? (
              <p className="mini-help">{pedido.verificacao.problemas.join(' ')}</p>
            ) : null}
            {pedido.status === 'revisao' && (
              <>
                <p>Se a moto está correta, aprove para atualizar o modelo nos outros percursos.</p>
                <button
                  type="button"
                  className="mini-primary mini-approve"
                  disabled={ocupado}
                  onClick={() =>
                    executar(async () => {
                      await requisitarMiniaturas(`/api/admin/miniaturas/${id}/aprovar`, 'POST', {
                        revisao: pedido.catalogo.revisao,
                        confirmouIdentidade: true,
                        confirmouDireita: true,
                        confirmouInteira: true,
                        confirmouUso: true,
                      });
                      await carregar();
                      window.dispatchEvent(new Event('miniaturas-publicadas'));
                      aoPublicar?.();
                      setAviso('Pronto! Miniatura aprovada e compartilhada com os percursos.');
                    })
                  }
                >
                  <Icone name="check" size={20} />
                  Aprovar esta miniatura
                </button>
                <p className="mini-help">
                  Ao aprovar, você confirma que o modelo está correto, inteiro e com a frente para a
                  direita.
                </p>
              </>
            )}
          </>
        ) : (
          <div className="mini-placeholder">
            <Icone name="bike" size={80} />
            <h2>
              {pedido?.status === 'informacao'
                ? 'Não foi possível confirmar o modelo'
                : 'Sua miniatura vai aparecer aqui'}
            </h2>
            <p>
              {pedido?.erro ||
                'Uma imagem padronizada, com a moto inteira e a frente para a direita.'}
            </p>
          </div>
        )}
      </section>
      {erro && (
        <p role="alert" className="mini-feedback error">
          {erro}
        </p>
      )}
      {aviso && emPreparo && (
        <p role="status" className="mini-feedback success">
          {aviso}
        </p>
      )}
      <section className="mini-quick-extra">
        <button
          type="button"
          className="mini-link"
          disabled={ocupado || (!id && modelo.trim().length < 3)}
          aria-expanded={ajustes}
          onClick={() =>
            executar(async () => {
              if (!ajustes) await salvar();
              setAjustes(!ajustes);
            })
          }
        >
          Adicionar foto, observação ou ver mais opções · opcional
        </button>
        {ajustes && id && (
          <EstudioMiniatura
            modeloInicial={pedido?.catalogo.modelo || modelo}
            motoId={motoId}
            pedidoId={id}
            aoPublicar={aoPublicar}
          />
        )}
      </section>
    </div>
  );
}
