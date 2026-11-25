import { useFocoModal } from '../../hooks/useFocoModal';
import { Icone } from '../MenuAdmin';
import type { useFormularioNovaOrdem } from '../ModalNovaOrdem';
import ModalEditarMotocicleta from '../ModalEditarMotocicleta';
import ModalNovoUsuario from '../ModalNovoUsuario';
import { angulosObrigatorios, IlustracaoAngulo } from './AnguloMoto';
import DadosAtendimento from './DadosAtendimento';
import DadosCliente from './DadosCliente';
import ServicosPrevistos from './ServicosPrevistos';

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
    fotosSecao,
    ocupado,
    opcoes,
    preparando,
    prontoParaEnviar,
    atualizarCatalogoOS,
    previsaoCalculada,
    previsaoManual,
    ajustandoPrevisao,
    setAjustandoPrevisao,
    servicosSelecionados,
    selecionarServico,
    removerServico,
    setDataPrevisao,
    salvar,
    cadastroClienteAberto,
    cadastroMotocicletaAberto,
    setCadastroMotocicletaAberto,
    anexarNovaMotocicleta,
    idCliente,
  } = props;
  const referenciaFoco = useFocoModal<HTMLFormElement>(
    !cadastroClienteAberto && !cadastroMotocicletaAberto,
  );

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
            ref={referenciaFoco}
            tabIndex={-1}
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
                <p>Registre a entrada, os serviços e a previsão de entrega.</p>
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
                <DadosAtendimento {...props} />
              </div>
              <div className="os-create-column">
                <ServicosPrevistos
                  opcoes={opcoes}
                  selecionados={servicosSelecionados}
                  aoSelecionar={selecionarServico}
                  aoRemover={removerServico}
                  aoAtualizarCatalogo={atualizarCatalogoOS}
                  previsaoCalculada={previsaoCalculada}
                  previsaoManual={previsaoManual}
                  setPrevisaoManual={setDataPrevisao}
                  ajustandoPrevisao={ajustandoPrevisao}
                  setAjustandoPrevisao={setAjustandoPrevisao}
                  ocupada={ocupado}
                />
                <section
                  className="os-create-card os-create-photo-card"
                  ref={fotosSecao}
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
                      <h3>
                        Fotos da entrada <b>*</b>
                      </h3>
                      <p>Quatro posições obrigatórias. Você pode acrescentar mais quatro.</p>
                    </div>
                    <span className="os-create-photo-count os-create-photo-count-required">
                      {fotos.slice(0, 4).filter(Boolean).length}/4 obrigatórias
                      <i /> {fotos.filter(Boolean).length}/8 fotos
                    </span>
                  </div>
                  <label className="os-create-bulk">
                    <Icone name="plus" size={16} />
                    <span>
                      {preparando === -1 ? 'Preparando fotos…' : 'Adicionar fotos em sequência'}
                    </span>
                    <small>
                      Selecione na ordem dos quadros: frente, esquerda, traseira, direita
                    </small>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={ocupado || preparando !== null || fotos.every(Boolean)}
                      onChange={(evento) => {
                        if (evento.target.files) void anexarVarios(evento.target.files);
                        evento.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <div className="os-create-photo-grid">
                    {angulosObrigatorios.map(({ id, nome }, indice) => (
                      <div
                        className={`os-create-photo os-create-photo-required${fotos[indice] ? ' has-image' : ''}`}
                        key={id}
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
                            aria-label={`${nome}: ${fotos[indice] ? 'substituir' : 'adicionar'} foto obrigatória`}
                            accept="image/*"
                            disabled={ocupado || preparando !== null}
                            onChange={(evento) => {
                              void anexar(indice, evento.target.files?.[0]);
                              evento.currentTarget.value = '';
                            }}
                          />
                          {fotos[indice] ? (
                            <img src={fotos[indice]!} alt={`Foto da motocicleta: ${nome}`} />
                          ) : (
                            <>
                              <strong>
                                {nome} <b>*</b>
                              </strong>
                              <IlustracaoAngulo angulo={id} />
                              <small>
                                {preparando === indice ? (
                                  'Preparando…'
                                ) : (
                                  <>
                                    <Icone name="camera" size={12} />
                                    Adicionar foto
                                  </>
                                )}
                              </small>
                            </>
                          )}
                        </label>
                        {fotos[indice] && (
                          <button
                            type="button"
                            aria-label={`Remover foto: ${nome}`}
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
                  {fotos.slice(4).some(Boolean) && (
                    <div className="os-create-photo-grid os-create-extra-photo-grid">
                      {fotos.slice(4).map((foto, indiceExtra) => {
                        if (!foto) return null;
                        const indice = indiceExtra + 4;
                        return (
                          <div className="os-create-photo has-image" key={`extra-${indice}`}>
                            <label>
                              <input
                                type="file"
                                accept="image/*"
                                disabled={ocupado || preparando !== null}
                                aria-label={`Substituir foto extra ${indiceExtra + 1}`}
                                onChange={(evento) => {
                                  void anexar(indice, evento.target.files?.[0]);
                                  evento.currentTarget.value = '';
                                }}
                              />
                              <img src={foto} alt={`Foto extra ${indiceExtra + 1}`} />
                            </label>
                            <button
                              type="button"
                              aria-label={`Remover foto extra ${indiceExtra + 1}`}
                              onClick={() =>
                                setFotos((atuais) =>
                                  atuais.map((item, itemIndice) =>
                                    itemIndice === indice ? null : item,
                                  ),
                                )
                              }
                            >
                              <Icone name="close" size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <label
                    className={`os-create-bulk os-create-add-extras${fotos.slice(0, 4).some((foto) => !foto) ? ' is-disabled' : ''}`}
                    aria-disabled={fotos.slice(0, 4).some((foto) => !foto)}
                  >
                    <Icone name="plus" size={16} />
                    <span>Adicionar fotos extras</span>
                    <small>
                      {fotos.slice(0, 4).some((foto) => !foto)
                        ? 'Libera depois de preencher as quatro posições'
                        : `Opcional · até ${Math.max(0, 4 - fotos.slice(4).filter(Boolean).length)} extras`}
                    </small>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={
                        ocupado ||
                        preparando !== null ||
                        fotos.slice(0, 4).some((foto) => !foto) ||
                        fotos.slice(4).every(Boolean)
                      }
                      onChange={(evento) => {
                        if (evento.target.files) void anexarVarios(evento.target.files);
                        evento.currentTarget.value = '';
                      }}
                    />
                  </label>
                </section>
              </div>
            </div>
            <footer className="os-create-footer">
              <div className="os-create-footer-copy">
                <span className="os-create-status-dot" />
                <span>
                  {fotos.slice(0, 4).some((foto) => !foto)
                    ? `Faltam ${fotos.slice(0, 4).filter((foto) => !foto).length} foto(s) obrigatória(s).`
                    : servicosSelecionados.length
                      ? `A OS será criada com status Aberta · ${servicosSelecionados.length} serviço(s).`
                      : 'Selecione os serviços previstos para a OS.'}
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
                disabled={ocupado || carregando || !opcoes || !prontoParaEnviar}
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
          fixedRole="Cliente"
          replaceBackground
          onClose={() => setCadastroClienteAberto(false)}
          onCreated={anexarNovoCliente}
        />
      )}
      {cadastroMotocicletaAberto && (
        <ModalEditarMotocicleta
          item={null}
          initialClientId={idCliente ?? undefined}
          fixedClient
          clients={(opcoes?.clients ?? []).map(({ id, name }) => ({ id, name }))}
          onClose={() => setCadastroMotocicletaAberto(false)}
          onSaved={(id) => void anexarNovaMotocicleta(id)}
          onImage={() => undefined}
        />
      )}
    </>
  );
}
