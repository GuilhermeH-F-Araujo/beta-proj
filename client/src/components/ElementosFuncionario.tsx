import CartaoIndicador from './CartaoIndicador';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fotoFuncionario, type SituacaoFuncionario } from '../services/funcionarios';
import { Icone } from './MenuAdmin';

const recursos = {
  equipe: '491-2-imgSvg',
  ativos: '491-2-imgSvg3',
  ferias: '491-2-imgSvg5',
  abertas: '491-2-imgSvg7',
  concluidas: '491-933-imgSvg7',
  total: '491-933-imgSvg6',
  espera: '491-933-imgSvg9',
  canceladas: '491-933-imgSvg10',
  overview: '491-437-imgSvg11',
  desempenho: '491-437-imgSvg12',
  ordens: '491-437-imgSvg13',
  dados: '491-437-imgSvg14',
  salvar: '491-1320-imgSvg3',
  editar: '491-1320-imgSvg8',
  camera: '491-1320-imgSvg9',
  seguranca: '491-1320-imgSvg10',
  senha: '491-1320-imgSvg11',
  bloquear: '491-1320-imgSvg12',
  identificacao: '491-1320-imgSvg4',
  baixar: '491-437-imgSvg8',
  remover: '491-437-imgSvg9',
  grafico: '491-437-imgSvg5',
  perfilConcluidas: '491-437-imgSvg3',
  perfilAbertas: '491-437-imgSvg4',
  perfilTaxa: '491-437-imgSvg5',
  perfilTotal: '491-437-imgFrame',
  perfilSalvar: '491-437-imgSvg1',
  perfilChevron: '491-437-imgSvg',
} as const;
export function IconeFuncionario({ name: nomeLocal }: { name: keyof typeof recursos }) {
  const src = `/assets/funcionarios/${recursos[nomeLocal]}.svg`;
  const abaIcone = ['overview', 'desempenho', 'ordens', 'dados'].includes(nomeLocal);
  return (
    <span
      className={`staff-figma-icon${abaIcone ? ' staff-profile-tab-icon' : ''}`}
      style={abaIcone ? ({ '--staff-tab-icon': `url("${src}")` } as CSSProperties) : undefined}
      aria-hidden="true"
    >
      <img src={src} alt="" />
    </span>
  );
}
export const situacoes: Record<SituacaoFuncionario, string> = {
  ativo: 'Ativo',
  ferias: 'Em férias',
  afastado: 'Afastado',
  desligado: 'Desligado',
  nao_informado: 'Não informado',
};
export const dinheiro = (valorAtual: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorAtual);
export const dadosCurta = (valorAtual: string | null | undefined) =>
  valorAtual
    ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
        new Date(`${valorAtual.slice(0, 10)}T12:00:00Z`),
      )
    : '—';
export const normalizar = (valorAtual: string) =>
  valorAtual
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
export function Situacao({ value: valor }: { value: SituacaoFuncionario }) {
  return <span className={`staff-status ${valor}`}>{situacoes[valor] ?? 'Não informado'}</span>;
}
export function AvatarFuncionario({
  id,
  nome,
  versao = 0,
  large: grande = false,
}: {
  id: number;
  nome: string;
  versao?: number;
  large?: boolean;
}) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [id, versao]);
  return (
    <span className={`staff-avatar${grande ? ' large' : ''}`}>
      {falhou ? (
        <span aria-label={`Iniciais de ${nome}`}>
          {nome
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((registroAtual) => registroAtual[0])
            .join('')
            .toUpperCase()}
        </span>
      ) : (
        <img
          src={fotoFuncionario(id, versao)}
          alt={`Foto de ${nome}`}
          loading="lazy"
          onError={() => setFalhou(true)}
        />
      )}
    </span>
  );
}
export function PainelFuncionario({
  title: titulo,
  subtitle: subtitulo,
  action: acao,
  children: conteudo,
  className: nomeClasse = '',
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`staff-panel ${nomeClasse}`}>
      <header>
        <div>
          <h2>{titulo}</h2>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {acao}
      </header>
      {conteudo}
    </section>
  );
}
const iconesMetricas: Partial<Record<keyof typeof recursos, string>> = {
  equipe: 'users',
  ativos: 'check',
  ferias: 'sun',
  abertas: 'clock',
  concluidas: 'check',
  total: 'list-checks',
  espera: 'package',
  canceladas: 'circle-x',
  perfilConcluidas: 'clipboard-check',
  perfilAbertas: 'clock',
  perfilTaxa: 'trending',
  perfilTotal: 'clipboard',
};
export function MetricaFuncionario({
  editorId,
  hidden: oculto = false,
  title: titulo,
  value: valor,
  description: descricao,
  icon: icone,
  tone: tom = 'rose',
  trend: tendencia,
  trendLabel: tendenciaRotulo = 'Evolução no período',
  onClick: aoClicar,
  active: ativoLocal = false,
}: {
  editorId?: string;
  hidden?: boolean;
  title: string;
  value: number | string;
  description: string;
  icon: keyof typeof recursos;
  tone?: string;
  trend?: number[];
  trendLabel?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <CartaoIndicador
      titulo={titulo}
      valor={valor}
      descricao={descricao}
      icone={iconesMetricas[icone] ?? 'users'}
      tom={tom}
      editorId={editorId ? `funcionarios:${editorId}` : undefined}
      oculto={oculto}
      ativo={ativoLocal}
      aoClicar={aoClicar}
      tendencia={tendencia}
      rotuloTendencia={tendenciaRotulo}
    />
  );
}

