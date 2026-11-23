import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';
import ModalNovoUsuario from '../ModalNovoUsuario';
import { fotoEspacos } from './auxiliares';
import DadosAtendimento from './DadosAtendimento';
import DadosCliente from './DadosCliente';
import DadosMotocicleta from './DadosMotocicleta';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = NonNullable<ReturnType<typeof useFormularioNovaOrdem>>;

export default function FormularioNovaOrdem(props: Props) {
  const {
    anexar,
    anexarNovoCliente,
    anexarVarios,
    aoFechar,
    carregando,
    setFotos,
    setCadastroClienteAberto,
    erro,
    fotos,
    ocupado,
    opcoes,
    preparando,
    salvar,
    cadastroClienteAberto,
  } = props;
  return (
    <>
      {!cadastroClienteAberto && (
        <div
          className="os-create-overlay"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !ocupado) aoFechar();
          }}
        >
          <form
            className="os-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="os-create-title"
            onSubmit={(evento) => void salvar(evento)}
          >
            <header className="os-create-header">
              <span className="os-create-brand">
                <Icone name="clipboard" size={22} />
              </span>
              <div>
                <span className="os-create-overline">ESTAÇÃO MOTOS · ATENDIMENTO</span>
                <h2 id="os-create-title">Nova ordem de serviço</h2>
                <p>Registre a moto e o serviço em um só lugar.</p>
              </div>
              <button
                type="button"
                className="os-create-close"
                aria-label="Fechar"
                disabled={ocupado}
                onClick={aoFechar}
              >
                <Icone name="close" size={18} />
              </button>
            </header>
            <div className="os-create-body">
              <div className="os-create-column">
                <DadosCliente {...props} />
                <DadosMotocicleta {...props} />
              </div>
              <div className="os-create-column">
                <DadosAtendimento {...props} />
                <section
                  className="os-create-card os-create-photo-card"
                  onDragOver={(evento) => evento.preventDefault()}
                  onDrop={(evento) => {
                    evento.preventDefault();
                    void anexarVarios(evento.dataTransfer.files);
                  }}
                >
                  <div className="os-create-section-title">
                    <span className="os-create-number">
                      <Icone name="camera" size={18} />
                    </span>
                    <div>
                      <h3>Fotos da entrada</h3>
                      <p>Registre até quatro ângulos da moto. Opcional.</p>
                    </div>
                    <span className="os-create-photo-count">
                      {fotos.filter(Boolean).length} / 4
                    </span>
                  </div>
                  <label className="os-create-bulk">
                    <Icone name="plus" size={16} />
                    <span>
                      {preparando === -1 ? 'Preparando fotos…' : 'Adicionar até 4 fotos de uma vez'}
                    </span>
                    <small>ou arraste as imagens para esta área</small>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={ocupado || preparando !== null}
                      onChange={(evento) => {
                        if (evento.target.files) void anexarVarios(evento.target.files);
                        evento.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <div className="os-create-photo-grid">
                    {fotoEspacos.map((rotulo, indice) => (
                      <div
                        className={`os-create-photo${fotos[indice] ? ' has-image' : ''}`}
                        key={rotulo}
                      >
                        <label
                          onDragOver={(evento) => evento.preventDefault()}
                          onDrop={(evento) => {
                            evento.preventDefault();
                            evento.stopPropagation();
                            if (evento.dataTransfer.files.length > 1)
                              void anexarVarios(evento.dataTransfer.files);
                            else void anexar(indice, evento.dataTransfer.files[0]);
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            disabled={ocupado || preparando !== null}
                            onChange={(evento) => {
                              void anexar(indice, evento.target.files?.[0]);
                              evento.currentTarget.value = '';
                            }}
                          />
                          {fotos[indice] ? (
                            <img src={fotos[indice]!} alt={rotulo} />
                          ) : (
                            <>
                              <Icone name="plus" size={18} />
                              <strong>{rotulo}</strong>
                              <small>
                                {preparando === indice ? 'Preparando…' : 'Clique ou arraste'}
                              </small>
                            </>
                          )}
                        </label>
                        {fotos[indice] && (
                          <button
                            type="button"
                            aria-label={`Remover ${rotulo}`}
                            onClick={() =>
                              setFotos((anterior) =>
                                anterior.map((foto, indiceLocal) =>
                                  indiceLocal === indice ? null : foto,
                                ),
                              )
                            }
                          >
                            <Icone name="close" size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
            <footer className="os-create-footer">
              <div className="os-create-footer-copy">
                <span className="os-create-status-dot" />
                <span>
                  A OS será criada com status <strong>Aberta</strong>.
                </span>
              </div>
              {erro && (
                <p role="alert" className="os-create-error">
                  {erro}
                </p>
              )}
              <button
                type="button"
                className="os-create-cancel"
                disabled={ocupado}
                onClick={aoFechar}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="os-create-save"
                disabled={ocupado || carregando || !opcoes || preparando !== null}
              >
                <Icone name="plus" size={16} />
                {ocupado ? 'Abrindo OS…' : 'Abrir ordem de serviço'}
              </button>
            </footer>
          </form>
        </div>
      )}
      {cadastroClienteAberto && (
        <ModalNovoUsuario
          initialRole="Cliente"
          replaceBackground
          onClose={() => setCadastroClienteAberto(false)}
          onCreated={anexarNovoCliente}
        />
      )}
    </>
  );
}
