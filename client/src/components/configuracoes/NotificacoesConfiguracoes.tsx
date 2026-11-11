import NavegacaoConfiguracao from "./NavegacaoConfiguracao";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../MenuAdmin";
import SeletorFiltro from "../SeletorFiltro";
import { CfgCard, CfgSwitch } from "./ConfiguracoesUI";
import {
  eventosNotificacao,
  lerConfigNotificacoes,
  salvarConfigNotificacoes,
  padraoNotificacoes,
  type ConfigNotificacoes,
  type EventoNotificacao,
  type RegraEvento,
} from "../../services/preferenciasNotificacoes";
import {
  buscarSomPersonalizadoMeta,
  removerSomPersonalizado,
  salvarSomPersonalizado,
  reproduzirSom,
  pararPreviaSom,
  prepararAudioNotificacoes,
  sonsPredefinidos,
  type SomNotificacao,
  type SomPersonalizadoMeta,
} from "../../services/sonsNotificacao";
export default function NotificacoesConfiguracoes() {
  const [config, setConfig] = useState(lerConfigNotificacoes);
  const [view, setView] = useState("eventos");
  const selecionarArea = (next: string) => {
    window.dispatchEvent(new Event("settings-view-change"));
    setView(next);
  };
  const [grupoFiltro, setGrupoFiltro] = useState("Todos");
  const [arquivo, setArquivo] = useState<SomPersonalizadoMeta | null>(null);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState(false);
  const [feedbackSom, setFeedbackSom] = useState<{
    texto: string;
    erro: boolean;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => {
    let ativo = true;
    buscarSomPersonalizadoMeta()
      .then((meta) => {
        if (ativo) {
          setArquivo(meta);
          if (!meta) {
            const current = configRef.current;
            if (
              current.toque === "personalizado" ||
              Object.values(current.eventos).some(
                (e) => e.toque === "personalizado",
              )
            ) {
              const next = {
                ...current,
                toque:
                  current.toque === "personalizado"
                    ? ("brisa" as const)
                    : current.toque,
                eventos: { ...current.eventos },
              };
              for (const e of eventosNotificacao)
                if (next.eventos[e.id].toque === "personalizado")
                  next.eventos[e.id] = {
                    ...next.eventos[e.id],
                    toque: "padrao",
                  };
              salvarConfigNotificacoes(next);
              setConfig(next);
              setMensagem(
                "Não há áudio personalizado salvo na conta. Foi restaurado o som padrão.",
              );
            }
          }
        }
      })
      .catch((error) => {
        if (ativo) {
          setErro(true);
          setMensagem(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o áudio da sua conta. Tente novamente.",
          );
        }
      });
    return () => {
      ativo = false;
      pararPreviaSom();
    };
  }, []);
  useEffect(() => {
    const atualizar = () => setConfig(lerConfigNotificacoes());
    window.addEventListener("notification-preferences-change", atualizar);
    return () =>
      window.removeEventListener("notification-preferences-change", atualizar);
  }, []);
  function atualizar(next: ConfigNotificacoes) {
    try {
      salvarConfigNotificacoes(next);
      setConfig(next);
      setErro(false);
      setMensagem("Preferências aplicadas e sendo salvas na sua conta.");
    } catch {
      setErro(true);
      setMensagem(
        "Não foi possível salvar. Verifique se o navegador permite armazenamento local.",
      );
    }
  }
  function regra(id: EventoNotificacao, patch: Partial<RegraEvento>) {
    atualizar({
      ...config,
      ativo: patch.som === true ? true : config.ativo,
      eventos: { ...config.eventos, [id]: { ...config.eventos[id], ...patch } },
    });
    if (patch.som === true) void prepararAudioNotificacoes(true);
  }
  async function testar(som: SomNotificacao = config.toque) {
    setErro(false);
    setFeedbackSom(null);
    try {
      await reproduzirSom(som, true, config.volume);
      setFeedbackSom({
        texto:
          config.volume === 0
            ? "Volume em 0%. A prévia está sem som."
            : "Prévia iniciada no volume escolhido.",
        erro: false,
      });
      setMensagem(
        "Prévia reproduzida. O volume também depende do seu computador.",
      );
    } catch (e) {
      setErro(true);
      setFeedbackSom({
        texto:
          e instanceof Error ? e.message : "Não foi possível tocar o áudio.",
        erro: true,
      });
      setMensagem(
        e instanceof Error ? e.message : "Não foi possível tocar o áudio.",
      );
    }
  }
  async function enviar(file?: File) {
    if (!file) return;
    setOcupado(true);
    setErro(false);
    setMensagem("Verificando formato, duração e conteúdo do áudio…");
    try {
      const meta = await salvarSomPersonalizado(file);
      setArquivo(meta);
      atualizar({ ...configRef.current, toque: "personalizado" });
      setMensagem(
        "Áudio verificado e salvo na sua conta. Escolha os eventos que devem usá-lo.",
      );
    } catch (e) {
      setErro(true);
      setMensagem(e instanceof Error ? e.message : "Arquivo inválido.");
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remover() {
    try {
      pararPreviaSom();
      await removerSomPersonalizado();
      setArquivo(null);
      const next = {
        ...config,
        toque:
          config.toque === "personalizado" ? ("brisa" as const) : config.toque,
        eventos: { ...config.eventos },
      };
      for (const e of eventosNotificacao)
        if (next.eventos[e.id].toque === "personalizado")
          next.eventos[e.id] = { ...next.eventos[e.id], toque: "padrao" };
      atualizar(next);
      setMensagem(
        "Áudio removido. Os eventos que o utilizavam passaram para o som padrão.",
      );
    } catch {
      setErro(true);
      setMensagem("Não foi possível remover o áudio. Tente novamente.");
    }
  }
  const opcoes = [
    ...sonsPredefinidos.map((s) => ({
      value: s.id as SomNotificacao,
      label: s.nome,
    })),
    ...(arquivo
      ? [{ value: "personalizado" as const, label: "Meu áudio" }]
      : []),
  ];
  const quantidade = eventosNotificacao.filter(
    (e) => config.eventos[e.id].painel && config.eventos[e.id].som,
  ).length;
  return (
    <div className="cfg-page cfg-notifications">
      <div className="cfg-notify-workspace">
        <aside className="settings-workspace-nav cfg-notify-nav">
          <span className="settings-workspace-label">GERENCIAR AVISOS</span>
          <NavegacaoConfiguracao
            id="notify-editor"
            label="Áreas de notificações"
            value={view}
            onChange={selecionarArea}
            vertical
            options={[
              {
                value: "eventos",
                label: "Eventos",
                description: "Regras do sino e dos sons",
                icon: "bell",
              },
              {
                value: "audio",
                label: "Som e volume",
                description: "Toques e áudio personalizado",
                icon: "volume",
              },
              {
                value: "silencio",
                label: "Silêncio",
                description: "Defina os horários sem som",
                icon: "clock",
              },
            ]}
          />
          <section
            className="cfg-notify-global"
            aria-label="Controle geral dos sons"
          >
            <div>
              <span className="cfg-notify-global-label">
                <Icon name="volume" size={16} />
                Avisos sonoros
              </span>
              <CfgSwitch
                label="Ativar avisos sonoros"
                checked={config.ativo}
                onChange={(ativo) => {
                  atualizar({ ...config, ativo });
                  if (ativo) void prepararAudioNotificacoes(true);
                }}
              />
            </div>
            <b className={config.ativo ? "enabled" : ""}>
              {config.ativo ? "Sons ativados" : "Sons desligados"}
            </b>
            <p>
              {config.ativo
                ? `${quantidade} ${quantidade === 1 ? "evento selecionado com som" : "eventos selecionados com som"}.`
                : "Suas regras são mantidas enquanto os sons estão desligados."}
            </p>
            {config.silencio && (
              <button
                type="button"
                className="cfg-notify-quiet-link"
                onClick={() => selecionarArea("silencio")}
              >
                <Icon name="clock" size={14} />
                {config.inicio === config.fim
                  ? "Silêncio: dia inteiro"
                  : `${config.inicio}–${config.fim}`}
                <Icon name="right" size={13} />
              </button>
            )}
          </section>
        </aside>
        <div className="cfg-notification-layout" data-view={view}>
          <div
            className="cfg-events-column"
            hidden={view !== "eventos"}
            id="notify-editor-panel-eventos"
            role="tabpanel"
            aria-labelledby="notify-editor-tab-eventos"
          >
            <CfgCard
              icon="sliders"
              title="Eventos e avisos"
              description="Controle a exibição e o som de cada evento."
              action={
                <button
                  className="cfg-text-button"
                  onClick={() => atualizar(padraoNotificacoes())}
                >
                  Restaurar padrão
                </button>
              }
            >
              <div className="cfg-event-filter-bar">
                <div
                  className="cfg-event-filters"
                  aria-label="Filtrar grupos de eventos"
                >
                  {["Todos", "Clientes", "Ordens de serviço"].map((grupo) => (
                    <button
                      type="button"
                      key={grupo}
                      aria-pressed={grupoFiltro === grupo}
                      onClick={() => setGrupoFiltro(grupo)}
                    >
                      {grupo}
                    </button>
                  ))}
                </div>
                <span>
                  {
                    eventosNotificacao.filter(
                      (e) => grupoFiltro === "Todos" || e.grupo === grupoFiltro,
                    ).length
                  }{" "}
                  eventos
                </span>
              </div>
              <div className="cfg-events-table">
                <div className="cfg-events-labels">
                  <span>Evento</span>
                  <span>
                    <Icon name="bell" size={14} />
                    Mostrar no sino
                  </span>
                  <span>
                    <Icon name="volume" size={14} />
                    Emitir som
                  </span>
                </div>
                {["Clientes", "Ordens de serviço"]
                  .filter(
                    (grupo) => grupoFiltro === "Todos" || grupo === grupoFiltro,
                  )
                  .map((grupo) => (
                    <div
                      className={`cfg-event-group ${grupo === "Clientes" ? "clients" : "orders"}`}
                      key={grupo}
                    >
                      <h3>
                        <Icon
                          name={grupo === "Clientes" ? "users" : "clipboard"}
                          size={18}
                        />
                        {grupo}
                        <span>
                          {
                            eventosNotificacao.filter(
                              (e) =>
                                e.grupo === grupo &&
                                config.eventos[e.id].painel,
                            ).length
                          }{" "}
                          no sino
                        </span>
                      </h3>
                      {eventosNotificacao
                        .filter((e) => e.grupo === grupo)
                        .map((evento) => {
                          const r = config.eventos[evento.id];
                          return (
                            <div
                              className={`cfg-event ${!r.painel ? "muted" : ""} ${r.painel && r.som ? "audible" : ""}`}
                              key={evento.id}
                            >
                              <span className="cfg-event-icon">
                                <Icon name={evento.icone} size={20} />
                              </span>
                              <div className="cfg-event-copy">
                                <div className="cfg-event-description">
                                  <b>{evento.titulo}</b>
                                  <p>{evento.descricao}</p>
                                </div>
                                {r.painel && r.som && (
                                  <div className="cfg-event-sound">
                                    <SeletorFiltro
                                      label={`Som de ${evento.titulo}`}
                                      variant="staff"
                                      value={r.toque}
                                      options={[
                                        {
                                          value: "padrao",
                                          label: "Som padrão",
                                        },
                                        ...opcoes,
                                      ]}
                                      onChange={(value) =>
                                        regra(evento.id, { toque: value })
                                      }
                                    />
                                    <button
                                      className="cfg-icon-button"
                                      aria-label={`Testar som de ${evento.titulo}`}
                                      onClick={() =>
                                        void testar(
                                          r.toque === "padrao"
                                            ? config.toque
                                            : r.toque,
                                        )
                                      }
                                    >
                                      <Icon name="play" size={17} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="cfg-event-toggle">
                                <span className="cfg-mobile-label">
                                  No sino
                                </span>
                                <CfgSwitch
                                  label={`Mostrar ${evento.titulo} no sino`}
                                  checked={r.painel}
                                  onChange={(value) =>
                                    regra(evento.id, {
                                      painel: value,
                                      ...(!value ? { som: false } : {}),
                                    })
                                  }
                                />
                              </div>
                              <div className="cfg-event-toggle">
                                <span className="cfg-mobile-label">
                                  Com som
                                </span>
                                <CfgSwitch
                                  label={`Tocar som para ${evento.titulo}`}
                                  checked={r.painel && r.som}
                                  disabled={!r.painel}
                                  onChange={(value) =>
                                    regra(evento.id, { som: value })
                                  }
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ))}
              </div>
            </CfgCard>
          </div>
          <aside
            className="cfg-sound-column"
            hidden={view === "eventos"}
            id={`notify-editor-panel-${view === "silencio" ? "silencio" : "audio"}`}
            role="tabpanel"
            aria-labelledby={`notify-editor-tab-${view === "silencio" ? "silencio" : "audio"}`}
          >
            <CfgCard
              icon="volume"
              hidden={view !== "audio"}
              className="cfg-audio-primary"
              title="Som e volume"
              description="Defina o som padrão e a intensidade dos avisos."
            >
              <div className="cfg-audio-config-grid">
                <div className="cfg-audio-tone">
                  <div className="cfg-sound-picker">
                    <SeletorFiltro
                      variant="settings"
                      label="Som padrão"
                      value={config.toque}
                      options={opcoes}
                      onChange={(toque) => atualizar({ ...config, toque })}
                    />
                    <button
                      className="cfg-button"
                      onClick={() => void testar()}
                    >
                      <Icon name="play" size={17} />
                      Ouvir som
                    </button>
                  </div>
                  {feedbackSom && (
                    <p
                      className={`cfg-sound-feedback ${feedbackSom.erro ? "error" : ""}`}
                    >
                      <Icon
                        name={feedbackSom.erro ? "info" : "check"}
                        size={15}
                      />
                      {feedbackSom.texto}
                    </p>
                  )}
                </div>
                <div className="cfg-audio-level">
                  <label className="cfg-volume">
                    <span>
                      Volume <output>{config.volume}%</output>
                    </span>
                    <input
                      type="range"
                      aria-label="Volume das notificações"
                      min="0"
                      max="100"
                      step="5"
                      value={config.volume}
                      style={
                        {
                          "--volume-progress": `${config.volume}%`,
                        } as React.CSSProperties
                      }
                      onChange={(e) =>
                        atualizar({ ...config, volume: Number(e.target.value) })
                      }
                    />
                    <small>
                      Mais baixo <span>Mais alto</span>
                    </small>
                  </label>
                  <div className="cfg-inline-info">
                    <Icon name="info" size={18} />
                    <p>
                      O teste toca mesmo com os avisos desligados. Na rotina,
                      cada lote de novos eventos toca uma única vez.
                    </p>
                  </div>
                </div>
              </div>
            </CfgCard>
            <CfgCard
              icon="clock"
              hidden={view !== "silencio"}
              className="cfg-quiet-editor"
              title="Horário de silêncio"
              description="Continue recebendo avisos, sem interromper seu descanso."
            >
              <div className="cfg-setting-row">
                <div>
                  <b>Silenciar por horário</b>
                  <p>Usa o horário deste computador.</p>
                </div>
                <CfgSwitch
                  label="Ativar horário de silêncio"
                  checked={config.silencio}
                  onChange={(silencio) => atualizar({ ...config, silencio })}
                />
              </div>
              <div className="cfg-time-grid">
                <label>
                  Das
                  <input
                    aria-label="Início do silêncio"
                    type="time"
                    value={config.inicio}
                    disabled={!config.silencio}
                    onChange={(e) =>
                      e.target.value &&
                      atualizar({ ...config, inicio: e.target.value })
                    }
                  />
                </label>
                <label>
                  Até
                  <input
                    aria-label="Fim do silêncio"
                    type="time"
                    value={config.fim}
                    disabled={!config.silencio}
                    onChange={(e) =>
                      e.target.value &&
                      atualizar({ ...config, fim: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="cfg-quiet-context">
                <Icon name="clock" size={23} />
                <div>
                  <b>
                    {config.silencio
                      ? "Sua pausa está programada"
                      : "Você controla as interrupções"}
                  </b>
                  <p>
                    {!config.ativo
                      ? "Os avisos sonoros estão desligados no controle geral."
                      : config.silencio
                        ? config.inicio === config.fim
                          ? "Os sons ficam silenciados o dia inteiro."
                          : `Os sons ficam pausados das ${config.inicio} às ${config.fim}.`
                        : "Sem restrição de horário. Os eventos marcados podem emitir som."}
                  </p>
                  <small>
                    Os avisos configurados para o sino continuam disponíveis
                    durante o silêncio.
                  </small>
                </div>
              </div>
              {config.silencio &&
                config.inicio === config.fim &&
                !config.ativo && (
                  <p className="cfg-help">
                    Horários iguais deixam os sons silenciados o dia inteiro.
                  </p>
                )}
            </CfgCard>
            <CfgCard
              icon="music"
              hidden={view !== "audio"}
              className="cfg-custom-audio"
              title="Áudio personalizado"
              description="Use um som curto que você reconheça com facilidade."
            >
              <input
                ref={input}
                hidden
                type="file"
                accept=".wav,.mp3,.ogg,.oga,.m4a,.aac,.webm,.flac"
                onChange={(e) => void enviar(e.target.files?.[0])}
              />
              {arquivo && (
                <div className="cfg-audio-file">
                  <span className="cfg-icon">
                    <Icon name="music" size={21} />
                  </span>
                  <div>
                    <b>{arquivo.name}</b>
                    <small>
                      {arquivo.duration.toFixed(1).replace(".", ",")} segundos ·{" "}
                      {Math.ceil(arquivo.size / 1024)} KB
                    </small>
                  </div>
                  <button
                    className="cfg-icon-button"
                    aria-label="Remover áudio personalizado"
                    onClick={() => void remover()}
                  >
                    <Icon name="trash" size={19} />
                  </button>
                </div>
              )}
              <button
                className="cfg-upload"
                disabled={ocupado}
                onClick={() => input.current?.click()}
              >
                <Icon name={ocupado ? "clock" : "upload"} size={21} />
                <span>
                  <b>
                    {ocupado
                      ? "Validando áudio…"
                      : arquivo
                        ? "Trocar arquivo de áudio"
                        : "Selecionar arquivo de áudio"}
                  </b>
                  <small>Até 8 segundos e 1,5 MB</small>
                </span>
                <Icon name="plus" size={18} />
              </button>
              <p className="cfg-help">
                WAV, MP3, OGG, M4A, AAC, WEBM ou FLAC. Conteúdo decodificado e
                validado antes de salvar.
              </p>
              <div className="cfg-private-note">
                <Icon name="lock" size={16} />
                Salvo com segurança na sua conta, disponível nos seus outros
                computadores.
              </div>
            </CfgCard>
          </aside>
        </div>
        <div
          hidden
          id={`notify-editor-panel-${view === "silencio" ? "audio" : "silencio"}`}
          role="tabpanel"
          aria-labelledby={`notify-editor-tab-${view === "silencio" ? "audio" : "silencio"}`}
        />
      </div>
      <div
        className={`cfg-save-note ${erro ? "error" : ""}`}
        role={erro ? "alert" : "status"}
      >
        <Icon name={erro ? "info" : "check"} size={18} />
        {mensagem ||
          "Os ajustes são salvos na sua conta e acompanham você em outros computadores."}
      </div>
    </div>
  );
}
