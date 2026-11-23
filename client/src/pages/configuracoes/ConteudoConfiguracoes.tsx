import PreferenciasAcessibilidade from '../../components/configuracoes/PreferenciasAcessibilidade';
import CampoCep from '../../components/CampoCep';
import LogoEstacao from '../../components/LogoEstacao';
import { Icone } from '../../components/MenuAdmin';
import ModalAdicionarFuncionario from '../../components/ModalAdicionarFuncionario';
import { SkeletonRow } from '../../components/Skeleton';
import ConfiguracoesSistema from '../../components/configuracoes/ConfiguracoesSistema';
import { CartaoCabecalho, ResumoLinha } from '../../components/configuracoes/ControlesPreferencias';
import NavegacaoConfiguracao from '../../components/configuracoes/NavegacaoConfiguracao';
import NotificacoesConfiguracoes from '../../components/configuracoes/NotificacoesConfiguracoes';
import SituacaoPreferenciasConta from '../../components/configuracoes/SituacaoPreferenciasConta';
import { abas } from '../../components/configuracoes/modelosConfiguracoes';
import type { useConfiguracoes } from '../Configuracoes';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = NonNullable<ReturnType<typeof useConfiguracoes>>;

export default function ConteudoConfiguracoes(props: Props) {
  const {
    abaLocal,
    abertoEditor,
    alterarAba,
    atualizarPreferencias,
    campo,
    setFuncionarioModalAberto,
    setOficina,
    setPrefSecao,
    setSalvo,
    editarSecao,
    equipe,
    equipeSituacao,
    fecharEditor,
    funcionarioModalAberto,
    oficina,
    prefSecao,
    preferencias,
    sair,
    salvarOficina,
    salvo,
    usuarioLocal,
  } = props;
  return (
    <div className="orders-viewport settings-app">
      <div className="orders-main">
        <main className="settings-content">
          <NavegacaoConfiguracao
            id="settings-main"
            label="Seções de configuração"
            className="settings-tabs"
            value={abaLocal}
            onChange={alterarAba}
            options={abas
              .filter(
                (item) =>
                  usuarioLocal?.acesso.administrador ||
                  ['preferencias', 'notificacoes'].includes(item.id),
              )
              .map((item) => ({
                value: item.id,
                label: item.label,
                icon: item.icon,
              }))}
          />
          <section className="settings-heading">
            <div>
              <span className="settings-eyebrow">PAINEL DE CONTROLE</span>
              <h1>{abas.find((item) => item.id === abaLocal)?.label}</h1>
              <p>{abas.find((item) => item.id === abaLocal)?.help}.</p>
            </div>
            {(['preferencias', 'notificacoes', 'seguranca'] as string[]).includes(abaLocal) && (
              <SituacaoPreferenciasConta />
            )}
          </section>

          {abas
            .filter(
              (item) =>
                item.id !== abaLocal &&
                (usuarioLocal?.acesso.administrador ||
                  ['preferencias', 'notificacoes'].includes(item.id)),
            )
            .map((item) => (
              <div
                key={item.id}
                id={`settings-main-panel-${item.id}`}
                role="tabpanel"
                aria-labelledby={`settings-main-tab-${item.id}`}
                hidden
              />
            ))}
          <div
            id={`settings-main-panel-${abaLocal}`}
            role="tabpanel"
            aria-labelledby={`settings-main-tab-${abaLocal}`}
          >
            {abaLocal === 'geral' && (
              <div className="settings-general-grid">
                <article className="settings-card settings-company">
                  <CartaoCabecalho
                    icon="camera"
                    title="Perfil da oficina"
                    note="Informações principais do negócio"
                    action={() => abertoEditor('perfil')}
                    actionLabel="Editar dados"
                  />
                  <div className="settings-company-summary">
                    <div className="settings-brandmark">
                      <LogoEstacao />
                    </div>
                    <dl>
                      {[
                        ['Nome da oficina', oficina.nome],
                        ['CNPJ', oficina.cnpj],
                        ['Telefone', oficina.telefone],
                        ['E-mail', oficina.email],
                      ].map(([rotulo, valor]) => (
                        <div key={rotulo}>
                          <dt>{rotulo}</dt>
                          <dd>{valor || <span className="settings-muted">Não informado</span>}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </article>
                <article className="settings-card">
                  <CartaoCabecalho
                    icon="pin"
                    title="Localização"
                    note="Endereço cadastrado para a oficina"
                    action={() => abertoEditor('endereco')}
                    actionLabel="Editar endereço"
                  />
                  <dl className="settings-detail-list">
                    {[
                      ['CEP', oficina.cep],
                      ['Endereço', oficina.endereco],
                      ['Bairro', oficina.bairro],
                      ['Cidade', oficina.cidade],
                      ['Estado', oficina.estado],
                    ].map(([rotulo, valor]) => (
                      <div key={rotulo}>
                        <dt>{rotulo}</dt>
                        <dd>{valor || <span className="settings-muted">Não informado</span>}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
                <article className="settings-card">
                  <CartaoCabecalho
                    icon="clock"
                    title="Horário de funcionamento"
                    note="Deixe claro quando a oficina atende"
                    action={() => abertoEditor('horarios')}
                    actionLabel="Editar horários"
                  />
                  <div className="settings-hours">
                    {[
                      ['Segunda a sexta', oficina.semana],
                      ['Sábado', oficina.sabado],
                      ['Domingo', 'Fechado'],
                    ].map(([dia, horas]) => (
                      <div key={dia}>
                        <span>{dia}</span>
                        <strong className={horas === 'Fechado' ? 'closed' : ''}>
                          {horas || (dia === 'Domingo' ? 'Fechado' : 'Não informado')}
                        </strong>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="settings-card">
                  <CartaoCabecalho
                    icon="check"
                    title="Resumo da conta"
                    note="Acesso e recursos cadastrados"
                  />
                  <div className="settings-account-list">
                    <ResumoLinha
                      icon="users"
                      label="Usuários cadastrados"
                      value={
                        equipeSituacao === 'ready' ? (
                          String(equipe.length)
                        ) : equipeSituacao === 'error' ? (
                          'Indisponível'
                        ) : (
                          <SkeletonRow width="32px" height={14} />
                        )
                      }
                      detail="Consulte a lista completa em Funcionários"
                    />
                    <ResumoLinha
                      icon="lock"
                      label="Acesso administrativo"
                      value="Protegido"
                      detail="A autenticação é verificada pelo servidor"
                    />
                    <ResumoLinha
                      icon="package"
                      label="Dados da oficina"
                      value="Editável"
                      detail="Salvos no banco de dados"
                    />
                  </div>
                </article>
              </div>
            )}

            {abaLocal === 'preferencias' && (
              <PreferenciasAcessibilidade
                preferencias={preferencias}
                atualizarPreferencias={atualizarPreferencias}
                prefSecao={prefSecao}
                setPrefSecao={setPrefSecao}
              />
            )}

            {abaLocal === 'notificacoes' && <NotificacoesConfiguracoes />}

            {(['seguranca', 'integracoes', 'sobre'] as string[]).includes(abaLocal) && (
              <ConfiguracoesSistema
                aba={abaLocal as 'seguranca' | 'integracoes' | 'sobre'}
                usuario={usuarioLocal}
                onTab={alterarAba}
                onLogout={sair}
              />
            )}
          </div>
          {salvo && (
            <div className="settings-toast" role="status">
              <Icone name="check" size={15} />
              {salvo}
              <button aria-label="Fechar aviso" onClick={() => setSalvo('')}>
                <Icone name="close" size={13} />
              </button>
            </div>
          )}
          {funcionarioModalAberto && (
            <ModalAdicionarFuncionario
              initialRole="Administrador"
              onClose={() => setFuncionarioModalAberto(false)}
              onSubmitted={() => {
                setSalvo('Solicitação de cadastro enviada para aprovação.');
              }}
            />
          )}
          {editarSecao && (
            <div
              className="settings-modal-backdrop"
              role="presentation"
              onMouseDown={(evento) => {
                if (evento.target === evento.currentTarget) fecharEditor();
              }}
            >
              <section
                className="settings-edit-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-edit-title"
              >
                <header className="settings-modal-header">
                  <span className="settings-modal-mark">
                    <Icone
                      name={
                        editarSecao === 'horarios'
                          ? 'clock'
                          : editarSecao === 'endereco'
                            ? 'pin'
                            : 'settings'
                      }
                      size={21}
                    />
                  </span>
                  <div>
                    <span className="settings-modal-overline">
                      ESTAÇÃO MOTOS <i /> CONFIGURAÇÕES
                    </span>
                    <h2 id="settings-edit-title">
                      {editarSecao === 'horarios'
                        ? 'Horário de funcionamento'
                        : editarSecao === 'endereco'
                          ? 'Endereço da oficina'
                          : 'Dados da oficina'}
                    </h2>
                    <p>
                      {editarSecao === 'horarios'
                        ? 'Informe os horários que a equipe deve considerar no atendimento.'
                        : editarSecao === 'endereco'
                          ? 'Mantenha o endereço da unidade atualizado.'
                          : 'Atualize as informações que identificam a sua oficina.'}
                    </p>
                  </div>
                  <button
                    className="settings-icon-button"
                    aria-label="Fechar"
                    onClick={fecharEditor}
                  >
                    <Icone name="close" size={18} />
                  </button>
                </header>
                <div className="settings-modal-body">
                  <div className="settings-modal-context">
                    <span>
                      <Icone
                        name={
                          editarSecao === 'horarios'
                            ? 'clock'
                            : editarSecao === 'endereco'
                              ? 'pin'
                              : 'info'
                        }
                        size={17}
                      />
                    </span>
                    <div>
                      <b>
                        {editarSecao === 'horarios'
                          ? 'Expediente da oficina'
                          : editarSecao === 'endereco'
                            ? 'Localização e contato'
                            : 'Identificação e contato'}
                      </b>
                      <small>Preencha apenas as informações que deseja manter registradas.</small>
                    </div>
                  </div>
                  <div className="settings-modal-fields">
                    {editarSecao === 'perfil' && (
                      <>
                        <h3>Informações principais</h3>
                        <div className="settings-form-grid">
                          {campo('Nome da oficina', 'nome')}
                          {campo('CNPJ', 'cnpj')}
                          {campo('Telefone', 'telefone', 'tel')}
                          {campo('E-mail de contato', 'email', 'email')}
                        </div>
                      </>
                    )}
                    {editarSecao === 'endereco' && (
                      <>
                        <h3>Onde a equipe atende</h3>
                        <div className="settings-form-grid">
                          <label className="settings-field">
                            <span>CEP</span>
                            <CampoCep
                              value={oficina.cep}
                              onChange={(valorAtual) =>
                                setOficina((registroAtual) => ({
                                  ...registroAtual,
                                  cep: valorAtual,
                                }))
                              }
                              onEndereco={(dadosAtual) =>
                                setOficina((registroAtual) => ({
                                  ...registroAtual,
                                  endereco: dadosAtual.rua,
                                  bairro: dadosAtual.bairro,
                                  cidade: dadosAtual.cidade,
                                  estado: dadosAtual.estado,
                                }))
                              }
                            />
                          </label>
                          {campo('Endereço', 'endereco')}
                          {campo('Número', 'numero')}
                          {campo('Complemento (opcional)', 'complemento')}
                          {campo('Bairro', 'bairro')}
                          {campo('Cidade', 'cidade')}
                          {campo('Estado', 'estado')}
                        </div>
                      </>
                    )}
                    {editarSecao === 'horarios' && (
                      <>
                        <h3>Horários de atendimento</h3>
                        <div className="settings-form-grid">
                          {campo('Segunda a sexta', 'semana')}
                          {campo('Sábado', 'sabado')}
                        </div>
                        <div className="settings-hours-tip">
                          <Icone name="info" size={16} />
                          Use o formato “08:00 às 18:00”. Para um dia fechado, escreva “Fechado”.
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <footer className="settings-modal-footer">
                  <span>
                    <Icone name="lock" size={14} />
                    Salvo neste dispositivo
                  </span>
                  <div>
                    <button className="settings-button" onClick={fecharEditor}>
                      Cancelar
                    </button>
                    <button className="settings-primary" onClick={salvarOficina}>
                      <Icone name="check" size={16} />
                      Salvar alterações
                    </button>
                  </div>
                </footer>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
