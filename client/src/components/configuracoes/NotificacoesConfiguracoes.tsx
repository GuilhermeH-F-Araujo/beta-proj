import { useAcessoConta } from '../../services/acessoConta';
import { gruposNotificacao } from '../../services/catalogoNotificacoes';
import { useEffect, useRef, useState } from 'react';
import {
  eventosNotificacao,
  lerConfiguracaoNotificacoes,
  padraoNotificacoes,
  salvarConfiguracaoNotificacoes,
  type ConfiguracaoNotificacoes,
  type EventoNotificacao,
  type RegraEvento,
} from '../../services/preferenciasNotificacoes';
import {
  buscarSomPersonalizadoMeta,
  pararPreviaSom,
  prepararAudioNotificacoes,
  removerSomPersonalizado,
  reproduzirSom,
  salvarSomPersonalizado,
  sonsPredefinidos,
  type SomNotificacao,
  type SomPersonalizadoMeta,
} from '../../services/sonsNotificacao';
import { Icone } from '../MenuAdmin';
import SeletorFiltro from '../SeletorFiltro';
import { InterruptorConfiguracao } from './ElementosConfiguracoes';
import NavegacaoConfiguracao from './NavegacaoConfiguracao';
import { correspondeBusca } from '../../utils/buscaAproximada';
export default function NotificacoesConfiguracoes() {
  const [configuracao, setConfiguracao] = useState(lerConfiguracaoNotificacoes);
  const [visualizacao, setVisualizacao] = useState('eventos');
  const selecionarArea = (continuar: string) => {
    window.dispatchEvent(new Event('settings-view-change'));
    setVisualizacao(continuar);
  };
  const [grupoFiltro, setGrupoFiltro] = useState('Todos');
  const [busca, setBusca] = useState('');
  const acesso = useAcessoConta();
  const grupos = gruposNotificacao.filter(
    ({ modulo }) =>
      acesso.administrador ||
      (modulo !== 'miniaturas' && acesso.permissoes[modulo]?.visualizar === true),
  );
  const eventosFiltrados = eventosNotificacao.filter(
    ({ grupo, titulo, descricao }) =>
      grupos.some((opcao) => opcao.titulo === grupo) &&
      (grupoFiltro === 'Todos' || grupo === grupoFiltro) &&
      correspondeBusca(busca, `${titulo} ${descricao}`),
  );
  const [arquivo, setArquivo] = useState<SomPersonalizadoMeta | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState(false);
  const [feedbackSom, setFeedbackSom] = useState<{
    texto: string;
    erro: boolean;
  } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const configuracaoReferencia = useRef(configuracao);
  configuracaoReferencia.current = configuracao;
  useEffect(() => {
    let ativo = true;
    buscarSomPersonalizadoMeta()
      .then((meta) => {
        if (ativo) {
          setArquivo(meta);
          if (!meta) {
            const atual = configuracaoReferencia.current;
            if (
              atual.toque === 'personalizado' ||
              Object.values(atual.eventos).some(
                (eventoRecebido) => eventoRecebido.toque === 'personalizado',
              )
            ) {
              const continuar = {
                ...atual,
                toque: atual.toque === 'personalizado' ? ('brisa' as const) : atual.toque,
                eventos: { ...atual.eventos },
              };
              for (const eventoRecebido of eventosNotificacao)
                if (continuar.eventos[eventoRecebido.id].toque === 'personalizado')
                  continuar.eventos[eventoRecebido.id] = {
                    ...continuar.eventos[eventoRecebido.id],
                    toque: 'padrao',
                  };
              salvarConfiguracaoNotificacoes(continuar);
              setConfiguracao(continuar);
              setMensagem(
                'Não há áudio personalizado salvo na conta. Foi restaurado o som padrão.',
              );
            }
          }
        }
      })
      .catch((erroLocal) => {
        if (ativo) {
          setErro(true);
          setMensagem(
            erroLocal instanceof Error
              ? erroLocal.message
              : 'Não foi possível carregar o áudio da sua conta. Tente novamente.',
          );
        }
      });
    return () => {
      ativo = false;
      pararPreviaSom();
    };
  }, []);
  useEffect(() => {
    const atualizar = () => setConfiguracao(lerConfiguracaoNotificacoes());
    window.addEventListener('notification-preferences-change', atualizar);
    return () => window.removeEventListener('notification-preferences-change', atualizar);
  }, []);
  function atualizar(continuar: ConfiguracaoNotificacoes) {
    try {
      salvarConfiguracaoNotificacoes(continuar);
      setConfiguracao(continuar);
      setErro(false);
      setMensagem('Preferências aplicadas e sendo salvas na sua conta.');
    } catch {
      setErro(true);
      setMensagem('Não foi possível salvar. Verifique se o navegador permite armazenamento local.');
    }
  }
  function regra(id: EventoNotificacao, alteracaoParcial: Partial<RegraEvento>) {
    atualizar({
      ...configuracao,
      ativo: alteracaoParcial.som === true ? true : configuracao.ativo,
      eventos: {
        ...configuracao.eventos,
        [id]: { ...configuracao.eventos[id], ...alteracaoParcial },
      },
    });
    if (alteracaoParcial.som === true) void prepararAudioNotificacoes(true);
  }
  function atualizarFiltrados(canal: 'painel' | 'som', valor: boolean) {
    const eventos = { ...configuracao.eventos };
    for (const { id } of eventosFiltrados) {
      if (canal === 'som' && valor && !eventos[id].painel) continue;
      eventos[id] = { ...eventos[id], [canal]: valor };
    }
    atualizar({
      ...configuracao,
      ativo: configuracao.ativo || (canal === 'som' && valor),
      eventos,
    });
    if (canal === 'som' && valor) void prepararAudioNotificacoes(true);
  }

  function restaurarEventos() {
    const padrao = padraoNotificacoes();
    const eventos = { ...configuracao.eventos };
    for (const { id, grupo } of eventosNotificacao) {
      if (grupos.some(({ titulo }) => titulo === grupo)) eventos[id] = padrao.eventos[id];
    }
    atualizar({ ...configuracao, eventos });
  }

  async function testar(som: SomNotificacao = configuracao.toque) {
    setErro(false);
    setFeedbackSom(null);
    try {
      await reproduzirSom(som, true, configuracao.volume);
      setFeedbackSom({
        texto:
          configuracao.volume === 0
            ? 'Volume em 0%. A prévia está sem som.'
            : 'Prévia iniciada no volume escolhido.',
        erro: false,
      });
      setMensagem('Prévia reproduzida. O volume também depende do seu computador.');
    } catch (erroCapturado) {
      setErro(true);
      setFeedbackSom({
        texto:
          erroCapturado instanceof Error
            ? erroCapturado.message
            : 'Não foi possível tocar o áudio.',
        erro: true,
      });
      setMensagem(
        erroCapturado instanceof Error ? erroCapturado.message : 'Não foi possível tocar o áudio.',
      );
    }
  }
  async function enviar(arquivoLocal?: File) {
    if (!arquivoLocal) return;
    setOcupado(true);
    setErro(false);
    setMensagem('Verificando formato, duração e conteúdo do áudio…');
    try {
      const meta = await salvarSomPersonalizado(arquivoLocal);
      setArquivo(meta);
      atualizar({ ...configuracaoReferencia.current, toque: 'personalizado' });
      setMensagem('Áudio verificado e salvo na sua conta. Escolha os eventos que devem usá-lo.');
    } catch (erroCapturado) {
      setErro(true);
      setMensagem(erroCapturado instanceof Error ? erroCapturado.message : 'Arquivo inválido.');
    } finally {
      setOcupado(false);
      if (entrada.current) entrada.current.value = '';
    }
  }
  async function remover() {
    try {
      pararPreviaSom();
      await removerSomPersonalizado();
      setArquivo(null);
      const continuar = {
        ...configuracao,
        toque: configuracao.toque === 'personalizado' ? ('brisa' as const) : configuracao.toque,
        eventos: { ...configuracao.eventos },
      };
      for (const eventoRecebido of eventosNotificacao)
        if (continuar.eventos[eventoRecebido.id].toque === 'personalizado')
          continuar.eventos[eventoRecebido.id] = {
            ...continuar.eventos[eventoRecebido.id],
            toque: 'padrao',
          };
      atualizar(continuar);
      setMensagem('Áudio removido. Os eventos que o utilizavam passaram para o som padrão.');
    } catch {
      setErro(true);
      setMensagem('Não foi possível remover o áudio. Tente novamente.');
    }
  }
  const opcoes = [
    ...sonsPredefinidos.map((textoAtual) => ({
      value: textoAtual.id as SomNotificacao,
      label: textoAtual.nome,
    })),
    ...(arquivo ? [{ value: 'personalizado' as const, label: 'Meu áudio' }] : []),
  ];
  const quantidade = eventosNotificacao.filter(
    (eventoRecebido) =>
      configuracao.eventos[eventoRecebido.id].painel && configuracao.eventos[eventoRecebido.id].som,
  ).length;
  const minutos = (horario: string) => {
    const [hora, minuto] = horario.split(':').map(Number);
    return hora * 60 + minuto;
  };
  const inicio = minutos(configuracao.inicio);
  const fim = minutos(configuracao.fim);
  const faixas = configuracao.silencio
    ? inicio === fim
      ? [[0, 1440]]
      : inicio < fim
        ? [[inicio, fim]]
        : [
            [0, fim],
            [inicio, 1440],
          ]
    : [];
  return (
    <div className="cfg-page cfg-notifications">
      <div className="cfg-notify-workspace">
        <aside className="settings-workspace-nav cfg-notify-nav">
          <span className="settings-workspace-label">GERENCIAR AVISOS</span>
          <NavegacaoConfiguracao
            id="notify-editor"
            label="Áreas de notificações"
            value={visualizacao}
            onChange={selecionarArea}
            vertical
            options={[
              {
                value: 'eventos',
                label: 'Eventos',
                description: 'Regras do sino e dos sons',
                icon: 'bell',
              },
              {
                value: 'audio',
                label: 'Som e volume',
                description: 'Toques e áudio personalizado',
                icon: 'volume',
              },
              {
                value: 'silencio',
                label: 'Silêncio',
                description: 'Defina os horários sem som',
                icon: 'clock',
              },
            ]}
          />
          <section className="cfg-notify-global" aria-label="Controle geral dos sons">
            <div>
              <span className="cfg-notify-global-label">Avisos sonoros</span>
              <InterruptorConfiguracao
                label="Ativar avisos sonoros"
                checked={configuracao.ativo}
                onChange={(ativo) => {
                  atualizar({ ...configuracao, ativo });
                  if (ativo) void prepararAudioNotificacoes(true);
                }}
              />
            </div>
            <b className={configuracao.ativo ? 'enabled' : ''}>
              {configuracao.ativo ? 'Sons ativados' : 'Sons desligados'}
            </b>
            <p>
              {configuracao.ativo
                ? `${quantidade} ${quantidade === 1 ? 'evento selecionado com som' : 'eventos selecionados com som'}.`
                : 'Suas regras são mantidas enquanto os sons estão desligados.'}
            </p>
            {configuracao.silencio && (
              <button
                type="button"
                className="cfg-notify-quiet-link"
                onClick={() => selecionarArea('silencio')}
              >
                {configuracao.inicio === configuracao.fim
                  ? 'Silêncio: dia inteiro'
                  : `${configuracao.inicio}–${configuracao.fim}`}
                <Icone name="right" size={13} />
              </button>
            )}
          </section>
        </aside>
        <div className="cfg-notification-layout">
          <section
            className="notify-editor"
            id="notify-editor-panel-eventos"
            role="tabpanel"
            aria-labelledby="notify-editor-tab-eventos"
            hidden={visualizacao !== 'eventos'}
          >
            <header className="notify-header notify-event-header">
              <div>
                <h2>Eventos e avisos</h2>
                <p>Escolha o que aparece no sino e quais avisos emitem som.</p>
              </div>
              <button
                type="button"
                className="notify-button notify-primary notify-reset"
                onClick={restaurarEventos}
              >
                Restaurar regras
              </button>
            </header>
            <div className="notify-overview">
              <span>
                <strong>{grupos.length}</strong> módulos
              </span>
              <span>
                <strong>
                  {
                    eventosNotificacao.filter(
                      ({ id, grupo }) =>
                        grupos.some(({ titulo }) => titulo === grupo) &&
                        configuracao.eventos[id].painel,
                    ).length
                  }
                </strong>{' '}
                no sino
              </span>
              <span>
                <strong>{quantidade}</strong> com toque configurado
              </span>
            </div>
            <div className="notify-toolbar">
              <label className="notify-search">
                <Icone name="search" size={17} />
                <input
                  type="search"
                  aria-label="Buscar eventos"
                  placeholder="Buscar eventos"
                  value={busca}
                  onChange={(evento) => setBusca(evento.target.value)}
                />
              </label>
              <SeletorFiltro
                variant="staff"
                label="Módulo dos eventos"
                value={grupoFiltro}
                options={[
                  { value: 'Todos', label: 'Todos os módulos' },
                  ...grupos.map(({ titulo }) => ({ value: titulo, label: titulo })),
                ]}
                onChange={setGrupoFiltro}
              />
            </div>
            <div className="notify-results">
              <span role="status">
                {eventosFiltrados.length} {eventosFiltrados.length === 1 ? 'evento' : 'eventos'}
              </span>
              <SeletorFiltro
                variant="staff"
                label="Alterar eventos filtrados"
                value="acoes"
                options={[
                  { value: 'acoes', label: 'Ações em lote' },
                  { value: 'mostrar', label: 'Mostrar no sino' },
                  { value: 'ocultar', label: 'Ocultar do sino' },
                  { value: 'ativar', label: 'Ativar som dos visíveis' },
                  { value: 'silenciar', label: 'Desativar som' },
                ]}
                onChange={(valor) => {
                  if (valor === 'mostrar' || valor === 'ocultar')
                    atualizarFiltrados('painel', valor === 'mostrar');
                  else if (valor === 'ativar' || valor === 'silenciar')
                    atualizarFiltrados('som', valor === 'ativar');
                }}
                disabled={!eventosFiltrados.length}
              />
            </div>
            {eventosFiltrados.length === 0 ? (
              <p className="notify-empty">Nenhum evento encontrado.</p>
            ) : (
              <div className="notify-events">
                <div className="notify-event-grid notify-column-labels" aria-hidden="true">
                  <span>Evento</span>
                  <span>No sino</span>
                  <span>Com som</span>
                </div>
                {grupos.map(({ titulo: grupo, icone }) => {
                  const eventos = eventosFiltrados.filter((evento) => evento.grupo === grupo);
                  if (!eventos.length) return null;
                  const visiveis = eventos.filter(
                    ({ id }) => configuracao.eventos[id].painel,
                  ).length;
                  return (
                    <section className="notify-module" key={grupo}>
                      <h3>
                        <span className="notify-module-title">
                          <span className="notify-module-icon">
                            <Icone name={icone} size={17} />
                          </span>
                          {grupo}
                        </span>
                        <span className="notify-module-count">
                          {visiveis} de {eventos.length} no sino
                        </span>
                      </h3>
                      {eventos.map((evento) => {
                        const regraAtual = configuracao.eventos[evento.id];
                        return (
                          <div className="notify-event-grid notify-event" key={evento.id}>
                            <div className="notify-event-copy">
                              <b>{evento.titulo}</b>
                              <p>{evento.descricao}</p>
                              {regraAtual.painel && (regraAtual.som || grupo === 'Miniaturas') && (
                                <div className="notify-tone">
                                  <SeletorFiltro
                                    label={`Som de ${evento.titulo}`}
                                    variant="staff"
                                    value={regraAtual.toque}
                                    options={[
                                      { value: 'padrao', label: 'Toque padrão' },
                                      ...opcoes,
                                    ]}
                                    onChange={(toque) => regra(evento.id, { toque })}
                                  />
                                  <button
                                    type="button"
                                    className="notify-button notify-preview"
                                    aria-label={`Testar som de ${evento.titulo}`}
                                    onClick={() =>
                                      void testar(
                                        regraAtual.toque === 'padrao'
                                          ? configuracao.toque
                                          : regraAtual.toque,
                                      )
                                    }
                                  >
                                    Ouvir
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="notify-event-control">
                              <span>No sino</span>
                              <InterruptorConfiguracao
                                label={`Mostrar ${evento.titulo} no sino`}
                                checked={regraAtual.painel}
                                onChange={(painel) => regra(evento.id, { painel })}
                              />
                            </div>
                            <div className="notify-event-control">
                              <span>Com som</span>
                              <InterruptorConfiguracao
                                label={`Tocar som para ${evento.titulo}`}
                                checked={regraAtual.painel && regraAtual.som}
                                disabled={!regraAtual.painel}
                                onChange={(som) => regra(evento.id, { som })}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
          <section
            className="notify-editor"
            id="notify-editor-panel-audio"
            role="tabpanel"
            aria-labelledby="notify-editor-tab-audio"
            hidden={visualizacao !== 'audio'}
          >
            <header className="notify-header">
              <div>
                <h2>Som e volume</h2>
                <p>Ajuste o toque e ouça uma prévia no volume escolhido.</p>
              </div>
            </header>
            <div className="notify-audio">
              <div className="notify-tone-setting">
                <h3>Som padrão</h3>
                <div className="notify-tone">
                  <SeletorFiltro
                    variant="staff"
                    label="Som padrão"
                    value={configuracao.toque}
                    options={opcoes}
                    onChange={(toque) => atualizar({ ...configuracao, toque })}
                  />
                  <button
                    type="button"
                    className="notify-button notify-primary"
                    onClick={() => void testar()}
                  >
                    <Icone name="play" size={16} /> Ouvir prévia
                  </button>
                </div>
                {feedbackSom && (
                  <p className="notify-feedback" data-error={feedbackSom.erro}>
                    {feedbackSom.texto}
                  </p>
                )}
              </div>
              <label className="notify-volume">
                <span>
                  Volume das notificações <output>{configuracao.volume}%</output>
                </span>
                <input
                  type="range"
                  aria-label="Volume das notificações"
                  min="0"
                  max="100"
                  step="5"
                  value={configuracao.volume}
                  onChange={(evento) =>
                    atualizar({ ...configuracao, volume: Number(evento.target.value) })
                  }
                />
                <small>
                  <span>0%</span>
                  <span>100%</span>
                </small>
              </label>
            </div>
            <div className="notify-file">
              <div>
                <h3>Áudio personalizado</h3>
                {arquivo ? (
                  <p>
                    <strong>{arquivo.name}</strong> ·{' '}
                    {arquivo.duration.toFixed(1).replace('.', ',')} s ·{' '}
                    {Math.ceil(arquivo.size / 1024)} KB
                  </p>
                ) : (
                  <p>WAV, MP3, OGG, M4A, AAC, WEBM ou FLAC · Até 8 segundos e 1,5 MB</p>
                )}
              </div>
              <div className="notify-file-actions">
                <input
                  ref={entrada}
                  hidden
                  type="file"
                  accept=".wav,.mp3,.ogg,.oga,.m4a,.aac,.webm,.flac"
                  onChange={(evento) => void enviar(evento.target.files?.[0])}
                />
                {arquivo && (
                  <button
                    type="button"
                    className="notify-button"
                    aria-label="Remover áudio personalizado"
                    disabled={ocupado}
                    onClick={() => void remover()}
                  >
                    Remover
                  </button>
                )}
                <button
                  type="button"
                  className="notify-button"
                  disabled={ocupado}
                  onClick={() => entrada.current?.click()}
                >
                  {ocupado ? 'Validando áudio…' : arquivo ? 'Trocar arquivo' : 'Selecionar arquivo'}
                </button>
              </div>
            </div>
          </section>
          <section
            className="notify-editor"
            id="notify-editor-panel-silencio"
            role="tabpanel"
            aria-labelledby="notify-editor-tab-silencio"
            hidden={visualizacao !== 'silencio'}
          >
            <header className="notify-header">
              <div>
                <h2>Horário de silêncio</h2>
                <p>Pause o som dos avisos em um intervalo diário.</p>
              </div>
              <InterruptorConfiguracao
                label="Ativar horário de silêncio"
                checked={configuracao.silencio}
                onChange={(silencio) => atualizar({ ...configuracao, silencio })}
              />
            </header>
            <div className="notify-quiet">
              <div className="notify-time-fields">
                <label>
                  Início
                  <input
                    type="time"
                    aria-label="Início do silêncio"
                    value={configuracao.inicio}
                    disabled={!configuracao.silencio}
                    onChange={(evento) =>
                      evento.target.value &&
                      atualizar({ ...configuracao, inicio: evento.target.value })
                    }
                  />
                </label>
                <label>
                  Fim
                  <input
                    type="time"
                    aria-label="Fim do silêncio"
                    value={configuracao.fim}
                    disabled={!configuracao.silencio}
                    onChange={(evento) =>
                      evento.target.value &&
                      atualizar({ ...configuracao, fim: evento.target.value })
                    }
                  />
                </label>
              </div>
              <div className="notify-daily">
                <h3>
                  {configuracao.silencio
                    ? inicio === fim
                      ? 'Silêncio o dia inteiro'
                      : `Silêncio das ${configuracao.inicio} às ${configuracao.fim}`
                    : 'Silêncio por horário desligado'}
                </h3>
                <div className="notify-track" aria-hidden="true">
                  {faixas.map(([de, ate]) => (
                    <i key={de} style={{ left: `${de / 14.4}%`, width: `${(ate - de) / 14.4}%` }} />
                  ))}
                </div>
                <div className="notify-hours" aria-hidden="true">
                  <span>00h</span>
                  <span>06h</span>
                  <span>12h</span>
                  <span>18h</span>
                  <span>24h</span>
                </div>
              </div>
              <p>
                O intervalo segue o horário deste computador. Os avisos continuam aparecendo no
                sino.
              </p>
            </div>
          </section>
        </div>
      </div>
      <div className={`cfg-save-note ${erro ? 'error' : ''}`} role={erro ? 'alert' : 'status'}>
        {mensagem || 'Os ajustes são salvos na sua conta e acompanham você em outros computadores.'}
      </div>
    </div>
  );
}
