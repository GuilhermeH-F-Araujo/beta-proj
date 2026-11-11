import {useDadosVivos} from '../../hooks/useDadosVivos';
import {SkeletonLinha} from '../Skeleton';
import VisualizarLogs from "./VisualizarLogs";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../MenuAdmin";
import SeletorFiltro from "../SeletorFiltro";
import { CfgCard, CfgHero, CfgDialog, baixarArquivo } from "./ConfiguracoesUI";
import { alterarMinhaSenha } from "../../services/apiAutenticacao";
import {
  buscarDiagnosticoSistema,
  minutosInatividade,
  salvarInatividadeConta,
  type DiagnosticoSistema,
} from "../../services/configuracoesSistema";
type Props = {
  aba: "seguranca" | "integracoes" | "sobre";
  usuario: { id: string; nome: string; email: string | null } | null;
  onTab: (tab: "notificacoes" | "preferencias") => void;
  onLogout: () => Promise<void>;
};
const formatarData = (data: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(data));
const nomesServicos: Record<string, string> = {
  cadastros: "Cadastros de clientes",
  ordens: "Ordens de serviço",
  notificacoes: "Central de notificações",
  historico: "Histórico de atividades",
};
export default function ConfiguracoesSistema({
  aba,
  usuario,
  onTab,
  onLogout,
}: Props) {
  const navigate = useNavigate();
  const [diagnostico, setDiagnostico] = useState<DiagnosticoSistema | null>(
    null,
  );
  const [verificando, setVerificando] = useState(false);
  const [erroDiagnostico, setErroDiagnostico] = useState("");
  const [modal, setModal] = useState<
    "senha" | "atividade" | "privacidade" | "stone" | "rede" | "sair" | null
  >(null);
  const [inatividade, setInatividade] = useState(() =>
    minutosInatividade(usuario?.id || ""),
  );
  const [aviso, setAviso] = useState("");
  useDadosVivos(async valido=>{const result=await buscarDiagnosticoSistema();if(valido()){setDiagnostico(result);setErroDiagnostico('')}},aba==='integracoes'&&!verificando);
  async function verificar() {
    setVerificando(true);
    setErroDiagnostico("");
    try {
      setDiagnostico(await buscarDiagnosticoSistema());
    } catch (e) {
      setErroDiagnostico(
        e instanceof Error
          ? e.message
          : "Não foi possível verificar os serviços.",
      );
    } finally {
      setVerificando(false);
    }
  }
  useEffect(() => {
    void verificar();
  }, []);
  useEffect(()=>{const atualizar=()=>setInatividade(minutosInatividade(usuario?.id||''));window.addEventListener('session-preferences-change',atualizar);return()=>window.removeEventListener('session-preferences-change',atualizar)},[usuario?.id]);
  const disponiveis = diagnostico?.checks.filter((c) => c.ok).length ?? 0;
  const saudavel = !!diagnostico && disponiveis === diagnostico.checks.length;
  function salvarInatividade(value: string) {
    try {
      salvarInatividadeConta(usuario?.id || "",Number(value));
      setInatividade(Number(value));
      window.dispatchEvent(new Event("session-preferences-change"));
      setAviso("Tempo de inatividade aplicado e sendo salvo na conta.");
    } catch {
      setAviso("Não foi possível salvar o tempo de inatividade.");
    }
  }
  function relatorio() {
    baixarArquivo(
      "estacao-motos-informacoes.txt",
      `ESTAÇÃO MOTOS — INFORMAÇÕES DO SISTEMA\nVersão: ${diagnostico?.version || "1.0.0"}\nVerificação: ${diagnostico ? formatarData(diagnostico.checkedAt) : "Não realizada"}\n${diagnostico?.checks.map((c) => `${nomesServicos[c.id]}: ${c.ok ? "Respondendo" : "Falha de consulta"}`).join("\n") || ""}\n\nEste relatório não contém senhas, chaves, e-mails nem dados de clientes.\n`,
    );
    setAviso(
      "Informações do sistema baixadas. Nenhum dado de cliente foi incluído.",
    );
  }
  const botaoVerificar = (
    <button
      className="cfg-button"
      disabled={verificando}
      onClick={() => void verificar()}
    >
      <Icon name="refresh" size={17} />
      {verificando ? <SkeletonLinha width="90px" height={14}/> : "Verificar conexão"}
    </button>
  );
  return (
    <div className={`cfg-page cfg-system-${aba}`}>
      {aba === "seguranca" && (
        <>
          <CfgHero
            icon="shield"
            title="Segurança e controle de acesso"
            description="Proteja seu acesso, acompanhe alterações e mantenha o controle sobre os dados."
            tone="sage"
          >
            <div className="cfg-hero-tags">
              <span>
                <i className="green" />
                Acesso administrativo autenticado
              </span>
              <span>Configurações da sua conta</span>
            </div>
          </CfgHero>
          <div className="cfg-security-grid">
            <CfgCard
              icon="lock"
              title="Seu acesso"
              description="Uma conta pessoal. Uma senha só sua."
            >
              <div className="cfg-account">
                <div className="cfg-avatar">
                  {usuario?.nome
                    .split(" ")
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("") || "AD"}
                </div>
                <div>
                  <b>{usuario?.nome || "Administrador"}</b>
                  <p>{usuario?.email || "Conta administrativa"}</p>
                  <span className="cfg-badge green">Administrador</span>
                </div>
              </div>
              <div className="cfg-action-row">
                <div>
                  <b>Senha de acesso</b>
                  <p>Confirme sua senha atual antes de trocar.</p>
                </div>
                <button
                  className="cfg-button"
                  onClick={() => setModal("senha")}
                >
                  <Icon name="lock" size={17} />
                  Alterar senha
                </button>
              </div>
              <div className="cfg-action-row">
                <div>
                  <b>Pessoas com acesso</b>
                  <p>Revise quem faz parte da sua equipe.</p>
                </div>
                <button
                  className="cfg-text-button"
                  onClick={() => navigate("/funcionarios")}
                >
                  Revisar equipe <Icon name="right" size={17} />
                </button>
              </div>
            </CfgCard>
            <CfgCard
              icon="clock"
              title="Proteção ao se afastar"
              description="Evite deixar a oficina aberta em um computador compartilhado."
            >
              <div className="cfg-feature-note">
                <span className="cfg-icon">
                  <Icon name="clock" size={24} />
                </span>
                <div>
                  <b>Sair automaticamente por inatividade</b>
                  <p>
                    O sistema avisa um minuto antes. Você pode continuar usando
                    com um clique.
                  </p>
                </div>
              </div>
              <SeletorFiltro
                variant="settings"
                label="Encerrar sessão após"
                value={String(inatividade)}
                options={[
                  { value: "10", label: "10 minutos sem atividade" },
                  { value: "20", label: "20 minutos sem atividade" },
                  { value: "30", label: "30 minutos · recomendado" },
                  { value: "60", label: "1 hora sem atividade" },
                  { value: "0", label: "Não sair automaticamente" },
                ]}
                onChange={salvarInatividade}
              />
              <div className="cfg-private-note">
                <Icon name="info" size={18} />
                A escolha acompanha sua conta. A atividade em outras abas deste
                computador também é considerada.
              </div>
              <button
                className="cfg-text-button cfg-signout"
                onClick={() => setModal("sair")}
              >
                <Icon name="exit-arrow" size={18} />
                Sair desta conta agora
              </button>
            </CfgCard>
            <CfgCard
              icon="activity"
              title="Histórico de atividades"
              description="Consulte alterações que já foram registradas na oficina."
            >
              <div className="cfg-preview-activity">
                <span />
                <div>
                  <b>Ordens e status</b>
                  <p>Edições, exclusões e mudanças de andamento.</p>
                </div>
              </div>
              <div className="cfg-preview-activity">
                <span />
                <div>
                  <b>Clientes arquivados</b>
                  <p>Consulte data e responsável quando disponível.</p>
                </div>
              </div>
              <div className="cfg-card-bottom">
                <small>Filtros de período e exportação em CSV.</small>
                <button
                  className="cfg-button"
                  onClick={() => setModal("atividade")}
                >
                  Consultar atividades <Icon name="right" size={17} />
                </button>
              </div>
            </CfgCard>
            <CfgCard
              icon="users"
              title="Privacidade e dados"
              description="Dados de clientes e equipe merecem atenção."
            >
              <div className="cfg-link-list">
                <button onClick={() => navigate("/clientes")}>
                  <span className="cfg-icon">
                    <Icon name="users" size={20} />
                  </span>
                  <span>
                    <b>Dados dos clientes</b>
                    <small>Consultar e corrigir cadastros</small>
                  </span>
                  <Icon name="right" size={19} />
                </button>
                <button onClick={() => navigate("/funcionarios")}>
                  <span className="cfg-icon">
                    <Icon name="staff" size={20} />
                  </span>
                  <span>
                    <b>Dados da equipe</b>
                    <small>Revisar informações e acessos</small>
                  </span>
                  <Icon name="right" size={19} />
                </button>
                <button onClick={() => setModal("privacidade")}>
                  <span className="cfg-icon">
                    <Icon name="shield" size={20} />
                  </span>
                  <span>
                    <b>Boas práticas de privacidade</b>
                    <small>Orientações para a rotina da oficina</small>
                  </span>
                  <Icon name="right" size={19} />
                </button>
              </div>
            </CfgCard>
          </div>
        </>
      )}
      {aba === "integracoes" && (
        <>
          <CfgHero
            icon="package"
            title="Tudo conectado. Tudo bem explicado."
            description="Confira o que funciona automaticamente e o que é operado pela equipe."
          >
            <div className="cfg-hero-tags">
              <span>
                <i className={saudavel ? "green" : ""} />
                {verificando
                  ? "Verificando os serviços"
                  : diagnostico
                    ? saudavel
                      ? "Serviços consultados com sucesso"
                      : "Há serviços que precisam de atenção"
                    : "Aguardando verificação"}
              </span>
              <span>2 terminais de operação manual</span>
            </div>
          </CfgHero>
          <CfgCard
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
                  <span
                    className={`cfg-badge ${saudavel ? "green" : "neutral"}`}
                  >
                    {verificando
                      ? <SkeletonLinha width="90px" height={14}/>
                      : diagnostico
                        ? `${disponiveis} de ${diagnostico.checks.length} consultas respondendo`
                        : "Conexão não confirmada"}
                  </span>
                </div>
              </div>
              <div className="cfg-service-checks">
                {["cadastros", "ordens", "notificacoes", "historico"].map(
                  (id) => {
                    const check = diagnostico?.checks.find((c) => c.id === id);
                    return (
                      <div key={id}>
                        <Icon
                          name={check?.ok ? "check" : "activity"}
                          size={19}
                        />
                        <span>{nomesServicos[id]}</span>
                        <b className={check?.ok ? "ok" : ""}>
                          {verificando
                            ? <SkeletonLinha width="90px" height={14}/>
                            : check
                              ? check.ok
                                ? "Respondendo"
                                : "Verificar"
                              : "Aguardando"}
                        </b>
                      </div>
                    );
                  },
                )}
              </div>
            </div>
            <div className="cfg-card-bottom">
              <small>
                {diagnostico
                  ? `Última verificação: ${formatarData(diagnostico.checkedAt)}`
                  : "A verificação não altera seus dados."}
              </small>
            </div>
            {erroDiagnostico && (
              <p className="cfg-error" role="alert">
                {erroDiagnostico}
              </p>
            )}
          </CfgCard>
          <div className="cfg-payments-heading">
            <div>
              <h2>Terminais da oficina</h2>
              <p>Identifique os equipamentos e veja como usá-los na rotina.</p>
            </div>
            <span className="cfg-badge neutral">Operação manual</span>
          </div>
          <div className="cfg-payment-grid">
            {(["stone", "rede"] as const).map((nome) => (
              <section className={`cfg-card cfg-payment ${nome}`} key={nome}>
                <div className="cfg-terminal-image">
                  <img
                    src={`/assets/integrations/${nome}.png`}
                    alt={`Terminal ${nome === "stone" ? "Stone" : "Rede"}`}
                  />
                </div>
                <div>
                  <span className="cfg-overline">PAGAMENTOS</span>
                  <h2>{nome === "stone" ? "Stone" : "Rede"}</h2>
                  <p>
                    Receba na maquininha e confira o pagamento antes de liberar
                    a motocicleta.
                  </p>
                  <span className="cfg-badge neutral">
                    Sem cobrança automática
                  </span>
                  <button className="cfg-button" onClick={() => setModal(nome)}>
                    Como funciona <Icon name="right" size={17} />
                  </button>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {aba === "sobre" && (
        <>
          <section className="cfg-brand-hero">
            <div className="cfg-brand-logo">
              <img
                src="/assets/estacao-motos-logo-sidebar.png"
                alt="Estação Motos"
              />
            </div>
            <div>
              <span className="cfg-overline">
                SUA OFICINA. MAIS ORGANIZADA.
              </span>
              <h2>Estação Motos</h2>
              <p>
                Do primeiro atendimento à entrega da motocicleta, tudo o que sua
                equipe precisa em um único lugar.
              </p>
              <div className="cfg-hero-tags">
                <span>Versão {diagnostico?.version || "1.0.0"}</span>
                <span>Plataforma de gestão</span>
              </div>
            </div>
            <span className="cfg-brand-art">
              <Icon name="bike" size={130} />
            </span>
          </section>
          <div className="cfg-about-grid">
            <CfgCard
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
                  <dd>{diagnostico?.version || "1.0.0"}</dd>
                </div>
                <div>
                  <dt>Perfil da sua conta</dt>
                  <dd>Administrador</dd>
                </div>
                <div>
                  <dt>Serviços consultados</dt>
                  <dd>
                    {verificando
                      ? <SkeletonLinha width="90px" height={14}/>
                      : diagnostico
                        ? `${disponiveis} de ${diagnostico.checks.length} respondendo`
                        : "Conexão não confirmada"}
                  </dd>
                </div>
              </dl>
              <button className="cfg-button" onClick={relatorio}>
                <Icon name="download" size={18} />
                Baixar informações do sistema
              </button>
              <p className="cfg-help">
                Sem senhas, chaves ou dados pessoais de clientes.
              </p>
            </CfgCard>
            <CfgCard
              icon="eye"
              title="Feito para facilitar sua rotina"
              description="O sistema se ajusta ao seu jeito de trabalhar."
            >
              <div className="cfg-about-features">
                <div>
                  <Icon name="eye" size={21} />
                  <span>
                    <b>Leitura confortável</b>
                    <small>Ajustes de texto, espessura e espaçamento.</small>
                  </span>
                </div>
                <div>
                  <Icon name="bell" size={21} />
                  <span>
                    <b>Atenção no que importa</b>
                    <small>Avisos configurados evento por evento.</small>
                  </span>
                </div>
                <div>
                  <Icon name="shield" size={21} />
                  <span>
                    <b>Controle administrativo</b>
                    <small>Acesso autenticado e históricos de alteração.</small>
                  </span>
                </div>
              </div>
              <div className="cfg-button-group">
                <button
                  className="cfg-button"
                  onClick={() => onTab("preferencias")}
                >
                  Ajustar leitura
                </button>
                <button
                  className="cfg-button"
                  onClick={() => onTab("notificacoes")}
                >
                  Configurar avisos
                </button>
              </div>
            </CfgCard>
            <CfgCard
              icon="info"
              title="Dúvidas rápidas"
              description="Respostas diretas para situações do dia a dia."
              className="cfg-faq"
            >
              <details>
                <summary>Meus ajustes valem para toda a equipe?</summary>
                <p>
                  As preferências são pessoais e ficam salvas na sua conta. Ao
                  entrar em outro computador, seus ajustes de leitura, tamanhos
                  e avisos são carregados.
                </p>
              </details>
              <details>
                <summary>Posso trabalhar com o som desligado?</summary>
                <p>
                  Sim. Os avisos escolhidos continuam no sino do cabeçalho. O
                  som e o horário de silêncio não apagam as notificações.
                </p>
              </details>
              <details>
                <summary>As maquininhas fazem cobranças pelo sistema?</summary>
                <p>
                  Não. Stone e Rede são operadas diretamente pela equipe.
                  Confira o pagamento na maquininha antes de registrar a
                  quitação e entregar a motocicleta.
                </p>
              </details>
              <details>
                <summary>O que fazer se os dados não aparecerem?</summary>
                <p>
                  Abra Integrações e use “Verificar conexão”. Se uma consulta
                  falhar, tente novamente e confirme sua conexão com a internet.
                </p>
              </details>
            </CfgCard>
          </div>
        </>
      )}
      {aviso && (
        <div className="cfg-save-note" role="status">
          <Icon name="check" size={18} />
          {aviso}
        </div>
      )}
      {modal === "senha" && <SenhaDialog onClose={() => setModal(null)} />}
      {modal === "atividade" && (
        <VisualizarLogs onClose={() => setModal(null)} />
      )}
      {modal === "privacidade" && (
        <CfgDialog
          icon="shield"
          title="Cuidar dos dados faz parte do serviço"
          description="Práticas simples para o dia a dia da oficina."
          onClose={() => setModal(null)}
        >
          <div className="cfg-guide-list">
            {[
              [
                "Peça somente o necessário",
                "Mantenha apenas os dados usados no atendimento. Evite copiar informações para anotações pessoais.",
              ],
              [
                "Confira antes de compartilhar",
                "Documentos e informações do cliente devem ser enviados somente para a pessoa correta.",
              ],
              [
                "Revise os acessos",
                "Mantenha contas individuais e remova o acesso de quem não faz mais parte da equipe.",
              ],
              [
                "Atenda solicitações com cuidado",
                "Confirme a identidade antes de consultar, corrigir ou encaminhar dados. Avalie obrigações de retenção antes de excluir registros.",
              ],
            ].map(([title, body], i) => (
              <div key={title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{title}</b>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </CfgDialog>
      )}
      {(modal === "stone" || modal === "rede") && (
        <CfgDialog
          icon="card"
          title={`Terminal ${modal === "stone" ? "Stone" : "Rede"}`}
          description="Este equipamento é operado manualmente pela equipe."
          onClose={() => setModal(null)}
        >
          <div className="cfg-terminal-guide">
            <img
              src={`/assets/integrations/${modal}.png`}
              alt="Terminal de pagamento"
              className={modal === "rede" ? "cfg-rede-product" : undefined}
            />
            <div className="cfg-guide-list">
              {[
                [
                  "Confira o valor",
                  "Verifique o total da OS e combine a forma de pagamento com o cliente.",
                ],
                [
                  "Receba no terminal",
                  "Faça a cobrança diretamente na maquininha e aguarde a aprovação.",
                ],
                [
                  "Registre e confira",
                  "Atualize o pagamento na OS somente depois da confirmação. Pagamento pendente exige autorização do administrador para entregar.",
                ],
              ].map(([title, body], i) => (
                <div key={title}>
                  <span>{i + 1}</span>
                  <div>
                    <b>{title}</b>
                    <p>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="cfg-inline-info">
            <Icon name="info" size={18} />
            <p>
              Não são armazenadas credenciais nem dados de cartão nesta tela.
            </p>
          </div>
        </CfgDialog>
      )}
      {modal === "sair" && (
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
                  void onLogout().catch(() =>
                    setAviso(
                      "Não foi possível sair. Verifique sua conexão e tente novamente.",
                    ),
                  )
                }
              >
                Sair da conta
              </button>
            </>
          }
        >
          <p>Suas preferências já sincronizadas serão mantidas na sua conta.</p>
        </CfgDialog>
      )}
    </div>
  );
}
function SenhaDialog({ onClose }: { onClose: () => void }) {
  const [atual, setAtual] = useState(""),
    [nova, setNova] = useState(""),
    [confirmacao, setConfirmacao] = useState(""),
    [erro, setErro] = useState(""),
    [sucesso, setSucesso] = useState(false),
    [ocupado, setOcupado] = useState(false),
    [visivel, setVisivel] = useState(false);
  const regras = [
    ["8 caracteres ou mais", nova.length >= 8],
    ["Letra maiúscula e minúscula", /[A-Z]/.test(nova) && /[a-z]/.test(nova)],
    ["Número e símbolo", /\d/.test(nova) && /[^\w\s]/.test(nova)],
  ] as const;
  async function salvar(event: FormEvent) {
    event.preventDefault();
    setErro("");
    if (nova !== confirmacao) {
      setErro("A confirmação precisa ser igual à nova senha.");
      return;
    }
    if (nova === atual) {
      setErro("Escolha uma senha diferente da atual.");
      return;
    }
    setOcupado(true);
    try {
      await alterarMinhaSenha(atual, nova);
      setSucesso(true);
      setAtual("");
      setNova("");
      setConfirmacao("");
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Não foi possível alterar sua senha.",
      );
    } finally {
      setOcupado(false);
    }
  }
  return (
    <CfgDialog
      icon="lock"
      title="Alterar senha de acesso"
      description="Confirme sua identidade e escolha uma senha exclusiva."
      onClose={() => {
        if (!ocupado) onClose();
      }}
      footer={
        sucesso ? (
          <button className="cfg-button" onClick={onClose}>
            Concluir
          </button>
        ) : (
          <>
            <button className="cfg-button" disabled={ocupado} onClick={onClose}>
              Cancelar
            </button>
            <button
              className="cfg-button primary"
              type="submit"
              form="cfg-password-form"
              disabled={
                ocupado || !atual || !confirmacao || !regras.every((r) => r[1])
              }
            >
              {ocupado ? "Salvando…" : "Salvar nova senha"}
            </button>
          </>
        )
      }
    >
      {sucesso ? (
        <div className="cfg-empty cfg-success">
          <Icon name="check" size={44} />
          <b>Senha alterada com sucesso</b>
          <p>Use a nova senha no próximo acesso.</p>
        </div>
      ) : (
        <form
          id="cfg-password-form"
          className="cfg-password-form"
          onSubmit={(event) => void salvar(event)}
        >
          <label>
            Senha atual
            <input
              autoFocus
              type={visivel ? "text" : "password"}
              autoComplete="current-password"
              value={atual}
              maxLength={256}
              required
              onChange={(e) => setAtual(e.target.value)}
            />
          </label>
          <label>
            Nova senha
            <input
              type={visivel ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={nova}
              required
              onChange={(e) => setNova(e.target.value)}
            />
          </label>
          <div className="cfg-password-rules">
            {regras.map(([label, ok]) => (
              <span className={ok ? "valid" : ""} key={label}>
                <Icon name={ok ? "check" : "info"} size={15} />
                {label}
              </span>
            ))}
          </div>
          <label>
            Confirmar nova senha
            <input
              type={visivel ? "text" : "password"}
              autoComplete="new-password"
              value={confirmacao}
              minLength={8}
              maxLength={128}
              required
              onChange={(e) => setConfirmacao(e.target.value)}
            />
          </label>
          <label className="cfg-checkbox">
            <input
              type="checkbox"
              checked={visivel}
              onChange={(e) => setVisivel(e.target.checked)}
            />
            Mostrar senhas enquanto preencho
          </label>
          {erro && (
            <p role="alert" className="cfg-error">
              {erro}
            </p>
          )}
        </form>
      )}
    </CfgDialog>
  );
}
