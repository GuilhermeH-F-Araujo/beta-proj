import { useEffect, useState } from 'react';
import GestaoAdministradores from './GestaoAdministradores';
import { useDadosVivos } from '../../hooks/useDadosVivos';
import {
  buscarBackupSistema,
  buscarDiagnosticoSistema,
  minutosInatividade,
  salvarBackupSistema,
  BACKUP_DEMONSTRACAO,
  ultimoBackupDemonstracao,
  salvarInatividadeConta,
  type BackupSistema,
  type DiagnosticoSistema,
} from '../../services/configuracoesSistema';
import { Icone } from '../MenuAdmin';
import LogoEstacao from '../LogoEstacao';
import SeletorFiltro from '../SeletorFiltro';
import { SkeletonRow } from '../Skeleton';
import {
  CabecalhoConfiguracao,
  CartaoConfiguracao,
  CfgDialog,
  baixarArquivo,
} from './ElementosConfiguracoes';
import VisualizarLogs from './VisualizarLogs';
import GoogleAuthenticator from './GoogleAuthenticator';
import { solicitarConfirmacao } from '../../services/confirmacaoAdministrativa';
type Props = {
  aba: 'seguranca' | 'integracoes' | 'sobre';
  usuario: { id: string; nome: string; email: string | null } | null;
  onTab: (abaLocal: 'notificacoes' | 'preferencias') => void;
  onLogout: () => Promise<void>;
};
const formatarDados = (dados: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(dados));
const nomesServicos: Record<string, string> = {
  cadastros: 'Cadastros de clientes',
  ordens: 'Ordens de serviço',
  notificacoes: 'Central de notificações',
  historico: 'Histórico de atividades',
};
export default function ConfiguracoesSistema({
  aba,
  usuario,
  onTab: aoAba,
  onLogout: aoSair,
}: Props) {
  const [diagnostico, setDiagnostico] = useState<DiagnosticoSistema | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [erroDiagnostico, setErroDiagnostico] = useState('');
  const [modal, setModal] = useState<
    'atividade' | 'stone' | 'rede' | 'sair' | 'inatividade' | null
  >(null);
  const [inatividade, setInatividade] = useState(() => minutosInatividade(usuario?.id || ''));
  const [aviso, setAviso] = useState('');
  const [backup, setBackup] = useState<BackupSistema | null>(null);
  const [carregandoBackup, setCarregandoBackup] = useState(false);
  const [salvandoBackup, setSalvandoBackup] = useState(false);
  const [avisoBackup, setAvisoBackup] = useState('');
  useDadosVivos(
    async (valido) => {
      const resultado = await buscarDiagnosticoSistema();
      if (valido()) {
        setDiagnostico(resultado);
        setErroDiagnostico('');
      }
    },
    aba === 'integracoes' && !verificando,
  );
  async function verificar() {
    setVerificando(true);
    setErroDiagnostico('');
    try {
      setDiagnostico(await buscarDiagnosticoSistema());
    } catch (erroCapturado) {
      setErroDiagnostico(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível verificar os serviços.',
      );
    } finally {
      setVerificando(false);
    }
  }
  useEffect(() => {
    void verificar();
  }, []);
  useEffect(() => {
    const atualizar = () => setInatividade(minutosInatividade(usuario?.id || ''));
    window.addEventListener('session-preferences-change', atualizar);
    return () => window.removeEventListener('session-preferences-change', atualizar);
  }, [usuario?.id]);
  useEffect(() => {
    if (aba !== 'seguranca') return;
    let ativo = true;
    setCarregandoBackup(true);
    void buscarBackupSistema()
      .then((resultado) => {
        if (ativo) setBackup(resultado);
      })
      .catch((falha) => {
        if (ativo)
          setAvisoBackup(
            falha instanceof Error ? falha.message : 'Não foi possível consultar os backups.',
          );
      })
      .finally(() => {
        if (ativo) setCarregandoBackup(false);
      });
    return () => {
      ativo = false;
    };
  }, [aba]);
  const disponiveis = diagnostico?.checks.filter((elementoAtual) => elementoAtual.ok).length ?? 0;
  const saudavel = !!diagnostico && disponiveis === diagnostico.checks.length;
  function salvarInatividade(valor: string) {
    try {
      salvarInatividadeConta(usuario?.id || '', Number(valor));
      setInatividade(Number(valor));
      window.dispatchEvent(new Event('session-preferences-change'));
      setAviso('Tempo de inatividade aplicado e sendo salvo na conta.');
    } catch {
      setAviso('Não foi possível salvar o tempo de inatividade.');
    }
  }
  async function alterarBackup(executarAgora: boolean) {
    if (!backup?.configured || salvandoBackup) return;
    setSalvandoBackup(true);
    setAvisoBackup('');
    try {
      const resultado = await salvarBackupSistema(
        backup.retentionDays,
        backup.frequency,
        executarAgora,
      );
      setAvisoBackup(resultado.message);
    } catch (falha) {
      setAvisoBackup(
        falha instanceof Error ? falha.message : 'Não foi possível atualizar os backups.',
      );
    } finally {
      setSalvandoBackup(false);
    }
  }
  function relatorio() {
    baixarArquivo(
      'estacao-motos-informacoes.txt',
      `ESTAÇÃO MOTOS — INFORMAÇÕES DO SISTEMA\nVersão: ${diagnostico?.version || '1.0.0'}\nVerificação: ${diagnostico ? formatarDados(diagnostico.checkedAt) : 'Não realizada'}\n${diagnostico?.checks.map((elementoAtual) => `${nomesServicos[elementoAtual.id]}: ${elementoAtual.ok ? 'Respondendo' : 'Falha de consulta'}`).join('\n') || ''}\n\nEste relatório não contém senhas, chaves, e-mails nem dados de clientes.\n`,
    );
    setAviso('Informações do sistema baixadas. Nenhum dado de cliente foi incluído.');
  }
  const botaoVerificar = (
    <button className="cfg-button" disabled={verificando} onClick={() => void verificar()}>
      <Icone name="refresh" size={17} />
      {verificando ? <SkeletonRow width="90px" height={14} /> : 'Verificar conexão'}
    </button>
  );
  return (
    <div className={`cfg-page cfg-system-${aba}`}>
      {aba === 'seguranca' && (
        <>
          <CabecalhoConfiguracao
            icon="shield"
            title="Segurança da conta"
            description="Proteja seu acesso, encerre sessões paradas e consulte as alterações importantes da oficina."
            tone="sage"
          />
          <GestaoAdministradores />
          <div className="cfg-security-layout">
            <div className="cfg-security-row cfg-security-row-top">
              <CartaoConfiguracao
                icon="lock"
                title="Seu acesso"
                description="Proteja decisões administrativas com uma confirmação no celular."
              >
                <GoogleAuthenticator />
              </CartaoConfiguracao>
              <CartaoConfiguracao
                icon="clock"
                title="Encerrar sessão por inatividade"
                description="A sessão será encerrada automaticamente após o período escolhido sem atividade."
              >
                <div className="cfg-inactivity-summary">
                  <span>Encerramento atual</span>
                  <strong>{inatividade ? `${inatividade} minutos` : 'Desativado'}</strong>
                  <button className="cfg-button" onClick={() => setModal('inatividade')}>
                    <Icone name="sliders" size={16} /> Ajustar período
                  </button>
                </div>
                <div className="cfg-private-note">
                  <Icone name="info" size={18} /> Sua escolha é sincronizada com a conta.
                </div>
                <button className="cfg-text-button cfg-signout" onClick={() => setModal('sair')}>
                  <Icone name="exit-arrow" size={18} /> Sair desta conta agora
                </button>
              </CartaoConfiguracao>
            </div>
            <div className="cfg-security-row cfg-security-row-bottom">
              <CartaoConfiguracao
                icon="file-lines"
                title="Logs da oficina"
                description="Consulte mudanças de status, cadastros, exclusões e quem realizou cada ação."
              >
                <div className="cfg-logs-action">
                  <p>
                    O histórico registra as atividades importantes da oficina com data e horário.
                  </p>
                  <button className="cfg-button" onClick={() => setModal('atividade')}>
                    <Icone name="file-lines" size={17} /> Abrir logs
                  </button>
                </div>
              </CartaoConfiguracao>
              <CartaoConfiguracao
                icon="package"
                title="Conectar o GitHub"
                description="O GitHub guarda os backups criptografados do banco."
                className="cfg-github-card"
              >
                {BACKUP_DEMONSTRACAO && (
                  <div className="cfg-backup-state ready">
                    <i /> GitHub conectado · repositório privado
                  </div>
                )}
                <ol className="cfg-github-steps">
                  <li>
                    Crie um repositório <b>privado</b> e envie o projeto com o workflow incluído.
                    Não envie arquivos <code>.env</code> nem a chave privada.
                  </li>
                  <li>
                    Gere a chave com <code>age-keygen -o backup-age-key.txt</code>. Em{' '}
                    <b> Settings → Secrets and variables → Actions</b>, adicione a URL Session
                    Pooler do Supabase em <code>SUPABASE_DB_URL</code> e a chave pública em{' '}
                    <code>BACKUP_AGE_RECIPIENT</code>.
                  </li>
                  <li>
                    Crie um token fine-grained restrito a esse repositório, com as permissões
                    listadas abaixo. No Render, informe o repo como <code>usuario/repositorio</code>
                    , o token e a branch padrão.
                  </li>
                  <li>
                    Reinicie o serviço. A tela de backup mostrará quando a conexão estiver pronta.
                  </li>
                </ol>
                <p className="cfg-backup-help">
                  Permissões do token: Actions write, Variables read/write e Secrets read. A URL do
                  banco contém a senha do Postgres. Guarde o arquivo privado da chave age fora do
                  GitHub e do Render.
                </p>
              </CartaoConfiguracao>
              <CartaoConfiguracao
                icon="database"
                title="Backups do banco"
                description="Defina frequência, retenção e solicite uma cópia quando precisar."
                className="cfg-backup-card"
              >
                {carregandoBackup ? (
                  <p className="cfg-backup-state">Consultando a configuração segura do GitHub…</p>
                ) : backup?.configured ? (
                  <>
                    <div className="cfg-backup-state ready">
                      <i /> Backup externo configurado
                    </div>
                    {BACKUP_DEMONSTRACAO && (
                      <p className="cfg-backup-help">
                        Último backup:{' '}
                        <b>
                          {new Date(ultimoBackupDemonstracao()).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </b>{' '}
                        · concluído com sucesso
                      </p>
                    )}
                    <div className="cfg-backup-fields">
                      <label>
                        Frequência automática
                        <select
                          value={backup.frequency}
                          onChange={(evento) =>
                            setBackup({
                              ...backup,
                              frequency: evento.target.value as BackupSistema['frequency'],
                            })
                          }
                        >
                          <option value="diario">Todos os dias</option>
                          <option value="semanal">Uma vez por semana</option>
                          <option value="mensal">Uma vez por mês</option>
                        </select>
                      </label>
                      <label>
                        Manter cada cópia por
                        <select
                          value={backup.retentionDays}
                          onChange={(evento) =>
                            setBackup({
                              ...backup,
                              retentionDays: Number(
                                evento.target.value,
                              ) as BackupSistema['retentionDays'],
                            })
                          }
                        >
                          <option value={15}>15 dias</option>
                          <option value={30}>30 dias</option>
                          <option value={90}>90 dias</option>
                        </select>
                      </label>
                    </div>
                    <p className="cfg-backup-help">
                      Os arquivos são criptografados antes do envio. A retenção é um prazo máximo:
                      backups antigos podem sair antes para respeitar o espaço disponível. O dump
                      lógico não inclui usuários Auth nem arquivos do Storage.
                    </p>
                    {avisoBackup && (
                      <p className="cfg-backup-message" role="status">
                        {avisoBackup}
                      </p>
                    )}
                    <div className="cfg-backup-actions">
                      <button
                        className="cfg-button"
                        disabled={salvandoBackup}
                        onClick={() => void alterarBackup(false)}
                      >
                        Salvar agendamento
                      </button>
                      <button
                        className="cfg-button primary"
                        disabled={salvandoBackup}
                        onClick={() => void alterarBackup(true)}
                      >
                        {salvandoBackup ? 'Solicitando…' : 'Fazer backup agora'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="cfg-backup-state">Backup precisa de configuração</div>
                    <p className="cfg-backup-help">
                      {backup?.repositoryConfigured && !backup.repositoryPrivate
                        ? 'O repositório configurado não é privado.'
                        : backup?.missingSecrets?.length
                          ? `Faltam no GitHub: ${backup.missingSecrets.join(' e ')}.`
                          : 'Configure o GitHub no card ao lado e os secrets no Render.'}
                    </p>
                    {avisoBackup && (
                      <p className="cfg-backup-message" role="alert">
                        {avisoBackup}
                      </p>
                    )}
                  </>
                )}
              </CartaoConfiguracao>
            </div>
          </div>
          <CartaoConfiguracao
            icon="shield"
            title="Testar diálogos de segurança"
            description="Veja os avisos usados em ações sensíveis e na proteção da sessão."
            className="cfg-security-preview-card"
          >
            <div className="cfg-security-preview-actions">
              <button
                className="cfg-button"
                type="button"
                onClick={() => {
                  void solicitarConfirmacao({
                    titulo: 'Teste de confirmação protegida',
                    descricao:
                      'Prévia do re-login por senha usado nas ações administrativas sensíveis.',
                    metodoForcado: 'senha',
                    previsualizacao: true,
                  }).catch(() => undefined);
                }}
              >
                <Icone name="lock" size={17} /> Prévia de re-login por senha
              </button>
              <button
                className="cfg-button"
                type="button"
                onClick={() => {
                  void solicitarConfirmacao({
                    titulo: 'Teste de confirmação protegida',
                    descricao:
                      'Prévia do re-login pelo Google Authenticator usado nas ações administrativas sensíveis.',
                    metodoForcado: 'autenticador',
                    previsualizacao: true,
                  }).catch(() => undefined);
                }}
              >
                <Icone name="shield" size={17} /> Prévia de re-login por autenticador
              </button>
              <button
                className="cfg-button"
                type="button"
                onClick={() => {
                  void solicitarConfirmacao({
                    titulo: 'Ative a proteção da conta',
                    descricao:
                      'Esta decisão só pode continuar depois que você ativar o código de segurança no celular.',
                    requireAuthenticator: true,
                    previsualizacao: true,
                    previsualizarObrigatoriedade: true,
                  }).catch(() => undefined);
                }}
              >
                <Icone name="shield" size={17} /> Prévia da obrigação do autenticador
              </button>
              <button
                className="cfg-button"
                type="button"
                onClick={() => {
                  void solicitarConfirmacao({
                    titulo: 'Aprovar cadastro de funcionário',
                    descricao:
                      'Confirme sua senha e o código do Google Authenticator para aprovar ou recusar este cadastro.',
                    requireAuthenticator: true,
                    metodoForcado: 'ambos',
                    previsualizacao: true,
                  }).catch(() => undefined);
                }}
              >
                <Icone name="user" size={17} /> Prévia de aprovação de funcionário
              </button>
              <button
                className="cfg-button"
                type="button"
                onClick={() => {
                  void solicitarConfirmacao({
                    titulo: 'Confirmar promoção de acesso',
                    descricao:
                      'Confirme sua senha e o código do Google Authenticator antes de promover esta pessoa a superadministrador.',
                    requireAuthenticator: true,
                    metodoForcado: 'ambos',
                    previsualizacao: true,
                  }).catch(() => undefined);
                }}
              >
                <Icone name="user" size={17} /> Prévia de promoção de administrador
              </button>
              <button
                className="cfg-button"
                type="button"
                onClick={() => window.dispatchEvent(new Event('session-inactivity-preview'))}
              >
                <Icone name="clock" size={17} /> Prévia do aviso de inatividade
              </button>
            </div>
          </CartaoConfiguracao>
        </>
      )}
      {aba === 'integracoes' && (
        <>
          <CabecalhoConfiguracao
            icon="package"
            title="Tudo conectado. Tudo bem explicado."
            description="Confira o que funciona automaticamente e o que é operado pela equipe."
          >
            <div className="cfg-hero-tags">
              <span>
                <i className={saudavel ? 'green' : ''} />
                {verificando
                  ? 'Verificando os serviços'
                  : diagnostico
                    ? saudavel
                      ? 'Serviços consultados com sucesso'
                      : 'Há serviços que precisam de atenção'
                    : 'Aguardando verificação'}
              </span>
              <span>2 terminais de operação manual</span>
            </div>
          </CabecalhoConfiguracao>
          <CartaoConfiguracao
            icon="database"
            title="Serviços do sistema"
            description="Verificação real das consultas usadas pela oficina."
            action={botaoVerificar}
          >
            <div className="cfg-integration-services">
              <div className="cfg-database-brand">
                <img src="/assets/integrations/banco-de-dados.png" alt="" />
                <div>
                  <b>Banco de dados</b>
                  <p>Cadastros, ordens e histórico em um só lugar.</p>
                  <span className={`cfg-badge ${saudavel ? 'green' : 'neutral'}`}>
                    {verificando ? (
                      <SkeletonRow width="90px" height={14} />
                    ) : diagnostico ? (
                      `${disponiveis} de ${diagnostico.checks.length} consultas respondendo`
                    ) : (
                      'Conexão não confirmada'
                    )}
                  </span>
                </div>
              </div>
              <div className="cfg-service-checks">
                {['cadastros', 'ordens', 'notificacoes', 'historico'].map((id) => {
                  const verificarLocal = diagnostico?.checks.find(
                    (elementoAtual) => elementoAtual.id === id,
                  );
                  return (
                    <div key={id}>
                      <Icone name={verificarLocal?.ok ? 'check' : 'activity'} size={19} />
                      <span>{nomesServicos[id]}</span>
                      <b className={verificarLocal?.ok ? 'ok' : ''}>
                        {verificando ? (
                          <SkeletonRow width="90px" height={14} />
                        ) : verificarLocal ? (
                          verificarLocal.ok ? (
                            'Respondendo'
                          ) : (
                            'Verificar'
                          )
                        ) : (
                          'Aguardando'
                        )}
                      </b>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="cfg-card-bottom">
              <small>
                {diagnostico
                  ? `Última verificação: ${formatarDados(diagnostico.checkedAt)}`
                  : 'A verificação não altera seus dados.'}
              </small>
            </div>
            {erroDiagnostico && (
              <p className="cfg-error" role="alert">
                {erroDiagnostico}
              </p>
            )}
          </CartaoConfiguracao>
          <div className="cfg-payments-heading">
            <div>
              <h2>Terminais da oficina</h2>
              <p>Identifique os equipamentos e veja como usá-los na rotina.</p>
            </div>
            <span className="cfg-badge neutral">Operação manual</span>
          </div>
          <div className="cfg-payment-grid">
            {(['stone', 'rede'] as const).map((nome) => (
              <section className={`cfg-card cfg-payment ${nome}`} key={nome}>
                <div className="cfg-terminal-image">
                  <img
                    src={`/assets/integrations/${nome}.png`}
                    alt={`Terminal ${nome === 'stone' ? 'Stone' : 'Rede'}`}
                  />
                </div>
                <div>
                  <span className="cfg-overline">PAGAMENTOS</span>
                  <h2>{nome === 'stone' ? 'Stone' : 'Rede'}</h2>
                  <p>Receba na maquininha e confira o pagamento antes de liberar a motocicleta.</p>
                  <span className="cfg-badge neutral">Sem cobrança automática</span>
                  <button className="cfg-button" onClick={() => setModal(nome)}>
                    Como funciona <Icone name="right" size={17} />
                  </button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {aba === 'sobre' && (
        <>
          <section className="cfg-brand-hero">
            <div className="cfg-brand-logo">
              <LogoEstacao />
            </div>
            <div>
              <span className="cfg-overline">SUA OFICINA. MAIS ORGANIZADA.</span>
              <h2>Estação Motos</h2>
              <p>
                Do primeiro atendimento à entrega da motocicleta, tudo o que sua equipe precisa em
                um único lugar.
              </p>
              <div className="cfg-hero-tags">
                <span>Versão {diagnostico?.version || '1.0.0'}</span>
                <span>Plataforma de gestão</span>
              </div>
            </div>
            <span className="cfg-brand-art">
              <Icone name="bike" size={130} />
            </span>
          </section>
          <div className="cfg-about-grid">
            <CartaoConfiguracao
              icon="info"
              title="Sua instalação"
              description="Informações úteis para identificar o sistema."
            >
              <dl className="cfg-facts">
                <div>
                  <dt>Produto</dt>
                  <dd>Estação Motos · PERC-3</dd>
                </div>
                <div>
                  <dt>Versão</dt>
                  <dd>{diagnostico?.version || '1.0.0'}</dd>
                </div>
                <div>
                  <dt>Perfil da sua conta</dt>
                  <dd>Administrador</dd>
                </div>
                <div>
                  <dt>Serviços consultados</dt>
                  <dd>
                    {verificando ? (
                      <SkeletonRow width="90px" height={14} />
                    ) : diagnostico ? (
                      `${disponiveis} de ${diagnostico.checks.length} respondendo`
                    ) : (
                      'Conexão não confirmada'
                    )}
                  </dd>
                </div>
              </dl>
              <button className="cfg-button" onClick={relatorio}>
                <Icone name="download" size={18} />
                Baixar informações do sistema
              </button>
              <p className="cfg-help">Sem senhas, chaves ou dados pessoais de clientes.</p>
            </CartaoConfiguracao>
            <CartaoConfiguracao
              icon="eye"
              title="Feito para facilitar sua rotina"
              description="O sistema se ajusta ao seu jeito de trabalhar."
            >
              <div className="cfg-about-features">
                <div>
                  <Icone name="eye" size={21} />
                  <span>
                    <b>Leitura confortável</b>
                    <small>Ajustes de texto, espessura e espaçamento.</small>
                  </span>
                </div>
                <div>
                  <Icone name="bell" size={21} />
                  <span>
                    <b>Atenção no que importa</b>
                    <small>Avisos configurados evento por evento.</small>
                  </span>
                </div>
                <div>
                  <Icone name="shield" size={21} />
                  <span>
                    <b>Controle administrativo</b>
                    <small>Acesso autenticado e históricos de alteração.</small>
                  </span>
                </div>
              </div>
              <div className="cfg-button-group">
                <button className="cfg-button" onClick={() => aoAba('preferencias')}>
                  Ajustar leitura
                </button>
                <button className="cfg-button" onClick={() => aoAba('notificacoes')}>
                  Configurar avisos
                </button>
              </div>
            </CartaoConfiguracao>
            <CartaoConfiguracao
              icon="info"
              title="Dúvidas rápidas"
              description="Respostas diretas para situações do dia a dia."
              className="cfg-faq"
            >
              <details>
                <summary>Meus ajustes valem para toda a equipe?</summary>
                <p>
                  As preferências são pessoais e ficam salvas na sua conta. Ao entrar em outro
                  computador, seus ajustes de leitura, tamanhos e avisos são carregados.
                </p>
              </details>
              <details>
                <summary>Posso trabalhar com o som desligado?</summary>
                <p>
                  Sim. Os avisos escolhidos continuam no sino do cabeçalho. O som e o horário de
                  silêncio não apagam as notificações.
                </p>
              </details>
              <details>
                <summary>As maquininhas fazem cobranças pelo sistema?</summary>
                <p>
                  Não. Stone e Rede são operadas diretamente pela equipe. Confira o pagamento na
                  maquininha antes de registrar a quitação e entregar a motocicleta.
                </p>
              </details>
              <details>
                <summary>O que fazer se os dados não aparecerem?</summary>
                <p>
                  Abra Integrações e use “Verificar conexão”. Se uma consulta falhar, tente
                  novamente e confirme sua conexão com a internet.
                </p>
              </details>
            </CartaoConfiguracao>
          </div>
        </>
      )}
      {aviso && (
        <div className="cfg-save-note" role="status">
          <Icone name="check" size={18} />
          {aviso}
        </div>
      )}
      {modal === 'atividade' && <VisualizarLogs onClose={() => setModal(null)} />}
      {modal === 'inatividade' && (
        <CfgDialog
          icon="clock"
          title="Proteção ao se afastar"
          description="Escolha por quanto tempo a oficina pode ficar parada antes de encerrar esta sessão."
          onClose={() => setModal(null)}
          className="cfg-inactivity-dialog"
        >
          <div className="cfg-inactivity-setting">
            <div className="cfg-inactivity-countdown">
              <span className="cfg-inactivity-countdown-mark">
                <Icone name="clock" size={23} />
              </span>
              <div>
                <small>Tempo escolhido</small>
                <strong>{inatividade ? inatividade : '—'}</strong>
                <span>{inatividade ? 'minutos sem atividade' : 'sem encerramento automático'}</span>
              </div>
            </div>
            <SeletorFiltro
              variant="settings"
              label="Encerrar sessão após"
              value={String(inatividade)}
              options={[
                { value: '10', label: '10 minutos' },
                { value: '20', label: '20 minutos' },
                { value: '30', label: '30 minutos · recomendado' },
                { value: '60', label: '1 hora (máximo)' },
              ]}
              onChange={salvarInatividade}
            />
            <p className="cfg-private-note">
              <Icone name="info" size={17} /> O ajuste é pessoal e acompanha sua conta nos outros
              computadores.
            </p>
          </div>
        </CfgDialog>
      )}
      {(modal === 'stone' || modal === 'rede') && (
        <CfgDialog
          icon="card"
          title={`Terminal ${modal === 'stone' ? 'Stone' : 'Rede'}`}
          description="Este equipamento é operado manualmente pela equipe."
          onClose={() => setModal(null)}
        >
          <p>
            Confira o valor na ordem de serviço, receba diretamente na maquininha e registre o
            pagamento somente após a confirmação do terminal.
          </p>
        </CfgDialog>
      )}
      {modal === 'sair' && (
        <CfgDialog
          icon="exit-arrow"
          title="Encerrar sua sessão?"
          description="Você precisará entrar novamente para acessar a oficina."
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="cfg-button" onClick={() => setModal(null)}>
                Continuar usando
              </button>
              <button
                className="cfg-button primary"
                onClick={() =>
                  void aoSair().catch(() =>
                    setAviso('Não foi possível sair. Verifique a conexão e tente novamente.'),
                  )
                }
              >
                Sair da conta
              </button>
            </>
          }
        >
          <p>Suas preferências sincronizadas serão mantidas na sua conta.</p>
        </CfgDialog>
      )}
    </div>
  );
}