export function PaginacaoFuncionario({
  page: pagina,
  total,
  count: quantidade,
  size: tamanho,
  onChange: aoAlterar,
  label: rotulo = 'resultados',
}: {
  page: number;
  total: number;
  count: number;
  size: number;
  onChange: (pagina: number) => void;
  label?: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / tamanho));
  const escolhas = [...new Set([1, pagina - 1, pagina, pagina + 1, paginas])]
    .filter((registroAtual) => registroAtual > 0 && registroAtual <= paginas)
    .sort((primeiroElemento, segundoElemento) => primeiroElemento - segundoElemento);
  return (
    <footer className="staff-pagination">
      <span>
        {total
          ? `Mostrando ${(pagina - 1) * tamanho + 1} a ${(pagina - 1) * tamanho + quantidade} de ${total} ${rotulo}`
          : `Nenhum ${rotulo}`}
      </span>
      <nav aria-label="Paginação">
        <button
          disabled={pagina <= 1}
          onClick={() => aoAlterar(pagina - 1)}
          aria-label="Página anterior"
        >
          <Icone name="left" size={14} />
        </button>
        {escolhas.map((registroAtual, indice) => (
          <span key={registroAtual}>
            {indice > 0 && registroAtual > escolhas[indice - 1] + 1 && <i>…</i>}
            <button
              className={pagina === registroAtual ? 'active' : ''}
              aria-current={pagina === registroAtual ? 'page' : undefined}
              onClick={() => aoAlterar(registroAtual)}
            >
              {registroAtual}
            </button>
          </span>
        ))}
        <button
          disabled={pagina >= paginas}
          onClick={() => aoAlterar(pagina + 1)}
          aria-label="Próxima página"
        >
          <Icone name="right" size={14} />
        </button>
      </nav>
    </footer>
  );
}
export function DialogoFuncionario({
  title: titulo,
  description: descricao,
  onClose: aoFechar,
  children: conteudo,
  className: nomeClasse = '',
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const referencia = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    referencia.current?.querySelector<HTMLElement>('button,input,textarea')?.focus();
    const chave = (eventoRecebido: KeyboardEvent) => {
      if (eventoRecebido.key === 'Escape') fechar.current();
      if (eventoRecebido.key === 'Tab') {
        const elementos = referencia.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        );
        if (!elementos?.length) return;
        const primeiro = elementos[0];
        const ultimo = elementos[elementos.length - 1];
        if (eventoRecebido.shiftKey && document.activeElement === primeiro) {
          eventoRecebido.preventDefault();
          ultimo.focus();
        } else if (!eventoRecebido.shiftKey && document.activeElement === ultimo) {
          eventoRecebido.preventDefault();
          primeiro.focus();
        }
      }
    };
    window.addEventListener('keydown', chave);
    return () => {
      window.removeEventListener('keydown', chave);
      anterior?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="staff-dialog-overlay"
      onMouseDown={(eventoRecebido) => {
        if (eventoRecebido.target === eventoRecebido.currentTarget) aoFechar();
      }}
    >
      <div
        ref={referencia}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-dialog-title"
        className={`staff-dialog ${nomeClasse}`}
      >
        <header>
          <div>
            <h2 id="staff-dialog-title">{titulo}</h2>
            {descricao && <p>{descricao}</p>}
          </div>
          <button onClick={aoFechar} aria-label="Fechar">
            <Icone name="close" size={18} />
          </button>
        </header>
        {conteudo}
      </div>
    </div>,
    document.body,
  );
}
export function baixarRegistro(nome: string, linhas: (string | number | null)[][]) {
  const seguro = (valorAtual: string | number | null) => {
    let textoAtual = String(valorAtual ?? '');
    if (/^[=+@\-\t\r]/.test(textoAtual)) textoAtual = "'" + textoAtual;
    return '"' + textoAtual.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob(
      [
        '\ufeff' +
          linhas.map((resultadoAtual) => resultadoAtual.map(seguro).join(';')).join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8;' },
    ),
  );
  const ligacao = document.createElement('a');
  ligacao.href = url;
  ligacao.download = nome;
  ligacao.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
