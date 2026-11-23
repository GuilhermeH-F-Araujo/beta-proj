import { createPortal } from 'react-dom';
import LogoEstacao from '../LogoEstacao';
import { Icone } from '../MenuAdmin';
import type { useEdicaoMotocicleta } from '../ModalEditarMotocicleta';
import { BandeiraBrasil, cores, MarcaMark } from './auxiliares';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = NonNullable<ReturnType<typeof useEdicaoMotocicleta>>;

export default function FormularioEdicaoMotocicleta(props: Props) {
  const {
    additionalAberto,
    alterado,
    ano,
    aoFechar,
    aoImagem,
    ativo,
    atualizar,
    chassis,
    confirmarDescarte,
    cor,
    setAdditionalAberto,
    setAno,
    setAtivo,
    setChassis,
    setClienteId,
    setConfirmarDiscard,
    setCor,
    setErro,
    setMarca,
    setMarcaAberto,
    setModelo,
    setModeloAberto,
    setModeloAno,
    setObservacoes,
    setPendenteSalvar,
    setPlaca,
    setQuilometragem,
    setRenavam,
    setResponsavelAberto,
    setResponsavelBusca,
    displayModelo,
    displayResponsavel,
    erro,
    escolherMarca,
    escolherModelo,
    idCliente,
    item,
    marca,
    marcaAberto,
    marcaCorrespondencias,
    marcaReferencia,
    miniatura,
    modelo,
    modeloAberto,
    modeloAno,
    modeloCorrespondencias,
    modeloReferencia,
    observacoes,
    ocupado,
    pendenteSalvar,
    persistir,
    placa,
    quilometragem,
    renavam,
    responsavelAberto,
    responsavelBusca,
    responsavelCorrespondencias,
    responsavelReferencia,
    salvar,
    selecionadoMarca,
    solicitacaoFechar,
  } = props;
  return createPortal(
    <div
      className="bike-edit-overlay"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) solicitacaoFechar();
      }}
    >
      <form
        className="bike-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bike-edit-title"
        onSubmit={(evento) => void salvar(evento)}
      >
        <div className="bike-edit-body">
          <header className="bike-edit-header">
            <div className="bike-edit-header-row">
              <div className="bike-edit-logo">
                <LogoEstacao />
              </div>
              <span className="bike-edit-breadcrumb">
                MOTOCICLETAS <span>/</span> {item ? 'EDITAR REGISTRO' : 'NOVO REGISTRO'}
              </span>
              <button
                type="button"
                onClick={solicitacaoFechar}
                aria-label="Fechar"
                disabled={ocupado}
              >
                <Icone name="close" size={20} />
              </button>
            </div>
            <h2 id="bike-edit-title">{item ? 'Editar motocicleta' : 'Nova motocicleta'}</h2>
            <p>Identifique a moto e vincule o proprietário.</p>
          </header>
          <div className="bike-edit-passport" aria-label="Prévia da motocicleta">
            <svg
              className="bike-edit-passport-stripes"
              viewBox="0 0 140 164"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d="M0 164 74 0h40L40 164Z" fill="#fff" opacity=".32" />
              <path d="M0 117 52 0h15L15 117Z" fill="#fff" opacity=".78" />
              <path d="M17 97 60 0h13L30 97Z" fill="#D71A35" />
              <path d="M41 164 111 0h2L43 164Z" fill="#fff" opacity=".9" />
              <path d="M60 164 130 0h2L62 164Z" fill="#fff" opacity=".75" />
              <path d="M80 164 140 23v7L86 164Z" fill="#fff" opacity=".56" />
            </svg>
            <div className="bike-edit-passport-art">
              <img
                className={miniatura ? 'is-thumbnail' : 'is-fallback'}
                src={miniatura || '/assets/motocicleta-sem-miniatura.png'}
                alt={
                  miniatura
                    ? `Miniatura de ${displayModelo}`
                    : 'Ilustração cinza de motocicleta sem miniatura'
                }
              />
            </div>
            <div className="bike-edit-passport-plate">
              <div>
                <span className="bike-edit-plate-seal" aria-hidden="true">
                  ✦
                </span>
                <span>BRASIL</span>
                <BandeiraBrasil />
              </div>
              <strong>{placa || 'PLACA'}</strong>
              <small>{placa ? 'IDENTIFICAÇÃO' : '— — —'}</small>
            </div>
            <div className="bike-edit-passport-summary">
              <div>
                <Icone name="bike" size={21} />
                <span>
                  <strong>{displayModelo || 'Modelo ainda não informado'}</strong>
                  <small>Marca e modelo</small>
                </span>
              </div>
              <div>
                <Icone name="user" size={20} />
                <span>
                  <strong>{displayResponsavel}</strong>
                  <small>Proprietário</small>
                </span>
              </div>
            </div>
          </div>
          <div className="bike-edit-fields">
            <div className="bike-edit-field bike-edit-owner" ref={responsavelReferencia}>
              <label htmlFor="bike-owner">
                Proprietário <b>*</b>
              </label>
              <div className="bike-edit-input-wrap">
                <Icone name="user" size={18} />
                <input
                  id="bike-owner"
                  required
                  type="text"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={responsavelAberto}
                  aria-controls="bike-owner-options"
                  aria-autocomplete="list"
                  disabled={ocupado || !!item?.orderCount}
                  value={responsavelBusca}
                  placeholder="Digite o nome do cliente ou selecione"
                  onFocus={() => setResponsavelAberto(true)}
                  onChange={(evento) =>
                    atualizar(() => {
                      setResponsavelBusca(evento.target.value);
                      setClienteId(0);
                      setResponsavelAberto(true);
                    })
                  }
                  onKeyDown={(evento) => {
                    if (evento.key === 'Escape') setResponsavelAberto(false);
                    if (
                      evento.key === 'Enter' &&
                      responsavelAberto &&
                      responsavelCorrespondencias[0]
                    ) {
                      evento.preventDefault();
                      const escolha = responsavelCorrespondencias[0];
                      atualizar(() => {
                        setClienteId(escolha.id);
                        setResponsavelBusca(escolha.name);
                        setResponsavelAberto(false);
                      });
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Mostrar clientes"
                  disabled={ocupado || !!item?.orderCount}
                  onClick={() => setResponsavelAberto((aberto) => !aberto)}
                >
                  <Icone name="chevron" size={15} />
                </button>
              </div>
              {responsavelAberto && !item?.orderCount && (
                <div className="bike-edit-options" id="bike-owner-options" role="listbox">
                  {responsavelCorrespondencias.length ? (
                    responsavelCorrespondencias.map((cliente) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={idCliente === cliente.id}
                        key={cliente.id}
                        onClick={() =>
                          atualizar(() => {
                            setClienteId(cliente.id);
                            setResponsavelBusca(cliente.name);
                            setResponsavelAberto(false);
                          })
                        }
                      >
                        <span className="bike-edit-owner-avatar">
                          {cliente.name.slice(0, 1).toLocaleUpperCase('pt-BR')}
                        </span>
                        {cliente.name}
                      </button>
                    ))
                  ) : (
                    <span className="bike-edit-empty-options">Nenhum cliente encontrado.</span>
                  )}
                </div>
              )}
              {!!item?.orderCount && (
                <small className="bike-edit-field-hint">
                  A moto já possui OS; o proprietário não pode ser alterado.
                </small>
              )}
            </div>
            <div className="bike-edit-field" ref={marcaReferencia}>
              <label htmlFor="bike-brand">
                Marca <b>*</b>
              </label>
              <div className="bike-edit-input-wrap">
                <MarcaMark name={marca || 'Marca'} />
                <input
                  id="bike-brand"
                  required
                  maxLength={40}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={marcaAberto}
                  aria-controls="bike-brand-options"
                  aria-autocomplete="list"
                  value={marca}
                  placeholder="Ex.: Honda, Yamaha, BMW…"
                  onFocus={() => {
                    setMarcaAberto(true);
                    setModeloAberto(false);
                  }}
                  onChange={(evento) =>
                    atualizar(() => {
                      setMarca(evento.target.value);
                      setMarcaAberto(true);
                      setModeloAberto(false);
                    })
                  }
                  onKeyDown={(evento) => {
                    if (evento.key === 'Escape') setMarcaAberto(false);
                    if (evento.key === 'Enter' && marcaAberto && marcaCorrespondencias[0]) {
                      evento.preventDefault();
                      escolherMarca(marcaCorrespondencias[0].brand);
                    }
                  }}
                />
                <button
                  type="button"
                  aria-label="Mostrar marcas"
                  onClick={() => {
                    setMarcaAberto((aberto) => !aberto);
                    setModeloAberto(false);
                  }}
                >
                  <Icone name="chevron" size={15} />
                </button>
              </div>
              {marcaAberto && (
                <div className="bike-edit-options" id="bike-brand-options" role="listbox">
                  {marcaCorrespondencias.length ? (
                    marcaCorrespondencias.map((registro) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={marca === registro.brand}
                        key={registro.brand}
                        onClick={() => escolherMarca(registro.brand)}
                      >
                        <MarcaMark name={registro.brand} />
                        <span className="bike-edit-option-label">
                          <strong>{registro.brand}</strong>
                          <small>{registro.models.length} modelos sugeridos</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <span className="bike-edit-empty-options">
                      Marca fora da lista? Continue digitando.
                    </span>
                  )}
                  <span className="bike-edit-options-foot">
                    Sugestões brasileiras; outras marcas também são aceitas.
                  </span>
                </div>
              )}
            </div>
            <div className="bike-edit-field" ref={modeloReferencia}>
              <label htmlFor="bike-model">
                Modelo <b>*</b>
              </label>
              <div className="bike-edit-input-wrap">
                <Icone name="package" size={18} />
                <input
                  id="bike-model"
                  required
                  maxLength={75}
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={modeloAberto}
                  aria-controls="bike-model-options"
                  aria-autocomplete="list"
                  value={modelo}
                  onFocus={() => {
                    setModeloAberto(true);
                    setMarcaAberto(false);
                  }}
                  onChange={(evento) =>
                    atualizar(() => {
                      setModelo(evento.target.value);
                      setModeloAberto(true);
                    })
                  }
                  onKeyDown={(evento) => {
                    if (evento.key === 'Escape') setModeloAberto(false);
                    if (evento.key === 'Enter' && modeloAberto && modeloCorrespondencias[0]) {
                      evento.preventDefault();
                      escolherModelo(modeloCorrespondencias[0]);
                    }
                  }}
                  placeholder="Ex.: CG 160 Fan, NXR 160, MT-03…"
                />
                <button
                  type="button"
                  aria-label="Mostrar modelos"
                  onClick={() => {
                    setModeloAberto((aberto) => !aberto);
                    setMarcaAberto(false);
                  }}
                >
                  <Icone name="chevron" size={15} />
                </button>
              </div>
              {modeloAberto && (
                <div className="bike-edit-options" id="bike-model-options" role="listbox">
                  {!selecionadoMarca ? (
                    <span className="bike-edit-empty-options">
                      Selecione uma marca acima ou digite o modelo livremente.
                    </span>
                  ) : modeloCorrespondencias.length ? (
                    modeloCorrespondencias.map((nome) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={modelo === nome}
                        key={nome}
                        onClick={() => escolherModelo(nome)}
                      >
                        <Icone name="bike" size={17} />
                        <span>{nome}</span>
                      </button>
                    ))
                  ) : (
                    <span className="bike-edit-empty-options">
                      Não encontrou? Digite o modelo completo.
                    </span>
                  )}
                  <span className="bike-edit-options-foot">
                    Confira a versão e a cilindrada antes de salvar.
                  </span>
                </div>
              )}
            </div>
            <div className="bike-edit-field bike-edit-plate-field">
              <label htmlFor="bike-plate">
                Placa <b>*</b>
              </label>
              <div className="bike-edit-input-wrap">
                <Icone name="card" size={17} />
                <input
                  id="bike-plate"
                  required
                  maxLength={7}
                  value={placa}
                  onChange={(evento) =>
                    atualizar(() =>
                      setPlaca(evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')),
                    )
                  }
                  placeholder="ABC1D23"
                />
              </div>
            </div>
            <div className="bike-edit-field">
              <label htmlFor="bike-year">Ano de fabricação</label>
              <div className="bike-edit-input-wrap">
                <Icone name="calendar" size={17} />
                <input
                  id="bike-year"
                  type="number"
                  min="1900"
                  max="2100"
                  value={ano}
                  onChange={(evento) => atualizar(() => setAno(evento.target.value))}
                  placeholder="Ex.: 2024"
                />
              </div>
            </div>
            <div className="bike-edit-field">
              <label htmlFor="bike-model-year">Ano do modelo</label>
              <div className="bike-edit-input-wrap">
                <Icone name="calendar" size={17} />
                <input
                  id="bike-model-year"
                  type="number"
                  min="1900"
                  max="2100"
                  value={modeloAno}
                  onChange={(evento) => atualizar(() => setModeloAno(evento.target.value))}
                  placeholder="Ex.: 2024"
                />
              </div>
            </div>
            <div className="bike-edit-field">
              <label htmlFor="bike-color">Cor</label>
              <div className="bike-edit-input-wrap">
                <Icone name="sliders" size={17} />
                <input
                  id="bike-color"
                  list="bike-colors"
                  maxLength={40}
                  value={cor}
                  onChange={(evento) => atualizar(() => setCor(evento.target.value))}
                  placeholder="Ex.: Preta, Azul…"
                />
                <datalist id="bike-colors">
                  {cores.map((valor) => (
                    <option key={valor} value={valor} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="bike-edit-field">
              <label htmlFor="bike-mileage">Quilometragem atual</label>
              <div className="bike-edit-input-wrap">
                <Icone name="gauge" size={17} />
                <input
                  id="bike-mileage"
                  type="number"
                  min="0"
                  max="10000000"
                  value={quilometragem}
                  onChange={(evento) => atualizar(() => setQuilometragem(evento.target.value))}
                  placeholder="Ex.: 18450"
                />
                <span className="bike-edit-unit">km</span>
              </div>
            </div>
          </div>
          <div className="bike-edit-more">
            <button
              type="button"
              className="bike-edit-more-trigger"
              aria-expanded={additionalAberto}
              aria-controls="bike-edit-extra"
              onClick={() => setAdditionalAberto((aberto) => !aberto)}
            >
              <Icone name="clipboard" size={21} />
              <span>
                <strong>Informações complementares</strong>
                <small>Chassi, RENAVAM, observações e situação do cadastro</small>
              </span>
              <Icone name="chevron" size={18} />
            </button>
            {additionalAberto && (
              <div id="bike-edit-extra" className="bike-edit-more-fields">
                <label>
                  Chassi
                  <input
                    maxLength={17}
                    value={chassis}
                    onChange={(evento) =>
                      atualizar(() =>
                        setChassis(evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')),
                      )
                    }
                    placeholder="17 caracteres"
                  />
                </label>
                <label>
                  RENAVAM
                  <input
                    inputMode="numeric"
                    maxLength={11}
                    value={renavam}
                    onChange={(evento) =>
                      atualizar(() => setRenavam(evento.target.value.replace(/\D/g, '')))
                    }
                    placeholder="11 dígitos"
                  />
                </label>
                <label className="bike-edit-wide">
                  Observações
                  <textarea
                    maxLength={1000}
                    rows={2}
                    value={observacoes}
                    onChange={(evento) => atualizar(() => setObservacoes(evento.target.value))}
                    placeholder="Informações importantes para a equipe"
                  />
                  <small>{observacoes.length}/1000</small>
                </label>
                <label className="bike-edit-active">
                  <input
                    type="checkbox"
                    checked={ativo}
                    onChange={(evento) => atualizar(() => setAtivo(evento.target.checked))}
                  />
                  <span>Cadastro ativo</span>
                </label>
              </div>
            )}
          </div>
          <div className="bike-edit-image-note">
            <Icone name="info" size={16} />
            <span>Miniatura gerada com IA após salvar. Fotos reais ficam na ordem de serviço.</span>
            {item && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => {
                  if (alterado) {
                    setErro('Salve as alterações antes de abrir a IA de miniaturas.');
                    return;
                  }
                  aoImagem(item);
                }}
              >
                Ajustar miniatura com IA <Icone name="right" size={13} />
              </button>
            )}
          </div>
        </div>
        {erro && (
          <p className="bike-edit-error" role="alert">
            <Icone name="info" size={15} />
            {erro}
          </p>
        )}
        <footer className="bike-edit-footer">
          <span>{alterado ? 'Alterações ainda não salvas' : '* Campos obrigatórios'}</span>
          <div>
            <button type="button" onClick={solicitacaoFechar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" disabled={ocupado}>
              <Icone name={ocupado ? 'clock' : 'check'} size={17} />
              {ocupado ? 'Salvando…' : item ? 'Salvar alterações' : 'Cadastrar motocicleta'}
            </button>
          </div>
        </footer>
        {confirmarDescarte && (
          <div className="bike-edit-confirm-cover">
            <div
              className="bike-edit-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="bike-edit-confirm-title"
            >
              <span className="bike-edit-confirm-icon">
                <Icone name="info" size={20} />
              </span>
              <h3 id="bike-edit-confirm-title">Descartar alterações?</h3>
              <p>Os dados alterados ainda não foram salvos.</p>
              <div>
                <button type="button" onClick={() => setConfirmarDiscard(false)}>
                  Continuar editando
                </button>
                <button type="button" onClick={aoFechar}>
                  Descartar e sair
                </button>
              </div>
            </div>
          </div>
        )}
        {pendenteSalvar && (
          <div
            className="bike-edit-confirm-cover"
            onMouseDown={(evento) => {
              if (evento.target === evento.currentTarget && !ocupado) setPendenteSalvar(null);
            }}
          >
            <div
              className="bike-edit-confirm bike-edit-save-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="bike-save-confirm-title"
              aria-describedby="bike-save-confirm-description"
            >
              <span className="bike-edit-confirm-icon">
                <Icone name="pencil" size={20} />
              </span>
              <div className="bike-edit-confirm-content">
                <button
                  type="button"
                  className="bike-edit-confirm-close"
                  aria-label="Fechar"
                  disabled={ocupado}
                  onClick={() => setPendenteSalvar(null)}
                >
                  <Icone name="close" size={18} />
                </button>
                <h3 id="bike-save-confirm-title">Confirmar ação</h3>
                <p id="bike-save-confirm-description">
                  Deseja salvar as alterações de <strong>{item?.model}</strong>?
                </p>
                <p>
                  Os dados atualizados serão exibidos no cadastro e nas ordens vinculadas à
                  motocicleta.
                </p>
                <div>
                  <button type="button" onClick={() => setPendenteSalvar(null)} disabled={ocupado}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void persistir(pendenteSalvar)}
                    disabled={ocupado}
                  >
                    {ocupado ? 'Salvando…' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>,
    document.body,
  );
}
