import { Link } from 'react-router-dom';
import {
  AvatarFuncionario,
  IconeFuncionario,
  MetricaFuncionario,
  PainelFuncionario,
  Situacao,
  baixarRegistro,
  dadosCurta,
} from '../ElementosFuncionario';
import { Icone } from '../MenuAdmin';
import type { usePerfilFuncionario } from '../PerfilFuncionario';
import SeletorFiltro from '../SeletorFiltro';
import SeletorPeriodo from '../SeletorPeriodo';
import {
  Campo,
  GraficoFuncionario,
  Legenda,
  OrdensFuncionario,
  SituacaoOrdem,
  Vazio,
  cargos,
  situacaoOpcoes,
  situacaoTons,
} from './auxiliares';
import ModalFuncionario from './ModalFuncionario';

// Os campos acompanham o gancho, sem repetir uma segunda definicao do formulario.
type Props = NonNullable<ReturnType<typeof usePerfilFuncionario>>;

export default function ConteudoPerfilFuncionario(props: Props) {
  const {
    aba,
    abas,
    abrirSenha,
    alterar,
    aoMudarMes,
    base,
    consulta,
    setErro,
    setModal,
    setRemocao,
    setTodosDocumentos,
    documentosVisiveis,
    editando,
    erro,
    formulario,
    foto,
    fotoEntrada,
    fotoRevisao,
    ir,
    modal,
    ocupado,
    perfil,
    atividadeRecente,
    funcionario,
    resumoFuncionario,
    salvar,
    todosDocumentos,
  } = props;
  return (
    <div className={`staff-profile staff-tab-${aba}`}>
      <section className="staff-profile-heading">
        <div className="staff-profile-identity">
          {aba !== 'overview' && aba !== 'desempenho' && (
            <AvatarFuncionario id={funcionario.id} nome={funcionario.nome} versao={fotoRevisao} />
          )}
          <div>
            <div className="staff-profile-name">
              <h1>{funcionario.nome}</h1>
              <Situacao value={funcionario.situacao} />
            </div>
            <p>
              {funcionario.cargo}
              {funcionario.departamento ? ` • ${funcionario.departamento}` : ''}
            </p>
          </div>
        </div>
        <div className="staff-profile-actions">
          {aba === 'dados' ? (
            <div className="staff-personal-actions">
              <div className="staff-personal-month">
                <SeletorPeriodo
                  mode="month"
                  label="Mês do perfil"
                  value={perfil.mes}
                  onApply={aoMudarMes}
                />
              </div>
              <div className="staff-personal-buttons">
                <button
                  className="staff-save"
                  form="staff-personal-form"
                  type="submit"
                  disabled={ocupado || !perfil.camposExtras}
                >
                  <IconeFuncionario name="salvar" />
                  {ocupado ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <details className="staff-more">
                <summary className="staff-outline">
                  Mais ações
                  <IconeFuncionario name="perfilChevron" />
                </summary>
                <div>
                  <button
                    onClick={() =>
                      baixarRegistro(`funcionario-${funcionario.id}.csv`, [
                        ['Nome', 'Cargo', 'E-mail', 'Telefone', 'Departamento', 'Situação'],
                        [
                          funcionario.nome,
                          funcionario.cargo,
                          funcionario.email,
                          funcionario.telefone,
                          funcionario.departamento,
                          funcionario.situacao,
                        ],
                      ])
                    }
                  >
                    <Icone name="download" size={15} />
                    Exportar ficha
                  </button>
                </div>
              </details>
              <button className="staff-save" type="button" onClick={() => ir('dados')}>
                <IconeFuncionario name="perfilSalvar" />
                Salvar alterações
              </button>
            </>
          )}
        </div>
      </section>
      {(aba === 'overview' || aba === 'desempenho') && (
        <div className="staff-metrics indicadores-grid" data-indicadores>
          <MetricaFuncionario
            title="Ordens Concluídas"
            value={resumoFuncionario.concluidas}
            description="no mês"
            icon="perfilConcluidas"
            tone="green"
            trend={perfil.series.map((textoAtual) => textoAtual.concluidas)}
          />
          <MetricaFuncionario
            title="Ordens em Aberto"
            value={resumoFuncionario.abertas + resumoFuncionario.pecas}
            description="no período"
            icon="perfilAbertas"
            tone="red"
            trend={perfil.series.map((textoAtual) => textoAtual.abertas + textoAtual.pecas)}
          />
          <MetricaFuncionario
            title="Taxa de Conclusão"
            value={`${resumoFuncionario.taxa}%`}
            description="no período"
            icon="perfilTaxa"
            tone="blue"
            trend={perfil.series.map((textoAtual) => textoAtual.taxa)}
          />
          <MetricaFuncionario
            title="OS Concluídas"
            value={resumoFuncionario.totalConcluidas}
            description="em todo o histórico"
            icon="perfilTotal"
            tone="purple"
            trend={perfil.series.map((textoAtual) => textoAtual.concluidas)}
          />
        </div>
      )}
      <nav className="staff-profile-tabs" aria-label="Seções do funcionário">
        {abas.map((instanteAtual) => (
          <Link
            key={instanteAtual.id}
            to={`${base}${instanteAtual.id === 'overview' ? '' : '/' + instanteAtual.id}${consulta}`}
            aria-current={aba === instanteAtual.id ? 'page' : undefined}
            className={aba === instanteAtual.id ? 'active' : ''}
          >
            <IconeFuncionario name={instanteAtual.id} />
            {instanteAtual.text}
          </Link>
        ))}
      </nav>
      {erro && (
        <div className="staff-inline-error" role="alert">
          {erro}
          <button aria-label="Fechar erro" onClick={() => setErro('')}>
            <Icone name="close" size={15} />
          </button>
        </div>
      )}
      {(aba === 'overview' || aba === 'desempenho') && (
        <>
          <div className="staff-overview-top">
            <PainelFuncionario
              title="Desempenho no Mês"
              subtitle="Resumo das principais métricas"
              action={
                <div className="staff-period-control staff-small-month">
                  <span>Período</span>
                  <SeletorPeriodo
                    mode="month"
                    label="Mês do desempenho"
                    value={perfil.mes}
                    onApply={aoMudarMes}
                  />
                </div>
              }
              className="staff-performance"
            >
              <div className="staff-performance-numbers">
                <div>
                  <span>Ordens Concluídas</span>
                  <strong>{resumoFuncionario.concluidas}</strong>
                  <small className="green">no período selecionado</small>
                </div>
                <div>
                  <span>Ordens em Aberto</span>
                  <strong>{resumoFuncionario.abertas + resumoFuncionario.pecas}</strong>
                  <small className="red">aguardando conclusão</small>
                </div>
                <div>
                  <span>Taxa de Conclusão</span>
                  <strong>{resumoFuncionario.taxa}%</strong>
                  <small className="green">das ordens do período</small>
                </div>
              </div>
              <div className="staff-chart-frame">
                <header>
                  <div>
                    <h3>Histórico de Performance</h3>
                    <small>Últimos 6 meses</small>
                  </div>
                  <Legenda />
                </header>
                <GraficoFuncionario series={perfil.series} />
              </div>
            </PainelFuncionario>
            <PainelFuncionario
              title="2. Desempenho"
              subtitle="Indicadores detalhados de desempenho"
            >
              <dl className="staff-definition">
                <div>
                  <dt>Total de Ordens Concluídas</dt>
                  <dd>{resumoFuncionario.totalConcluidas}</dd>
                </div>
                <div>
                  <dt>Total de Ordens em Aberto</dt>
                  <dd>{resumoFuncionario.totalAbertas}</dd>
                </div>
                <div>
                  <dt>Taxa de Conclusão no Período</dt>
                  <dd>{resumoFuncionario.taxa}%</dd>
                </div>
                <div>
                  <dt>Clientes Atendidos</dt>
                  <dd>{resumoFuncionario.clientes}</dd>
                </div>
              </dl>
            </PainelFuncionario>
            <PainelFuncionario
              title="3. Ordens de Serviço"
              subtitle="Resumo das ordens mais recentes"
            >
              <div className="staff-recent-list">
                {atividadeRecente.length ? (
                  atividadeRecente.map((objetoAtual) => (
                    <Link
                      key={objetoAtual.id}
                      className="staff-recent-order"
                      to={`/ordens-de-servico/${objetoAtual.id}`}
                    >
                      <span className="staff-order-copy">
                        <strong>OS-{String(objetoAtual.id).padStart(4, '0')}</strong>
                        <span className="staff-order-service">{objetoAtual.servico}</span>
                      </span>
                      <span className="staff-order-info">
                        <SituacaoOrdem value={objetoAtual.status} />
                        <time>{dadosCurta(objetoAtual.entrada)}</time>
                      </span>
                      <span className="staff-order-eye">
                        <Icone name="eye" size={20} />
                      </span>
                    </Link>
                  ))
                ) : (
                  <Vazio text="Nenhuma ordem neste período." />
                )}
              </div>
              <button className="staff-see-all" onClick={() => ir('ordens')}>
                Ver todas as ordens
                <Icone name="right" size={14} />
              </button>
            </PainelFuncionario>
          </div>
          {aba === 'overview' && (
            <div className="staff-overview-bottom">
              <PainelFuncionario
                title="4. Dados Pessoais"
                subtitle="Informações pessoais e de contato"
                action={
                  <button className="staff-outline" onClick={() => ir('dados')}>
                    <Icone name="pencil" size={14} />
                    Editar
                  </button>
                }
              >
                <dl className="staff-definition">
                  <div>
                    <dt>Data de Nascimento</dt>
                    <dd>{dadosCurta(funcionario.nascimento)}</dd>
                  </div>
                  <div>
                    <dt>Endereço</dt>
                    <dd>{funcionario.endereco ?? 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>CPF</dt>
                    <dd>
                      {funcionario.cpf
                        .replace(/\D/g, '')
                        .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')}
                    </dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{funcionario.telefone ?? 'Não informado'}</dd>
                  </div>
                  <div>
                    <dt>E-mail</dt>
                    <dd>{funcionario.email ?? 'Não informado'}</dd>
                  </div>
                </dl>
              </PainelFuncionario>
              <PainelFuncionario
                title="5. Documentos"
                subtitle="Documentos pessoais e profissionais"
                action={
                  <button
                    className="staff-outline"
                    disabled={!perfil.camposExtras}
                    onClick={() => setModal('documento')}
                  >
                    <Icone name="plus" size={14} />
                    Adicionar documento
                  </button>
                }
              >
                <div className="staff-mini-table-scroll">
                  <table className="staff-mini-table">
                    <thead>
                      <tr>
                        <th>Documento</th>
                        <th>Número</th>
                        <th>Validade</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentosVisiveis.map((dadosAtual) => (
                        <tr key={dadosAtual.id}>
                          <td>{dadosAtual.tipo}</td>
                          <td>{dadosAtual.numero}</td>
                          <td>{dadosCurta(dadosAtual.validade)}</td>
                          <td>
                            <div className="staff-row-actions">
                              <button
                                className="staff-square"
                                aria-label={`Baixar registro de ${dadosAtual.tipo}`}
                                title="Baixar dados do documento em CSV"
                                onClick={() =>
                                  baixarRegistro(`documento-${dadosAtual.id}.csv`, [
                                    ['Funcionário', 'Documento', 'Número', 'Validade'],
                                    [
                                      funcionario.nome,
                                      dadosAtual.tipo,
                                      dadosAtual.numero,
                                      dadosCurta(dadosAtual.validade),
                                    ],
                                  ])
                                }
                              >
                                <Icone name="download" size={16} />
                              </button>
                              <button
                                className="staff-square"
                                aria-label={`Excluir ${dadosAtual.tipo}`}
                                onClick={() => {
                                  setRemocao({ tipo: 'documentos', id: dadosAtual.id });
                                  setModal('excluir');
                                }}
                              >
                                <Icone name="trash" size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!documentosVisiveis.length && <Vazio text="Nenhum documento cadastrado." />}
                </div>
                {perfil.documentos.length > 4 && (
                  <button
                    className="staff-see-all"
                    onClick={() => setTodosDocumentos((valorAtual) => !valorAtual)}
                  >
                    {todosDocumentos ? 'Ver menos' : 'Ver todos os documentos'}
                    <Icone name="right" size={14} />
                  </button>
                )}
              </PainelFuncionario>
            </div>
          )}
        </>
      )}
      {aba === 'ordens' && <OrdensFuncionario profile={perfil} />}
      {aba === 'dados' && (
        <form
          id="staff-personal-form"
          className="staff-personal"
          onSubmit={(eventoRecebido) => void salvar(eventoRecebido)}
        >
          <div className="staff-personal-columns">
            <PainelFuncionario title="Informações pessoais">
              <div className="staff-personal-details">
                <div className="staff-photo-editor">
                  <AvatarFuncionario
                    id={funcionario.id}
                    nome={funcionario.nome}
                    large
                    versao={fotoRevisao}
                  />
                  <button
                    type="button"
                    className="staff-outline"
                    disabled={ocupado || !funcionario.temConta}
                    title={
                      !funcionario.temConta ? 'Vincule uma conta para adicionar a foto' : undefined
                    }
                    onClick={() => fotoEntrada.current?.click()}
                  >
                    <IconeFuncionario name="camera" />
                    Alterar foto
                  </button>
                  <input
                    ref={fotoEntrada}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(eventoRecebido) => void foto(eventoRecebido.target.files?.[0])}
                  />
                </div>
                <div className="staff-fields">
                  <Campo label="Nome completo" icon="user">
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={formulario.nome}
                      readOnly={!editando}
                      onChange={(eventoRecebido) => alterar('nome', eventoRecebido.target.value)}
                    />
                  </Campo>
                  <Campo label="CPF" icon="identificacao">
                    <input
                      required
                      inputMode="numeric"
                      maxLength={14}
                      value={formulario.cpf}
                      readOnly={!editando}
                      onChange={(eventoRecebido) => alterar('cpf', eventoRecebido.target.value)}
                    />
                  </Campo>
                  <Campo label="Data de nascimento" icon="calendar">
                    <input
                      type="date"
                      value={formulario.nascimento}
                      readOnly={!editando}
                      onChange={(eventoRecebido) =>
                        alterar('nascimento', eventoRecebido.target.value)
                      }
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </Campo>
                  <Campo label="Telefone / WhatsApp" icon="phone">
                    <input
                      type="tel"
                      maxLength={20}
                      value={formulario.telefone}
                      readOnly={!editando}
                      onChange={(eventoRecebido) =>
                        alterar('telefone', eventoRecebido.target.value)
                      }
                    />
                  </Campo>
                </div>
              </div>
            </PainelFuncionario>
            <PainelFuncionario title="Informações profissionais">
              <div className="staff-fields">
                <Campo label="Cargo" icon="briefcase">
                  <SeletorFiltro
                    label="Cargo"
                    value={formulario.cargo}
                    onChange={(valor) => alterar('cargo', valor)}
                    variant="staff"
                    options={cargos.map(([valor, rotulo, icone]) => ({
                      value: valor,
                      label: rotulo,
                      icon: icone,
                    }))}
                    disabled={!editando}
                  />
                </Campo>
                <Campo label="Especialidade" icon="star">
                  <input
                    maxLength={150}
                    placeholder="Não informada"
                    value={formulario.especialidade}
                    readOnly={!editando}
                    onChange={(eventoRecebido) =>
                      alterar('especialidade', eventoRecebido.target.value)
                    }
                  />
                </Campo>
                <Campo label="Setor" icon="landmark">
                  <input
                    list="staff-departments"
                    maxLength={100}
                    placeholder="Não informado"
                    value={formulario.departamento}
                    readOnly={!editando}
                    onChange={(eventoRecebido) =>
                      alterar('departamento', eventoRecebido.target.value)
                    }
                  />
                  <datalist id="staff-departments">
                    <option>Oficina</option>
                    <option>Recepção</option>
                    <option>Administrativo</option>
                  </datalist>
                </Campo>
                <Campo label="Data de admissão" icon="calendar">
                  <input
                    type="date"
                    value={formulario.admissao}
                    readOnly={!editando}
                    onChange={(eventoRecebido) => alterar('admissao', eventoRecebido.target.value)}
                  />
                </Campo>
                <Campo label="Status" icon="status" tone={situacaoTons[formulario.situacao]}>
                  <SeletorFiltro
                    label="Status"
                    value={formulario.situacao}
                    onChange={(valor) => alterar('situacao', valor)}
                    variant="staff"
                    options={situacaoOpcoes}
                    disabled={!editando}
                  />
                </Campo>
                <Campo label="Responsável pelo cadastro" icon="user">
                  <input value="Administrador" readOnly />
                </Campo>
              </div>
            </PainelFuncionario>
            <PainelFuncionario title="Contato">
              <div className="staff-fields">
                <Campo label="WhatsApp" icon="phone">
                  <input
                    type="tel"
                    maxLength={20}
                    value={formulario.telefone}
                    readOnly={!editando}
                    onChange={(eventoRecebido) => alterar('telefone', eventoRecebido.target.value)}
                  />
                </Campo>
                <Campo label="E-mail" icon="mail">
                  <input value={funcionario.email ?? ''} readOnly />
                </Campo>
                <Campo label="Endereço" icon="pin">
                  <textarea
                    value={formulario.endereco}
                    maxLength={500}
                    placeholder="Endereço ainda não informado"
                    readOnly={!editando}
                    rows={6}
                    onChange={(eventoRecebido) => alterar('endereco', eventoRecebido.target.value)}
                  />
                </Campo>
              </div>
            </PainelFuncionario>
          </div>
          <section className="staff-account-security">
            <div className="staff-security-info">
              <IconeFuncionario name="seguranca" />
              <div>
                <h2>
                  Segurança da conta{' '}
                  <span
                    className={`staff-access-state ${funcionario.acessoBloqueado ? 'blocked' : 'enabled'}`}
                  >
                    {funcionario.acessoBloqueado ? 'Acesso bloqueado' : 'Acesso ativo'}
                  </span>
                </h2>
                <p>
                  {funcionario.acessoBloqueado
                    ? 'Esta conta não pode entrar nos aplicativos vinculados.'
                    : 'Gerencie as permissões e segurança do acesso do funcionário.'}
                </p>
              </div>
            </div>
            <div className="staff-security-actions">
              <button
                type="button"
                className="staff-outline staff-password"
                disabled={!funcionario.temConta || !funcionario.email || ocupado}
                title={
                  !funcionario.temConta || !funcionario.email
                    ? 'Vincule uma conta com e-mail para alterar a senha.'
                    : undefined
                }
                onClick={abrirSenha}
              >
                <IconeFuncionario name="senha" />
                Alterar senha
              </button>
              <button
                type="button"
                className={`staff-outline ${funcionario.acessoBloqueado ? 'staff-unblock' : 'staff-danger'}`}
                disabled={!funcionario.temConta || ocupado}
                title={
                  !funcionario.temConta
                    ? 'Este funcionário ainda não tem uma conta vinculada.'
                    : undefined
                }
                onClick={() => {
                  setErro('');
                  setModal(funcionario.acessoBloqueado ? 'desbloquear' : 'bloquear');
                }}
              >
                {funcionario.acessoBloqueado ? (
                  <Icone name="check" size={16} />
                ) : (
                  <IconeFuncionario name="bloquear" />
                )}
                {funcionario.acessoBloqueado ? 'Desbloquear acesso' : 'Bloquear acesso'}
              </button>
            </div>
          </section>
          <p className="staff-privacy">
            As informações exibidas são de uso administrativo e devem ser tratadas conforme a
            política de privacidade da empresa.
          </p>
        </form>
      )}
      {modal && <ModalFuncionario {...props} />}
    </div>
  );
}
