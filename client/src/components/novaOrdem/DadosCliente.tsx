import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';
import { mascaraCpf, mascaraTelefone } from './auxiliares';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = Pick<
  EstadoFormulario,
  | 'carregando'
  | 'clienteAberto'
  | 'clienteBusca'
  | 'clienteChaves'
  | 'modoCliente'
  | 'clienteSecao'
  | 'concluido'
  | 'correspondencias'
  | 'cpf'
  | 'setClienteAberto'
  | 'setClienteBusca'
  | 'setClienteId'
  | 'setModoCliente'
  | 'setCpf'
  | 'setIndiceClienteDestacado'
  | 'setEmail'
  | 'setErro'
  | 'setNome'
  | 'setTelefone'
  | 'setCadastroClienteAberto'
  | 'indiceClienteDestacado'
  | 'email'
  | 'escolherCliente'
  | 'idCliente'
  | 'nome'
  | 'opcoes'
  | 'telefone'
  | 'cadastroClienteAberto'
>;

type EstadoFormulario = NonNullable<ReturnType<typeof useFormularioNovaOrdem>>;

export default function DadosCliente(props: Props) {
  const {
    carregando,
    clienteAberto,
    clienteBusca,
    clienteChaves,
    modoCliente,
    clienteSecao,
    concluido,
    correspondencias,
    cpf,
    setClienteAberto,
    setClienteBusca,
    setClienteId,
    setModoCliente,
    setCpf,
    setIndiceClienteDestacado,
    setEmail,
    setErro,
    setNome,
    setTelefone,
    setCadastroClienteAberto,
    indiceClienteDestacado,
    email,
    escolherCliente,
    idCliente,
    nome,
    opcoes,
    telefone,
    cadastroClienteAberto,
  } = props;
  return (
    <section className="os-create-card" ref={clienteSecao}>
      <div className="os-create-section-title">
        <span className="os-create-number">01</span>
        <div>
          <h3>Cliente</h3>
          <p>Quem é o proprietário da motocicleta?</p>
        </div>
        {concluido[0] && <Icone name="check" size={18} />}
      </div>
      <div className="os-create-switch">
        <button
          type="button"
          className={modoCliente === 'existing' && !cadastroClienteAberto ? 'active' : ''}
          onClick={() => {
            setCadastroClienteAberto(false);
            setModoCliente('existing');
            escolherCliente(null);
          }}
        >
          Buscar cliente
        </button>
        <button
          type="button"
          className={cadastroClienteAberto ? 'active' : ''}
          onClick={() => {
            setCadastroClienteAberto(true);
            setErro('');
          }}
        >
          Cadastrar novo
        </button>
      </div>
      {modoCliente === 'existing' ? (
        <>
          <div className="os-create-search-wrap">
            <label className="os-create-field">
              <span>
                Busque por nome ou telefone <b>*</b>
              </span>
              <span className="os-create-combobox">
                <Icone name="search" size={17} />
                <input
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={clienteAberto}
                  aria-controls="os-client-options"
                  aria-activedescendant={
                    clienteAberto && correspondencias[indiceClienteDestacado]
                      ? `os-client-${correspondencias[indiceClienteDestacado].id}`
                      : undefined
                  }
                  placeholder={
                    carregando ? 'Carregando clientes...' : 'Digite para encontrar um cliente'
                  }
                  value={clienteBusca}
                  onChange={(evento) => {
                    setClienteBusca(evento.target.value);
                    setClienteId(null);
                    setClienteAberto(true);
                    setIndiceClienteDestacado(0);
                  }}
                  onFocus={() => setClienteAberto(true)}
                  onBlur={() => window.setTimeout(() => setClienteAberto(false), 120)}
                  onKeyDown={clienteChaves}
                  disabled={carregando || !opcoes}
                />
              </span>
            </label>
            {clienteAberto && (
              <div className="os-create-options" id="os-client-options" role="listbox">
                {correspondencias.length ? (
                  correspondencias.map((cliente, indice) => (
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
                  ))
                ) : (
                  <p>Nenhum cliente encontrado. Use “Cadastrar novo”.</p>
                )}
              </div>
            )}
          </div>
          {idCliente && (
            <div className="os-create-selection">
              <span>
                <Icone name="check" size={15} />
              </span>
              <strong>{nome}</strong>
              <small>{telefone || 'Sem telefone'}</small>
            </div>
          )}
        </>
      ) : (
        <div className="os-create-fields">
          <label className="os-create-field">
            <span>
              Nome completo <b>*</b>
            </span>
            <input
              maxLength={100}
              value={nome}
              onChange={(eventoRecebido) => setNome(eventoRecebido.target.value)}
              placeholder="Nome do cliente"
            />
          </label>
          <div className="os-create-row">
            <label className="os-create-field">
              <span>
                WhatsApp <b>*</b>
              </span>
              <input
                inputMode="tel"
                value={telefone}
                onChange={(eventoRecebido) =>
                  setTelefone(mascaraTelefone(eventoRecebido.target.value))
                }
                placeholder="(11) 99999-9999"
              />
            </label>
            <label className="os-create-field">
              <span>CPF</span>
              <input
                inputMode="numeric"
                value={cpf}
                onChange={(eventoRecebido) => setCpf(mascaraCpf(eventoRecebido.target.value))}
                placeholder="000.000.000-00"
              />
            </label>
          </div>
          <label className="os-create-field">
            <span>E-mail</span>
            <input
              type="email"
              maxLength={150}
              value={email}
              onChange={(eventoRecebido) => setEmail(eventoRecebido.target.value)}
              placeholder="cliente@exemplo.com"
            />
          </label>
        </div>
      )}
    </section>
  );
}
