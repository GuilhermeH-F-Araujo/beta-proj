import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { request } from '../../services/apiAutenticacao';
import { useArrasteInterface } from '../../services/organizacaoInterface';
import { Icone } from '../MenuAdmin';
import './pesquisa-geral.css';
type Resultado = {
  id: string;
  titulo: string;
  detalhe: string;
  tipo: string;
  rota: string;
  relevancia: number;
};
export default function PesquisaGeral({ id, substituido }: { id: string; substituido?: boolean }) {
  const navegar = useNavigate(),
    rota = useLocation();
  const editando = useArrasteInterface();
  const listaId = useId();
  const form = useRef<HTMLFormElement>(null);
  const abrirAoConcluir = useRef(false);
  const [busca, setBusca] = useState(''),
    [aberta, setAberta] = useState(false);
  const [itens, setItens] = useState<Resultado[]>([]),
    [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false),
    [incompleta, setIncompleta] = useState(false),
    [indice, setIndice] = useState(0);
  const [posicao, setPosicao] = useState({ top: 64, left: 16, width: 420 });
  useEffect(() => {
    setAberta(false);
    setBusca('');
    setItens([]);
  }, [rota.pathname, rota.search]);
  useEffect(() => {
    if (editando || !aberta || busca.trim().length < 2) {
      setItens([]);
      setCarregando(false);
      return;
    }
    const controle = new AbortController();
    setItens([]);
    setErro('');
    setCarregando(true);
    const tempo = window.setTimeout(() => {
      request<{ itens: Resultado[]; incompleta: boolean }>(
        `/api/admin/search?q=${encodeURIComponent(busca.trim())}`,
        { signal: controle.signal },
      )
        .then((dados) => {
          if (!controle.signal.aborted) {
            setItens(dados.itens);
            if (abrirAoConcluir.current && dados.itens[0]) {
              abrirAoConcluir.current = false;
              setAberta(false);
              navegar(dados.itens[0].rota);
            }
            setIncompleta(dados.incompleta);
            setIndice(0);
          }
        })
        .catch((falha) => {
          if (!controle.signal.aborted) setErro(falha.message);
        })
        .finally(() => {
          if (!controle.signal.aborted) setCarregando(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(tempo);
      controle.abort();
    };
  }, [busca, aberta, editando, navegar]);
  useEffect(() => {
    if (!aberta) return;
    const medir = () => {
      const rect = form.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(440, window.innerWidth - 24);
      const cabeAbaixo = window.innerHeight - rect.bottom >= 250;
      setPosicao({
        top: cabeAbaixo
          ? rect.bottom + 8
          : Math.max(12, rect.top - Math.min(420, window.innerHeight - 24)),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
        width,
      });
    };
    const fechar = (evento: PointerEvent) => {
      if (
        evento.target instanceof Element &&
        !form.current?.contains(evento.target) &&
        !evento.target.closest(`[data-pesquisa-lista="${listaId}"]`)
      )
        setAberta(false);
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    document.addEventListener('pointerdown', fechar);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      document.removeEventListener('pointerdown', fechar);
    };
  }, [aberta, listaId]);
  const abrir = (item: Resultado) => {
    setAberta(false);
    navegar(item.rota);
  };
  return (
    <>
      <form
        ref={form}
        data-editor-bloco={substituido ? undefined : id}
        data-personalizar-id={id}
        className="workspace-search"
        role="search"
        aria-label="Pesquisa geral"
        onSubmit={(evento) => {
          evento.preventDefault();
          setAberta(true);
          if (itens[indice]) abrir(itens[indice]);
          else abrirAoConcluir.current = busca.trim().length >= 2;
        }}
      >
        <Icone name="search" size={16} />
        <input
          aria-label="Pesquisar em todo o painel"
          placeholder="Pesquisar em tudo…"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={aberta && !editando}
          aria-controls={listaId}
          aria-activedescendant={aberta && itens[indice] ? `${listaId}-${indice}` : undefined}
          autoComplete="off"
          maxLength={100}
          value={busca}
          onFocus={() => setAberta(true)}
          onChange={(evento) => {
            abrirAoConcluir.current = false;
            setItens([]);
            setBusca(evento.target.value);
            setAberta(true);
          }}
          onKeyDown={(evento) => {
            if (evento.key === 'Escape') {
              evento.preventDefault();
              abrirAoConcluir.current = false;
              setAberta(false);
            } else if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
              evento.preventDefault();
              setAberta(true);
              setIndice((valor) =>
                Math.max(
                  0,
                  Math.min(itens.length - 1, valor + (evento.key === 'ArrowDown' ? 1 : -1)),
                ),
              );
            }
          }}
        />
        <button type="submit" aria-label="Executar pesquisa geral">
          <Icone name="right" size={14} />
        </button>
      </form>
      {aberta &&
        !editando &&
        createPortal(
          <section
            data-pesquisa-lista={listaId}
            className="global-search-results"
            style={posicao}
            aria-label="Resultados da pesquisa geral"
          >
            <header>
              <strong>Pesquisa geral</strong>
              <button type="button" aria-label="Fechar pesquisa" onClick={() => setAberta(false)}>
                <Icone name="close" size={16} />
              </button>
            </header>
            <div role="status" className="global-search-status">
              {busca.trim().length < 2
                ? 'Pesquise nomes, placas, contatos, serviços ou números de OS.'
                : carregando
                  ? 'Procurando em todo o painel…'
                  : erro ||
                    (itens.length
                      ? `${itens.length} resultados${incompleta ? ' · Parte dos cadastros está indisponível.' : ''}`
                      : 'Nenhum resultado. Tente outro termo.')}
            </div>
            <div role="listbox" id={listaId} aria-label="Resultados encontrados">
              {itens.map((item, i) => (
                <button
                  role="option"
                  aria-selected={indice === i}
                  id={`${listaId}-${i}`}
                  key={item.id}
                  onPointerMove={() => setIndice(i)}
                  onClick={() => abrir(item)}
                >
                  <span className="global-search-type">
                    {item.tipo}
                    {item.relevancia < 100 ? ' · semelhante' : ''}
                  </span>
                  <strong>{item.titulo}</strong>
                  <small>{item.detalhe}</small>
                  <Icone name="right" size={16} />
                </button>
              ))}
            </div>
            <footer>↑ ↓ para escolher · Enter para abrir · Esc para fechar</footer>
          </section>,
          document.body,
        )}
    </>
  );
}
