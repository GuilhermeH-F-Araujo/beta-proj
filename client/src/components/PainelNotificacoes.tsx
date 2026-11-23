import { eventosNotificacao, gruposNotificacao } from '../services/catalogoNotificacoes';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  atualizarNotificacaoAdministrador,
  limparNotificacoesAdministrador,
  type NotificacaoAdministrador,
} from '../services/apiAutenticacao';
import {
  atualizarAvisoLocal,
  atualizarCentralNotificacoes,
  estadoNotificacoes,
  limparAvisosLocais,
  observarNotificacoes,
} from '../services/centralNotificacoes';
import { eventoVisivel, invalidarMemoriaNotificacoes } from '../services/preferenciasNotificacoes';
import { Icone } from './MenuAdmin';
import Skeleton from './Skeleton';
import './painel-notificacoes.css';

const eventos = new Map(eventosNotificacao.map((evento) => [evento.id, evento]));
const rotas = new Map(gruposNotificacao.map(({ titulo, rota }) => [titulo, rota]));
function decorrido(valor: string) {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(valor).getTime()) / 60000));
  if (minutos < 1) return 'Agora';
  if (minutos < 60) return `Há ${minutos} min`;
  if (minutos < 1440) return `Há ${Math.floor(minutos / 60)} h`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(
    new Date(valor),
  );
}
export default function PainelNotificacoes({
  personalizacaoId,
  editorId,
}: { personalizacaoId?: string; editorId?: string } = {}) {
  const painel = useRef<HTMLElement>(null);
  const [posicao, setPosicao] = useState({ top: 72, left: 16, width: 400, maxHeight: 560 });
  const navegar = useNavigate();
  const rota = useLocation();
  useEffect(() => setAberto(false), [rota.pathname]);
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const central = useSyncExternalStore(observarNotificacoes, estadoNotificacoes);
  const [, setPreferencias] = useState(0);
  const itens = central.items.filter((item) => eventoVisivel(item.kind));
  const naoLido = itens.filter((item) => !item.read).length;
  const carregando = central.loading;
  const [limpando, setLimpando] = useState(false);
  const [acaoErro, setErro] = useState('');
  const erro = acaoErro || central.error;
  const atualizarLocal = atualizarCentralNotificacoes;
  useEffect(() => {
    const atualizar = () => setPreferencias((valorAtual) => valorAtual + 1);
    window.addEventListener('notification-preferences-change', atualizar);
    const armazenamento = () => {
      invalidarMemoriaNotificacoes();
      atualizar();
    };
    window.addEventListener('storage', armazenamento);
    return () => {
      window.removeEventListener('notification-preferences-change', atualizar);
      window.removeEventListener('storage', armazenamento);
    };
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const fora = (evento: PointerEvent) => {
      if (
        evento.target instanceof Node &&
        !raiz.current?.contains(evento.target) &&
        !painel.current?.contains(evento.target)
      )
        setAberto(false);
    };
    const escapar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false);
    };
    const posicionar = () => {
      const ancora = raiz.current?.getBoundingClientRect();
      if (!ancora) return;
      const width = Math.min(420, window.innerWidth - 32);
      const maxHeight = Math.min(560, window.innerHeight - 32);
      const altura = Math.min(painel.current?.offsetHeight || maxHeight, maxHeight);
      const top =
        ancora.bottom + altura + 12 < window.innerHeight
          ? ancora.bottom + 8
          : Math.max(16, ancora.top - altura - 8);
      setPosicao({
        top: Math.min(top, window.innerHeight - altura - 16),
        left: Math.max(16, Math.min(ancora.right - width, window.innerWidth - width - 16)),
        width,
        maxHeight,
      });
    };
    posicionar();
    window.addEventListener('resize', posicionar);
    window.addEventListener('app-preferences-change', posicionar);
    window.addEventListener('scroll', posicionar, true);
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', escapar);
    return () => {
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('app-preferences-change', posicionar);
      window.removeEventListener('scroll', posicionar, true);
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', escapar);
    };
  }, [aberto, itens.length, carregando, erro]);
  async function acao(item: NotificacaoAdministrador, tipoElemento: 'ler' | 'dispensar') {
    setErro('');
    try {
      await atualizarNotificacaoAdministrador(item.id, tipoElemento);
      atualizarAvisoLocal(item.id, tipoElemento);
    } catch (erroCapturado) {
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível atualizar a notificação.',
      );
    }
  }
  async function limparTodos() {
    if (limpando) return;

    setLimpando(true);
    setErro('');
    try {
      await limparNotificacoesAdministrador();

      limparAvisosLocais();
      await atualizarLocal();
    } catch (erroCapturado) {
      await atualizarLocal();
      setErro(
        erroCapturado instanceof Error
          ? erroCapturado.message
          : 'Não foi possível limpar os avisos.',
      );
    } finally {
      setLimpando(false);
    }
  }
  return (
    <div className="notice-root" ref={raiz} data-editor-bloco={editorId}>
      <button
        type="button"
        data-personalizar-id={personalizacaoId}
        className={`plain notification notice-trigger${aberto ? ' notice-active' : ''}`}
        aria-label={naoLido ? `Notificações: ${naoLido} não lidas` : 'Notificações'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => {
          setAberto((valor) => !valor);
          if (!aberto) void atualizarLocal();
        }}
      >
        <Icone name="bell" size={21} />
        {naoLido > 0 && <span className="notice-badge">{naoLido > 99 ? '99+' : naoLido}</span>}
      </button>
      {aberto &&
        createPortal(
          <section
            ref={painel}
            style={posicao}
            className="notice-popover"
            role="dialog"
            aria-modal="false"
            aria-label="Notificações importantes"
          >
            <div className="notice-top">
              <div>
                <span className="notice-eyebrow">CENTRAL DE AVISOS</span>
                <h2>Notificações</h2>
                <p>O que merece sua atenção na oficina.</p>
              </div>
              <button
                type="button"
                className="notice-close"
                aria-label="Fechar notificações"
                onClick={() => setAberto(false)}
              >
                <Icone name="close" size={16} />
              </button>
            </div>
            <div className="notice-toolbar">
              <span>
                {itens.length
                  ? `${itens.length} ${itens.length === 1 ? 'aviso' : 'avisos'}`
                  : 'Tudo em dia'}
              </span>
              {itens.length > 0 && (
                <button type="button" disabled={limpando} onClick={() => void limparTodos()}>
                  {limpando ? 'Limpando…' : 'Vi tudo · limpar avisos'}
                </button>
              )}
            </div>
            <div className="notice-list">
              {carregando && !itens.length ? (
                <Skeleton tipo="tabela" linhas={4} />
              ) : !itens.length ? (
                <div className="notice-empty">
                  <span>
                    <Icone name="check" size={25} />
                  </span>
                  <strong>Nenhum aviso por enquanto</strong>
                  <small>Novas OS e mudanças importantes aparecerão aqui.</small>
                </div>
              ) : (
                itens.map((item) => (
                  <article
                    className={`notice-item notice-${item.kind}${item.read ? ' is-read' : ''}`}
                    key={item.id}
                  >
                    <span className="notice-icon">
                      <Icone name={eventos.get(item.kind)?.icone ?? 'bell'} size={16} />
                    </span>
                    <button
                      type="button"
                      className="notice-content"
                      onClick={() => {
                        if (!item.read) void acao(item, 'ler');
                        setAberto(false);
                        if (item.orderId) navegar(`/ordens-de-servico/${item.orderId}`);
                        else if (item.clientId) navegar(`/clientes/${item.clientId}`);
                        else {
                          const evento = eventos.get(item.kind);
                          const destino = evento && rotas.get(evento.grupo);
                          if (destino) navegar(destino);
                        }
                      }}
                    >
                      <span>
                        <b>{item.title}</b>
                        {!item.read && <i aria-label="Não lida" />}
                      </span>
                      <small>{item.body}</small>
                      <time dateTime={item.createdAt}>{decorrido(item.createdAt)}</time>
                    </button>
                    <button
                      type="button"
                      className="notice-dismiss"
                      title="Remover aviso"
                      aria-label={`Remover ${item.title}`}
                      onClick={() => void acao(item, 'dispensar')}
                    >
                      <Icone name="close" size={13} />
                    </button>
                  </article>
                ))
              )}
            </div>
            {erro && (
              <div className="notice-error" role="alert">
                {erro}{' '}
                <button type="button" onClick={() => void atualizarLocal()}>
                  Tentar novamente
                </button>
              </div>
            )}
            <div className="notice-bottom">Apenas eventos importantes aparecem neste espaço.</div>
          </section>,
          document.body,
        )}
    </div>
  );
}
