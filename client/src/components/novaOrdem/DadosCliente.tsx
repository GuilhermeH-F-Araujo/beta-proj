import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';
import DadosMotocicleta from './DadosMotocicleta';

type EstadoFormulario = NonNullable<ReturnType<typeof useFormularioNovaOrdem>>;
type Props = Pick<
  EstadoFormulario,
  | 'carregando'
  | 'clienteAberto'
  | 'clienteBusca'
  | 'clienteDoPerfil'
  | 'clienteChaves'
  | 'clienteSecao'
  | 'concluido'
  | 'correspondencias'
  | 'setClienteAberto'
  | 'setClienteBusca'
  | 'setClienteId'
  | 'setIndiceClienteDestacado'
  | 'setCadastroClienteAberto'
  | 'setErro'
  | 'indiceClienteDestacado'
  | 'escolherCliente'
  | 'idCliente'
  | 'opcoes'
  | 'idMotocicleta'
  | 'motocicletaSecao'
  | 'motosCliente'
  | 'quilometragem'
  | 'setQuilometragem'
  | 'escolherMoto'
  | 'onCriarMotocicleta'
>;

export default function DadosCliente(props: Props) {
  const {
    carregando,
    clienteAberto,
    clienteBusca,
    clienteDoPerfil,
    clienteChaves,
    clienteSecao,
    concluido,
    correspondencias,
    setClienteAberto,
    setClienteBusca,
    setClienteId,
    setIndiceClienteDestacado,
    setCadastroClienteAberto,
    setErro,
    indiceClienteDestacado,
    escolherCliente,
    idCliente,
    opcoes,
  } = props;
  return (
    <section className="os-create-card os-create-personal-card">
      <div className="os-create-section-title">
        <span className="os-create-number">
          <Icone name="users" size={17} />
        </span>
        <div>
          <h3>Cliente e motocicleta</h3>
          <p>Selecione o proprietário e a moto deste atendimento.</p>
        </div>
        {concluido[0] && concluido[1] && <Icone name="check" size={18} />}
      </div>

      <section className="os-create-search-wrap" ref={clienteSecao}>
        {clienteDoPerfil !== undefined ? (
          <label className="os-create-field">
            <span>Cliente</span>
            <input value={clienteDoPerfil} readOnly />
          </label>
        ) : (
          <label className="os-create-field">
            <span>
              Cliente <b>*</b>
            </span>
            <span className="os-create-combobox os-create-client-combobox">
              <Icone name="search" size={17} />
              <input
                role="combobox"
                aria-label="Buscar cliente por nome ou telefone"
                aria-autocomplete="list"
                aria-expanded={clienteAberto}
                aria-controls="os-client-options"
                aria-activedescendant={
                  clienteAberto
                    ? indiceClienteDestacado === correspondencias.length
                      ? 'os-client-create'
                      : correspondencias[indiceClienteDestacado]
                        ? `os-client-${correspondencias[indiceClienteDestacado].id}`
                        : undefined
                    : undefined
                }
                placeholder={carregando ? 'Carregando clientes…' : 'Nome ou telefone do cliente'}
                value={clienteBusca}
                disabled={carregando || !opcoes}
                onChange={(evento) => {
                  setClienteBusca(evento.target.value);
                  setClienteId(null);
                  setClienteAberto(true);
                  setIndiceClienteDestacado(0);
                }}
                onFocus={() => setClienteAberto(true)}
                onBlur={() => window.setTimeout(() => setClienteAberto(false), 120)}
                onKeyDown={clienteChaves}
              />
              <span className={`os-create-client-state${idCliente ? ' is-selected' : ''}`}>
                <Icone name={idCliente ? 'check' : 'chevron'} size={16} />
              </span>
            </span>
          </label>
        )}
        {clienteAberto && (
          <div className="os-create-options" id="os-client-options" role="listbox">
            {correspondencias.map((cliente, indice) => (
              <button
                type="button"
                role="option"
                aria-selected={idCliente === cliente.id}
                id={`os-client-${cliente.id}`}
                className={indiceClienteDestacado === indice ? 'highlighted' : ''}
                key={cliente.id}
                onMouseDown={(evento) => {
                  evento.preventDefault();
                  escolherCliente(cliente.id);
                }}
              >
                <span className="os-create-option-avatar">{cliente.name.charAt(0)}</span>
                <span>
                  <strong>{cliente.name}</strong>
                  <small>{cliente.phone || 'Telefone não informado'}</small>
                </span>
              </button>
            ))}
            {!correspondencias.length && <p>Nenhum cliente corresponde à busca.</p>}
            <button
              type="button"
              role="option"
              aria-selected={false}
              id="os-client-create"
              className={`os-create-option-create${indiceClienteDestacado === correspondencias.length ? ' highlighted' : ''}`}
              onMouseDown={(evento) => {
                evento.preventDefault();
                setClienteAberto(false);
                setErro('');
                setCadastroClienteAberto(true);
              }}
            >
              <span className="os-create-option-avatar">
                <Icone name="plus" size={15} />
              </span>
              <span>
                <strong>Criar usuário</strong>
                <small>Adicionar um cliente novo à oficina</small>
              </span>
            </button>
          </div>
        )}
      </section>

      <DadosMotocicleta {...props} />
    </section>
  );
}
