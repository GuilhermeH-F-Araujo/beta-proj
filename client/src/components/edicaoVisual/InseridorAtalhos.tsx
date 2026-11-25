import { useState } from 'react';
import { useAcessoConta } from '../../services/acessoConta';
import { atalhosInterface } from '../../services/catalogoInterface';
import { useAncoraVisual } from '../../hooks/useAncoraVisual';
import { atalhoPermitido } from '../organizacao/AtalhosPainel';
import { Icone } from '../MenuAdmin';
import { correspondeBusca } from '../../utils/buscaAproximada';
export default function InseridorAtalhos({
  ancora,
  titulo,
  escolher,
  fechar,
}: {
  ancora: HTMLElement;
  titulo: string;
  escolher: (atalho: string) => void;
  fechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [grupo, setGrupo] = useState('todos');
  const grupos = [
    { id: 'todos', nome: 'Todos' },
    { id: 'acoes', nome: 'Ações' },
    { id: 'paginas', nome: 'Páginas' },
    { id: 'pesquisas', nome: 'Pesquisas' },
  ];
  const tipo = (item: (typeof atalhosInterface)[number]) =>
    item.id.startsWith('pesquisa-') ? 'pesquisas' : 'rota' in item ? 'paginas' : 'acoes';
  const acesso = useAcessoConta();
  const posicao = useAncoraVisual(ancora);
  const itens = atalhosInterface.filter(
    (item) =>
      item.id !== 'pesquisa-os' &&
      atalhoPermitido(item, acesso.administrador) &&
      (grupo === 'todos' || tipo(item) === grupo) &&
      correspondeBusca(busca, `${item.rotulo} ${item.id}`),
  );
  return (
    <div
      ref={posicao.painel}
      data-personalizador
      data-editor-ui
      className="canvas-inserter"
      style={{ top: posicao.top, left: posicao.left, width: posicao.width }}
      role="region"
      aria-label={titulo}
    >
      <header>
        <div>
          <small>CATÁLOGO DE ATALHOS</small>
          <strong>{titulo}</strong>
        </div>
        <button aria-label="Fechar atalhos" onClick={fechar}>
          <Icone name="close" size={17} />
        </button>
      </header>
      <label className="canvas-inserter-search">
        <Icone name="search" size={16} />
        <input
          autoFocus
          aria-label="Pesquisar atalhos disponíveis"
          placeholder="Pesquisar atalho…"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
      </label>
      <div className="canvas-inserter-groups" role="group" aria-label="Tipo de atalho">
        {grupos.map((item) => (
          <button key={item.id} aria-pressed={grupo === item.id} onClick={() => setGrupo(item.id)}>
            {item.nome}
          </button>
        ))}
      </div>
      <div className="canvas-inserter-count">
        {itens.length} {itens.length === 1 ? 'atalho disponível' : 'atalhos disponíveis'}
      </div>
      <div className="canvas-inserter-list">
        {itens.map((item) => (
          <button key={item.id} onClick={() => escolher(item.id)}>
            <span className="canvas-shortcut-icon">
              <Icone name={item.icone} size={18} />
            </span>
            <span className="canvas-shortcut-copy">
              <strong>{item.rotulo}</strong>
              <small>
                {tipo(item) === 'pesquisas'
                  ? 'Campo de pesquisa'
                  : tipo(item) === 'paginas'
                    ? 'Abrir página'
                    : 'Ação rápida'}
              </small>
            </span>
            <Icone name="plus" size={15} />
          </button>
        ))}
        {!itens.length && <p>Nenhum atalho encontrado.</p>}
      </div>
      <footer className="canvas-inserter-footer">
        <Icone name="lock" size={13} /> Visível somente na sua conta
      </footer>
    </div>
  );
}
