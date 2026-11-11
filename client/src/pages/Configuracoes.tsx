import type {ReactNode} from 'react';
import {SkeletonLinha} from '../components/Skeleton';
import {useDadosVivos} from '../hooks/useDadosVivos';
import {useEstadoRascunho} from '../hooks/useEstadoRascunho';
import {limparRascunho,lerRascunho} from '../services/rascunhos';
import CampoCep from '../components/CampoCep';
import { selecionarAbaConfiguracao } from "../services/navegacaoConfiguracao";
import NavegacaoConfiguracao from "../components/configuracoes/NavegacaoConfiguracao";
import StatusPreferenciasConta from "../components/configuracoes/StatusPreferenciasConta";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../components/MenuAdmin";
import { useUsuarioAdmin } from "../components/RotaProtegida";
import ModalNovoUsuario from "../components/ModalNovoUsuario";
import NotificacoesConfiguracoes from "../components/configuracoes/NotificacoesConfiguracoes";
import ConfiguracoesSistema from "../components/configuracoes/ConfiguracoesSistema";
import "../components/configuracoes/configuracoes-sistema.css";
import { logout } from "../services/apiAutenticacao";
import { buscarFuncionarios, type Funcionario } from "../services/funcionarios";
import "./ordens-servico.css";
import "./configuracoes.css";
import "./configuracoes-refinadas.css";
import "./configuracoes-workspace.css";
import "./notificacoes-workspace.css";
import {
  lerPreferenciasLeitura,
  salvarPreferenciasLeitura,
  normalizarLeitura,
  type PreferenciasLeitura,
} from "../services/preferenciasGlobais";

type Aba =
  | "geral"
  | "preferencias"
  | "seguranca"
  | "integracoes"
  | "sobre"
  | "notificacoes";
type Oficina = {
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  cep: string;
  numero?: string;
  complemento?: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  semana: string;
  sabado: string;
};
type Preferencias = PreferenciasLeitura;
const tabs: { id: Aba; label: string; icon: string; help: string }[] = [
  {
    id: "geral",
    label: "Geral",
    icon: "settings",
    help: "Dados e rotina da oficina",
  },
  {
    id: "preferencias",
    label: "Preferências",
    icon: "sliders",
    help: "Ajustes de uso e acessibilidade",
  },
  {
    id: "seguranca",
    label: "Segurança",
    icon: "lock",
    help: "Proteção e controle de acesso",
  },
  {
    id: "integracoes",
    label: "Integrações",
    icon: "package",
    help: "Serviços conectados ao sistema",
  },
  {
    id: "notificacoes",
    label: "Notificações",
    icon: "bell",
    help: "Escolha quais avisos merecem sua atenção",
  },
  {
    id: "sobre",
    label: "Sobre o sistema",
    icon: "info",
    help: "Versão e informações do produto",
  },
];
const initialShop: Oficina = {
  nome: "Estação Motos",
  cnpj: "",
  telefone: "",
  email: "",
  cep: "",
  endereco: "",
  bairro: "",
  cidade: "",
  estado: "",
  semana: "",
  sabado: "",
};
const initialPrefs: Preferencias = normalizarLeitura();
const readStore = <T,>(key: string, fallback: T): T => {
  try {
    const data = localStorage.getItem(key);
    return data ? { ...fallback, ...JSON.parse(data) } : fallback;
  } catch {
    return fallback;
  }
};
const readPreferences = lerPreferenciasLeitura;
const statusLabel = (status: Funcionario["situacao"]) =>
  status === "ativo"
    ? "Ativo"
    : status === "ferias"
      ? "Em férias"
      : status === "afastado"
        ? "Afastado"
        : status === "desligado"
          ? "Desligado"
          : "Sem status";
const cargoLabel = (cargo: string) =>
  /admin/i.test(cargo)
    ? "Administrador"
    : /geren/i.test(cargo)
      ? "Gerente"
      : /mec/i.test(cargo)
        ? "Mecânico"
        : cargo || "Colaborador";

