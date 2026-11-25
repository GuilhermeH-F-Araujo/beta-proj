import IconeCadastro from '../IconeCadastro';
import { createPortal } from 'react-dom';
import { CadastroCatalogoOS } from '../../pages/Servicos';
import { pode } from '../../services/acessoConta';
import { useEffect, useMemo, useState } from 'react';
import { Icone } from '../MenuAdmin';
import type { OpcoesNovaOrdem } from '../../services/api/ordens';
import { correspondeBusca, textoDeBusca } from '../../utils/buscaAproximada';

type Props = {
  opcoes: OpcoesNovaOrdem | null;
  selecionados: string[];
  aoSelecionar: (id: string) => void;
  aoRemover: (id: string) => void;
  aoAtualizarCatalogo: (id?: string) => Promise<void>;
  previsaoCalculada: string | null;
  previsaoManual: string;
  setPrevisaoManual: (valor: string) => void;
  ajustandoPrevisao: boolean;
  setAjustandoPrevisao: (valor: boolean) => void;
  ocupada: boolean;
};

function formatarData(valor: string | null) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

export default function ServicosPrevistos(props: Props) {
  const {
    opcoes,
    selecionados,
    aoSelecionar,
    aoRemover,
    aoAtualizarCatalogo,
    previsaoCalculada,
    previsaoManual,
    setPrevisaoManual,
    ajustandoPrevisao,
    setAjustandoPrevisao,
    ocupada,
  } = props;
  const [busca, setBusca] = useState('');
  const [categoriaAberta, setCategoriaAberta] = useState(false);
  const [erroCatalogo, setErroCatalogo] = useState('');
  const itens = opcoes?.services ?? [];
  const categorias = opcoes?.serviceCategories ?? [];
  const encontrados = useMemo(
    () =>
      itens
        .filter((item) => {
          const categoriaDoServico =
            categorias.find((categoriaItem) => categoriaItem.id === item.categoryId)?.name ?? '';
          return correspondeBusca(busca, `${item.name} ${categoriaDoServico}`);
        })
        .filter((item) => !selecionados.includes(item.id)),
    [itens, categorias, busca, selecionados],
  );
  const selecionadosCatalogo = selecionados
    .map((id) => itens.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => !!item);
  const previsao = formatarData(previsaoManual || previsaoCalculada);
  useEffect(() => {
    const atualizar = () => {
      if (document.visibilityState === 'visible') void aoAtualizarCatalogo().catch(() => {});
    };
    document.addEventListener('visibilitychange', atualizar);
    return () => document.removeEventListener('visibilitychange', atualizar);
  }, [aoAtualizarCatalogo]);

  return (
    <section className="os-create-card os-create-services-card" aria-labelledby="os-services-title">
      <div className="os-create-section-title">
        <span className="os-create-number">
          <Icone name="settings" size={17} />
        </span>
        <div>
          <h3 id="os-services-title">
            Serviços previstos <b>*</b>
          </h3>
          <p>Escolha os serviços para calcular a previsão de entrega.</p>
        </div>
        {selecionados.length > 0 && (
          <span className="os-create-service-total">
            {selecionados.length} selecionado{selecionados.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="os-create-service-search-row">
        <label className="os-create-combobox os-create-service-search">
          <Icone name="search" size={15} />
          <input
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={!!busca.trim() && encontrados.length > 0}
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar no catálogo de serviços"
            aria-label="Buscar serviço no catálogo"
            autoComplete="off"
            disabled={!opcoes || ocupada}
          />
        </label>
        <div className="os-create-service-actions">
          {pode('servicos', 'criar') && (
            <a
              className="os-create-service-add"
              href="/servicos?acao=novo"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Novo serviço (abre em outra aba)"
            >
              <IconeCadastro tipo="servico" /> Novo serviço
            </a>
          )}
          {pode('servicos', 'editar') && (
            <button
              type="button"
              className="os-create-service-add"
              disabled={ocupada}
              onClick={() => setCategoriaAberta(true)}
            >
              <IconeCadastro tipo="categoria" /> Nova categoria
            </button>
          )}
        </div>
      </div>

      {busca.trim() && encontrados.length > 0 && (
        <div className="os-create-service-results" role="listbox" aria-label="Serviços encontrados">
          {encontrados.map((item) => (
            <button
              type="button"
              role="option"
              key={item.id}
              onClick={() => {
                aoSelecionar(item.id);
                setBusca('');
              }}
            >
              <span>
                <strong>{item.name}</strong>
                <small>{item.duration || 'Duração não cadastrada'}</small>
              </span>
              <Icone name="plus" size={16} />
            </button>
          ))}
        </div>
      )}
      {busca.trim() &&
        !encontrados.length &&
        !selecionadosCatalogo.some((item) => textoDeBusca(item.name) === textoDeBusca(busca)) && (
          <p className="os-create-service-empty">
            Não encontrei esse serviço. Cadastre para usar nesta e nas próximas OS.
          </p>
        )}

      {categoriaAberta &&
        createPortal(
          <div
            className="os-catalog-layer"
            onKeyDown={(evento) => {
              if (evento.key === 'Escape') evento.stopPropagation();
            }}
            onSubmit={(evento) => evento.stopPropagation()}
          >
            <CadastroCatalogoOS
              aoFechar={() => setCategoriaAberta(false)}
              aoSalvar={() => {
                setCategoriaAberta(false);
                setErroCatalogo('');
                void aoAtualizarCatalogo().catch(() =>
                  setErroCatalogo(
                    'Cadastro salvo. Não foi possível atualizar a lista de serviços.',
                  ),
                );
              }}
            />
          </div>,
          document.body,
        )}
      {erroCatalogo && <p role="alert">{erroCatalogo}</p>}

      <div className="os-create-service-selected">
        {selecionadosCatalogo.map((item) => (
          <div className="os-create-service-item" key={item.id}>
            <img
              className="os-create-service-check"
              src="/assets/nova-os/servico-confirmado.svg"
              alt=""
            />
            <strong>{item.name}</strong>
            <span className="os-create-service-duration">
              <Icone name="clock" size={13} />
              {item.duration || 'Duração pendente'}
            </span>
            <span className="os-create-service-price">
              R$ {item.price.toFixed(2).replace('.', ',')}
            </span>
            <button
              type="button"
              aria-label={`Remover ${item.name}`}
              onClick={() => aoRemover(item.id)}
              disabled={ocupada}
            >
              <Icone name="close" size={15} />
            </button>
          </div>
        ))}
        {!selecionadosCatalogo.length && !busca.trim() && (
          <p className="os-create-service-empty">
            Pesquise no catálogo e selecione pelo menos um serviço.
          </p>
        )}
      </div>

      <div className="os-create-forecast">
        <span className="os-create-forecast-icon">
          <Icone name="calendar" size={19} />
        </span>
        <div className="os-create-forecast-copy">
          <strong>
            Previsão de entrega <span>{previsaoManual ? 'Ajustada nesta OS' : 'Automática'}</span>
          </strong>
          <b>{previsao ?? 'Escolha serviços com duração cadastrada'}</b>
          <small>
            {previsaoManual
              ? 'A alteração vale somente para esta ordem.'
              : 'Calculada pela entrada e pela duração total dos serviços.'}
          </small>
        </div>
        <button
          type="button"
          className="os-create-forecast-edit"
          onClick={() => {
            if (ajustandoPrevisao || previsaoManual) {
              setAjustandoPrevisao(false);
              setPrevisaoManual('');
            } else {
              setAjustandoPrevisao(true);
              setPrevisaoManual(previsaoCalculada ?? '');
            }
          }}
          disabled={ocupada}
        >
          <Icone name={ajustandoPrevisao || previsaoManual ? 'undo' : 'pencil'} size={14} />
          {ajustandoPrevisao || previsaoManual ? 'Usar automática' : 'Ajustar só nesta OS'}
        </button>
      </div>
      {(ajustandoPrevisao || previsaoManual !== '') && (
        <label className="os-create-field os-create-manual-forecast">
          <span>Previsão exclusiva desta OS</span>
          <input
            type="datetime-local"
            value={previsaoManual}
            onChange={(evento) => setPrevisaoManual(evento.target.value)}
          />
        </label>
      )}
    </section>
  );
}