export default function Configuracoes() {
  const user = useUsuarioAdmin();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const escolherAba = (raw: string | null): Aba =>
    selecionarAbaConfiguracao(raw, !!user?.acesso.administrador);
  const [prefSection, setPrefSection] = useState("leitura");
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<Aba>(() =>
    escolherAba(searchParams.get("aba")),
  );
  useEffect(() => {
    const next = escolherAba(searchParams.get("aba"));
    setTab(next);
  }, [searchParams, user?.acesso.administrador]);
  const [shopDraft, setShop] = useEstadoRascunho<Oficina>('oficina','shop',() =>
    readStore("estacao-config-oficina", initialShop),
  );
  const [prefs, setPrefs] = useState<Preferencias>(readPreferences);
  const [editSection, setEditSection] = useState<
    "perfil" | "endereco" | "horarios" | null
  >(null);
  const [shopSaved,setShopSaved]=useState<Oficina>(()=>readStore('estacao-config-oficina',initialShop));
  const shop=editSection?shopDraft:shopSaved;
  useEffect(()=>{const refresh=(event:StorageEvent)=>{if(event.key==='estacao-config-oficina')setShopSaved(readStore('estacao-config-oficina',initialShop))};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh)},[]);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const [staff, setStaff] = useState<Funcionario[]>([]);
  const [staffStatus, setStaffStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Todos os cargos");
  const [statusFilter, setStatusFilter] = useState("Todos os status");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!user?.acesso.administrador) return;
    const controller = new AbortController();
    buscarFuncionarios(
      new Intl.DateTimeFormat("sv-SE", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
      })
        .format(new Date())
        .slice(0, 7),
      controller.signal,
    )
      .then((result) => {
        setStaff(result.itens);
        setStaffStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStaffStatus("error");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const atualizar = () => setPrefs(lerPreferenciasLeitura());
    const storage = (event: StorageEvent) => {
      if (event.key === "estacao-config-preferencias") atualizar();
    };
    window.addEventListener("app-preferences-change", atualizar);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("app-preferences-change", atualizar);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(""), 2600);
    return () => window.clearTimeout(timer);
  }, [saved]);
  useEffect(() => {
    if (!editSection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editSection]);

  useDadosVivos(async valido=>{const result=await buscarFuncionarios(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7));if(valido()){setStaff(result.itens);setStaffStatus('ready')}},!!user?.acesso.administrador);
  const openEditor = (section: "perfil" | "endereco" | "horarios") => {
    setShop(lerRascunho("oficina","shop",readStore("estacao-config-oficina",initialShop)));
    setEditSection(section);
  };
  const closeEditor = () => {
    setEditSection(null);
  };
  const saveShop = () => {
    localStorage.setItem("estacao-config-oficina", JSON.stringify(shopDraft));
    setShopSaved(shopDraft);
    limparRascunho("oficina");
    setEditSection(null);
    setSaved("Dados da oficina salvos neste dispositivo.");
  };
  const updatePrefs = (next: Preferencias) => {
    setPrefs(next);
    salvarPreferenciasLeitura(next);
  };
  const filtered = useMemo(
    () =>
      staff.filter((person) => {
        const role = cargoLabel(person.cargo);
        const active = person.situacao === "ativo";
        return (
          (!query ||
            `${person.nome} ${person.email ?? ""} ${role}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (roleFilter === "Todos os cargos" || role === roleFilter) &&
          (statusFilter === "Todos os status" ||
            (statusFilter === "Ativos" ? active : !active))
        );
      }),
    [staff, query, roleFilter, statusFilter],
  );
  const userCounts = useMemo(
    () => ({
      total: staff.length,
      admin: staff.filter((p) => /admin/i.test(p.cargo)).length,
      mechanic: staff.filter((p) => /mec/i.test(p.cargo)).length,
      manager: staff.filter((p) => /geren/i.test(p.cargo)).length,
    }),
    [staff],
  );
  const pageSize = 7,
    pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)),
    rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };
  const changeTab = (id: Aba) => {
    setTab(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("aba", id);
      return next;
    });
    setPage(1);
  };

  useEffect(() => {
    if (
      user &&
      !user.acesso.administrador &&
      !["preferencias", "notificacoes"].includes(tab)
    )
      setTab("preferencias");
  }, [user, tab]);
  if (
    user &&
    !user.acesso.administrador &&
    !["preferencias", "notificacoes"].includes(tab)
  )
    return null;
  return (
    <div className="orders-viewport settings-app">
      
      <div className="orders-main">
        
        <main className="settings-content">
          <NavegacaoConfiguracao
            id="settings-main"
            label="Seções de configuração"
            className="settings-tabs"
            value={tab}
            onChange={changeTab}
            options={tabs
              .filter(
                (item) =>
                  user?.acesso.administrador ||
                  ["preferencias", "notificacoes"].includes(item.id),
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
              <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
              <p>{tabs.find((item) => item.id === tab)?.help}.</p>
            </div>
            {(
              ["preferencias", "notificacoes", "seguranca"] as string[]
            ).includes(tab) && <StatusPreferenciasConta />}
          </section>

          {tabs
            .filter(
              (item) =>
                item.id !== tab &&
                (user?.acesso.administrador ||
                  ["preferencias", "notificacoes"].includes(item.id)),
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
            id={`settings-main-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`settings-main-tab-${tab}`}
          >
            {tab === "geral" && (
              <div className="settings-general-grid">
                <article className="settings-card settings-company">
                  <CardHeading
                    icon="camera"
                    title="Perfil da oficina"
                    note="Informações principais do negócio"
                    action={() => openEditor("perfil")}
                    actionLabel="Editar dados"
                  />
                  <div className="settings-company-summary">
                    <div className="settings-brandmark">
                      <img
                        src="/assets/estacao-motos-logo-sidebar.png"
                        alt="Estação Motos"
                      />
                    </div>
                    <dl>
                      {[
                        ["Nome da oficina", shop.nome],
                        ["CNPJ", shop.cnpj],
                        ["Telefone", shop.telefone],
                        ["E-mail", shop.email],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>
                            {value || (
                              <span className="settings-muted">
                                Não informado
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </article>
                <article className="settings-card">
                  <CardHeading
                    icon="pin"
                    title="Localização"
                    note="Endereço cadastrado para a oficina"
                    action={() => openEditor("endereco")}
                    actionLabel="Editar endereço"
                  />
                  <dl className="settings-detail-list">
                    {[
                      ["CEP", shop.cep],
                      ["Endereço", shop.endereco],
                      ["Bairro", shop.bairro],
                      ["Cidade", shop.cidade],
                      ["Estado", shop.estado],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          {value || (
                            <span className="settings-muted">
                              Não informado
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
                <article className="settings-card">
                  <CardHeading
                    icon="clock"
                    title="Horário de funcionamento"
                    note="Deixe claro quando a oficina atende"
                    action={() => openEditor("horarios")}
                    actionLabel="Editar horários"
                  />
                  <div className="settings-hours">
                    {[
                      ["Segunda a sexta", shop.semana],
                      ["Sábado", shop.sabado],
                      ["Domingo", "Fechado"],
                    ].map(([day, hours]) => (
                      <div key={day}>
                        <span>{day}</span>
                        <strong className={hours === "Fechado" ? "closed" : ""}>
                          {hours ||
                            (day === "Domingo" ? "Fechado" : "Não informado")}
                        </strong>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="settings-card">
                  <CardHeading
                    icon="check"
                    title="Resumo da conta"
                    note="Acesso e recursos cadastrados"
                  />
                  <div className="settings-account-list">
                    <SummaryRow
                      icon="users"
                      label="Usuários cadastrados"
                      value={
                        staffStatus === "ready"
                          ? String(staff.length)
                          : staffStatus === "error"
                            ? "Indisponível"
                            : <SkeletonLinha width="32px" height={14}/>
                      }
                      detail="Consulte a lista completa em Funcionários"
                    />
                    <SummaryRow
                      icon="lock"
                      label="Acesso administrativo"
                      value="Protegido"
                      detail="A autenticação é verificada pelo servidor"
                    />
                    <SummaryRow
                      icon="package"
                      label="Dados da oficina"
                      value="Editável"
                      detail="Salvos neste dispositivo"
                    />
                  </div>
                </article>
              </div>
            )}

            {tab === "preferencias" && (
              <div className="settings-preferences-grid settings-preferences-redesigned">
                <aside className="settings-workspace-nav">
                  <span className="settings-workspace-label">
                    PERSONALIZAR O USO
                  </span>
                  <NavegacaoConfiguracao
                    id="pref-editor"
                    label="Áreas de preferências"
                    value={prefSection}
                    onChange={setPrefSection}
                    vertical
                    options={[
                      {
                        value: "leitura",
                        label: "Leitura",
                        description: "Texto e acessibilidade",
                        icon: "eye",
                      },
                      {
                        value: "interface",
                        label: "Interface",
                        description: "Menu, cabeçalho e janelas",
                        icon: "sliders",
                      },
                      {
                        value: "rotina",
                        label: "Rotina",
                        description: "Controles e painel inicial",
                        icon: "dashboard",
                      },
                    ]}
                  />
                  <div className="settings-workspace-note">
                    <Icon name="lock" size={17} />
                    <p>Aplicado à sua conta, em todas as páginas.</p>
                  </div>
                </aside>

                <section
                  className="settings-card settings-reading-card"
                  hidden={prefSection !== "leitura"}
                  id="pref-editor-panel-leitura"
                  role="tabpanel"
                  aria-labelledby="pref-editor-tab-leitura"
                >
                  <CardHeading
                    icon="eye"
                    title="Leitura e acessibilidade"
                    note="Ajustes de texto aplicados a todas as páginas."
                  />
                  <div className="settings-section-body">
                    <div className="settings-reading-controls">
                      <PreferenceRange
                        title="Tamanho do conteúdo"
                        description="Texto, cartões e campos. A navegação tem seu próprio ajuste."
                        min={90}
                        max={150}
                        step={5}
                        value={prefs.tamanhoTexto}
                        valueLabel={`${prefs.tamanhoTexto}%`}
                        onChange={(value) =>
                          updatePrefs({ ...prefs, tamanhoTexto: value })
                        }
                      />
                      <PreferenceRange
                        title="Espessura das letras"
                        description="Deixe os caracteres mais leves ou mais marcados."
                        min={400}
                        max={700}
                        step={50}
                        value={prefs.pesoTexto}
                        valueLabel={pesoLabel(prefs.pesoTexto)}
                        onChange={(value) =>
                          updatePrefs({ ...prefs, pesoTexto: value })
                        }
                      />
                      <PreferenceRange
                        title="Espaço entre linhas"
                        description="Mais espaço pode ajudar a acompanhar textos longos."
                        min={12}
                        max={18}
                        step={1}
                        value={prefs.espacoLinhas}
                        valueLabel={`${(prefs.espacoLinhas / 10).toFixed(1).replace(".", ",")}×`}
                        onChange={(value) =>
                          updatePrefs({ ...prefs, espacoLinhas: value })
                        }
                      />
                    </div>
                    <div className="settings-reading-bottom">
                      <div className="settings-reading-preview">
                        <span>
                          <Icon name="eye" size={17} />
                          Sua leitura, na prática{" "}
                          <small>Aplicada em todo o sistema</small>
                        </span>
                        <div
                          className="settings-preview-sample"
                          aria-label="Exemplo de leitura de um atendimento"
                          style={{
                            fontWeight: prefs.pesoTexto,
                            lineHeight: prefs.espacoLinhas / 10,
                          }}
                        >
                          <span className="settings-preview-avatar">
                            <Icon name="bike" size={23} />
                          </span>
                          <div>
                            <strong>João da Silva</strong>
                            <span>Honda CG 160</span>
                            <small>Revisão de freios</small>
                          </div>
                          <span className="settings-preview-status">
                            <i />
                            Em andamento
                          </span>
                        </div>
                      </div>
                      <div className="settings-toggle-list settings-access-toggles">
                        <ToggleRow
                          title="Contraste reforçado"
                          description="Destaca um pouco mais textos, contornos e controles."
                          checked={prefs.contraste}
                          onChange={(value) =>
                            updatePrefs({ ...prefs, contraste: value })
                          }
                        />
                        <ToggleRow
                          title="Reduzir animações"
                          description="Diminui movimentos e transições na tela."
                          checked={prefs.reduzirMovimento}
                          onChange={(value) =>
                            updatePrefs({ ...prefs, reduzirMovimento: value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </section>
                <section
                  className="settings-card settings-interface-card"
                  hidden={prefSection !== "interface"}
                  id="pref-editor-panel-interface"
                  role="tabpanel"
                  aria-labelledby="pref-editor-tab-interface"
                >
                  <CardHeading
                    icon="sliders"
                    title="Tamanho da interface"
                    note="Controle a navegação e as janelas de forma independente."
                  />
                  <div className="settings-section-body">
                    <div className="settings-independent-scales">
                      <PreferenceRange
                        title="Menu lateral"
                        description="Aumente somente a navegação fixa da esquerda."
                        min={90}
                        max={140}
                        step={5}
                        value={prefs.tamanhoMenu}
                        valueLabel={`${prefs.tamanhoMenu}%`}
                        onChange={(value) =>
                          updatePrefs({ ...prefs, tamanhoMenu: value })
                        }
                      />
                      <PreferenceRange
                        title="Cabeçalho"
                        description="Ajuste a barra superior e seus atalhos."
                        min={90}
                        max={130}
                        step={5}
                        value={prefs.tamanhoCabecalho}
                        valueLabel={`${prefs.tamanhoCabecalho}%`}
                        onChange={(value) =>
                          updatePrefs({ ...prefs, tamanhoCabecalho: value })
                        }
                      />
                      <PreferenceRange
                        title="Modais e janelas"
                        description="Escolha o tamanho das janelas de cadastro, edição e consulta."
                        min={90}
                        max={150}
                        step={5}
                        value={prefs.tamanhoModais}
                        valueLabel={`${prefs.tamanhoModais}%`}
                        onChange={(value) =>
                          updatePrefs({ ...prefs, tamanhoModais: value })
                        }
                      />
                    </div>
                  </div>
                </section>
                <section
                  className="settings-card settings-routine-card"
                  hidden={prefSection !== "rotina"}
                  id="pref-editor-panel-rotina"
                  role="tabpanel"
                  aria-labelledby="pref-editor-tab-rotina"
                >
                  <CardHeading
                    icon="dashboard"
                    title="Rotina de uso"
                    note="Defina os controles e o período inicial do painel."
                  />
                  <div className="settings-section-body">
                    <div className="settings-routine-options">
                      <div className="settings-preference-block">
                        <div>
                          <b>Tamanho dos controles</b>
                          <small>
                            Escolha botões e campos mais amplos ou compactos.
                          </small>
                        </div>
                        <div className="settings-segmented">
                          <button
                            className={
                              prefs.densidade === "confortavel"
                                ? "selected"
                                : ""
                            }
                            aria-pressed={prefs.densidade === "confortavel"}
                            onClick={() =>
                              updatePrefs({
                                ...prefs,
                                densidade: "confortavel",
                              })
                            }
                          >
                            <Icon name="check" size={15} />
                            Maior e confortável
                          </button>
                          <button
                            className={
                              prefs.densidade === "compacta" ? "selected" : ""
                            }
                            aria-pressed={prefs.densidade === "compacta"}
                            onClick={() =>
                              updatePrefs({ ...prefs, densidade: "compacta" })
                            }
                          >
                            Compacto
                          </button>
                        </div>
                      </div>
                      <div className="settings-preference-block">
                        <div>
                          <b>Período inicial do Dashboard</b>
                          <small>
                            Escolha o intervalo que aparece ao abrir o painel.
                          </small>
                        </div>
                        <div className="settings-period-choices">
                          {(
                            [
                              ["diario", "Hoje", "Movimento do dia"],
                              ["semanal", "Últimos 7 dias", "Resumo da semana"],
                              ["mensal", "Este mês", "Visão do mês"],
                            ] as const
                          ).map(([id, label, description]) => (
                            <button
                              key={id}
                              className={
                                prefs.periodoDashboard === id ? "selected" : ""
                              }
                              aria-pressed={prefs.periodoDashboard === id}
                              onClick={() =>
                                updatePrefs({ ...prefs, periodoDashboard: id })
                              }
                            >
                              <span className="settings-period-radio">
                                {prefs.periodoDashboard === id && <i />}
                              </span>
                              <span>
                                <b>{label}</b>
                                <small>{description}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="settings-preferences-footer">
                      <span>
                        <Icon name="check" size={15} />
                        Suas preferências acompanham sua conta em outros
                        computadores.
                      </span>
                      <button
                        className="settings-link-button"
                        onClick={() => updatePrefs(initialPrefs)}
                      >
                        Restaurar padrão
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {tab === "notificacoes" && <NotificacoesConfiguracoes />}

            {(["seguranca", "integracoes", "sobre"] as string[]).includes(
              tab,
            ) && (
              <ConfiguracoesSistema
                aba={tab as "seguranca" | "integracoes" | "sobre"}
                usuario={user}
                onTab={changeTab}
                onLogout={signOut}
              />
            )}
          </div>
          {saved && (
            <div className="settings-toast" role="status">
              <Icon name="check" size={15} />
              {saved}
              <button aria-label="Fechar aviso" onClick={() => setSaved("")}>
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
          {employeeModalOpen && (
            <ModalNovoUsuario
              employeeOnly
              initialRole="Mecânico"
              onClose={() => setEmployeeModalOpen(false)}
              onCreated={() => {
                setStaffStatus("loading");
                buscarFuncionarios(
                  new Intl.DateTimeFormat("sv-SE", {
                    timeZone: "America/Sao_Paulo",
                    year: "numeric",
                    month: "2-digit",
                  })
                    .format(new Date())
                    .slice(0, 7),
                )
                  .then((result) => {
                    setStaff(result.itens);
                    setStaffStatus("ready");
                  })
                  .catch(() => setStaffStatus("error"));
                setSaved("Funcionário cadastrado com sucesso.");
              }}
            />
          )}
          {editSection && (
            <div
              className="settings-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeEditor();
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
                    <Icon
                      name={
                        editSection === "horarios"
                          ? "clock"
                          : editSection === "endereco"
                            ? "pin"
                            : "settings"
                      }
                      size={21}
                    />
                  </span>
                  <div>
                    <span className="settings-modal-overline">
                      ESTAÇÃO MOTOS <i /> CONFIGURAÇÕES
                    </span>
                    <h2 id="settings-edit-title">
                      {editSection === "horarios"
                        ? "Horário de funcionamento"
                        : editSection === "endereco"
                          ? "Endereço da oficina"
                          : "Dados da oficina"}
                    </h2>
                    <p>
                      {editSection === "horarios"
                        ? "Informe os horários que a equipe deve considerar no atendimento."
                        : editSection === "endereco"
                          ? "Mantenha o endereço da unidade atualizado."
                          : "Atualize as informações que identificam a sua oficina."}
                    </p>
                  </div>
                  <button
                    className="settings-icon-button"
                    aria-label="Fechar"
                    onClick={closeEditor}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </header>
                <div className="settings-modal-body">
                  <div className="settings-modal-context">
                    <span>
                      <Icon
                        name={
                          editSection === "horarios"
                            ? "clock"
                            : editSection === "endereco"
                              ? "pin"
                              : "info"
                        }
                        size={17}
                      />
                    </span>
                    <div>
                      <b>
                        {editSection === "horarios"
                          ? "Expediente da oficina"
                          : editSection === "endereco"
                            ? "Localização e contato"
                            : "Identificação e contato"}
                      </b>
                      <small>
                        Preencha apenas as informações que deseja manter
                        registradas.
                      </small>
                    </div>
                  </div>
                  <div className="settings-modal-fields">
                    {editSection === "perfil" && (
                      <>
                        <h3>Informações principais</h3>
                        <div className="settings-form-grid">
                          {field("Nome da oficina", "nome")}
                          {field("CNPJ", "cnpj")}
                          {field("Telefone", "telefone", "tel")}
                          {field("E-mail de contato", "email", "email")}
                        </div>
                      </>
                    )}
                    {editSection === "endereco" && (
                      <>
                        <h3>Onde a equipe atende</h3>
                        <div className="settings-form-grid">
                          <label className="settings-field"><span>CEP</span><CampoCep value={shop.cep} onChange={v=>setShop(p=>({...p,cep:v}))} onEndereco={d=>setShop(p=>({...p,endereco:d.rua,bairro:d.bairro,cidade:d.cidade,estado:d.estado}))}/></label>
                          {field("Endereço", "endereco")}
                          {field("Número", "numero")}{field("Complemento (opcional)", "complemento")}{field("Bairro", "bairro")}
                          {field("Cidade", "cidade")}
                          {field("Estado", "estado")}
                        </div>
                      </>
                    )}
                    {editSection === "horarios" && (
                      <>
                        <h3>Horários de atendimento</h3>
                        <div className="settings-form-grid">
                          {field("Segunda a sexta", "semana")}
                          {field("Sábado", "sabado")}
                        </div>
                        <div className="settings-hours-tip">
                          <Icon name="info" size={16} />
                          Use o formato “08:00 às 18:00”. Para um dia fechado,
                          escreva “Fechado”.
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <footer className="settings-modal-footer">
                  <span>
                    <Icon name="lock" size={14} />
                    Salvo neste dispositivo
                  </span>
                  <div>
                    <button className="settings-button" onClick={closeEditor}>
                      Cancelar
                    </button>
                    <button className="settings-primary" onClick={saveShop}>
                      <Icon name="check" size={16} />
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

  function field(label: string, key: keyof Oficina, type = "text") {
    const icon =
      key === "email"
        ? "mail"
        : key === "telefone"
          ? "phone"
          : key === "cep" ||
              key === "endereco" ||
              key === "bairro" ||
              key === "cidade" ||
              key === "estado"
            ? "pin"
            : key === "semana" || key === "sabado"
              ? "clock"
              : key === "cnpj"
                ? "landmark"
                : "settings";
    const placeholders: Partial<Record<keyof Oficina, string>> = {
      nome: "Nome utilizado nas telas e documentos",
      cnpj: "00.000.000/0000-00",
      telefone: "(11) 00000-0000",
      email: "contato@oficina.com.br",
      cep: "00000-000",
      endereco: "Rua e número",
      bairro: "Bairro",
      cidade: "Cidade",
      estado: "UF",
      semana: "Ex.: 08:00 às 18:00",
      sabado: "Ex.: 08:00 às 13:00",
    };
    return (
      <label className="settings-field" key={key}>
        <span>
          <Icon name={icon} size={14} />
          {label}
        </span>
        <input
          type={type}
          value={shop[key]}
          placeholder={placeholders[key]}
          autoFocus={key === "nome" || key === "cep" || key === "semana"}
          onChange={(e) => setShop({ ...shop, [key]: e.target.value })}
        />
      </label>
    );
  }
}

function pesoLabel(value: number) {
  return value <= 400
    ? "Regular"
    : value <= 500
      ? "Médio"
      : value <= 600
        ? "Forte"
        : "Extra forte";
}
function PreferenceRange({
  title,
  description,
  min,
  max,
  step,
  value,
  valueLabel,
  onChange,
}: {
  title: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  const progress = `${((value - min) / (max - min)) * 100}%`;
  const icon =
    title === "Tamanho do conteúdo"
      ? "eye"
      : title === "Menu lateral"
        ? "dashboard"
        : title === "Cabeçalho"
          ? "sliders"
          : title === "Modais e janelas"
            ? "package"
            : title === "Espessura das letras"
              ? "pencil"
              : "activity";
  return (
    <div className="settings-range-control">
      <div className="settings-range-top">
        <span className="settings-range-symbol">
          <Icon name={icon} size={20} />
        </span>
        <span>
          <b>{title}</b>
          <small>{description}</small>
        </span>
      </div>
      <div className="settings-range-adjust">
        <button
          type="button"
          aria-label={`Diminuir ${title.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={title}
          aria-valuetext={valueLabel}
          style={{ "--slider-progress": progress } as React.CSSProperties}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          aria-label={`Aumentar ${title.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
        >
          +
        </button>
        <output aria-live="off">{valueLabel}</output>
      </div>
      <span className="settings-range-ends">
        <small>
          {title === "Espessura das letras"
            ? "Mais leve"
            : title === "Espaço entre linhas"
              ? "Mais junto"
              : "Menor"}
        </small>
        <small>
          {title === "Espessura das letras"
            ? "Mais marcada"
            : title === "Espaço entre linhas"
              ? "Mais espaçado"
              : "Maior"}
        </small>
      </span>
    </div>
  );
}
function CardHeading({
  icon,
  title,
  note,
  action,
  actionLabel,
}: {
  icon: string;
  title: string;
  note?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <header className="settings-card-heading">
      <span className="settings-card-icon">
        <Icon name={icon} size={16} />
      </span>
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {action && (
        <button className="settings-button compact" onClick={action}>
          <Icon name="pencil" size={13} />
          {actionLabel}
        </button>
      )}
    </header>
  );
}
function SummaryRow({
  icon,
  label,
  value,
  detail,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <div className="settings-summary-row">
      <Icon name={icon} size={14} />
      <span>
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <strong>{value}</strong>
    </div>
  );
}
function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="settings-toggle-row">
      <span>
        <b>{title}</b>
        <small>{description}</small>
      </span>
      <button
        type="button"
        className={`settings-switch${checked ? " checked" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </div>
  );
}
