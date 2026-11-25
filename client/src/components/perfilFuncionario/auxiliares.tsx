import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  type EdicaoFuncionario,
  type OrdemFuncionario,
  type PerfilFuncionario,
  type SituacaoFuncionario,
} from '../../services/funcionarios';
import {
  IconeFuncionario,
  MetricaFuncionario,
  PaginacaoFuncionario,
  PainelFuncionario,
  baixarRegistro,
  dadosCurta,
  dinheiro,
  situacoes,
} from '../ElementosFuncionario';
import { Icone } from '../MenuAdmin';
import { type FiltroOpcao } from '../SeletorFiltro';
import { correspondeBusca } from '../../utils/buscaAproximada';

export const cores = ['#10a553', '#ff9b24', '#9852fa', '#ff3454'];

export const rotulos: Record<string, string> = {
  aguardando: 'Em aberto',
  'em andamento': 'Em andamento',
  'aguardando peça': 'Aguardando peças',
  pronto: 'Concluída',
  entregue: 'Concluída',
  cancelada: 'Cancelada',
};

export const situacaoTons: Record<SituacaoFuncionario, string> = {
  ativo: 'green',
  ferias: 'amber',
  afastado: 'gray',
  desligado: 'rose',
  nao_informado: 'gray',
};

export const situacaoOpcoes: FiltroOpcao<SituacaoFuncionario>[] = Object.entries(situacoes).map(
  ([valor, rotulo]) => ({
    value: valor as SituacaoFuncionario,
    label: rotulo,
    tone: situacaoTons[valor as SituacaoFuncionario],
  }),
);

export const cargos: [EdicaoFuncionario['cargo'], string, string][] = [
  ['Administrador', 'Administrador', 'user'],
  ['Gerente', 'Gerente', 'staff'],
  ['Mecânico', 'Mecânico', 'wrench'],
  ['Atendente', 'Atendente', 'user'],
  ['Cliente', 'Cliente', 'user'],
];

export const modeloEdicao = (registroAtual: PerfilFuncionario['pessoa']): EdicaoFuncionario => ({
  nome: registroAtual.nome,
  cargo: (['Administrador', 'Gerente', 'Mecânico', 'Atendente', 'Cliente'].includes(registroAtual.cargo)
    ? registroAtual.cargo
    : 'Administrador') as EdicaoFuncionario['cargo'],
  telefone: registroAtual.telefone ?? '',
  cpf: registroAtual.cpf,
  nascimento: registroAtual.nascimento ?? '',
  admissao: registroAtual.admissao ?? '',
  departamento: registroAtual.departamento ?? '',
  especialidade: registroAtual.especialidade ?? '',
  endereco: registroAtual.endereco ?? '',
  situacao: registroAtual.situacao === 'nao_informado' ? 'ativo' : registroAtual.situacao,
});

export function IlustracaoAcesso({ tipo }: { tipo: 'senha' | 'bloquear' | 'desbloquear' }) {
  if (tipo === 'senha')
    return (
      <img
        className="staff-security-illustration photo"
        src="/assets/funcionarios/security-password-workshop.webp"
        alt="Notebook da oficina com confirmação de senha segura"
      />
    );
  if (tipo === 'bloquear')
    return (
      <img
        className="staff-security-illustration photo badge"
        src="/assets/funcionarios/security-access-badge.webp"
        alt="Crachá genérico com acesso bloqueado"
      />
    );
  const ok = tipo === 'desbloquear';
  const destaque = ok ? '#16804a' : '#d92335';
  const suave = ok ? '#e9f6ee' : '#fff0f1';
  return (
    <svg className="staff-security-illustration" viewBox="0 0 180 124" aria-hidden="true">
      <rect x="4" y="4" width="172" height="116" rx="23" fill="var(--theme-surface, #f1f5fb)" />
      <circle cx="150" cy="23" r="4" fill="var(--theme-surface, #dce5f2)" />
      <circle cx="22" cy="91" r="5" fill="var(--theme-surface, #dce5f2)" />
      <rect
        x="26"
        y="17"
        width="73"
        height="91"
        rx="12"
        fill="var(--theme-surface, #fff)"
        stroke="var(--theme-border, #dbe4f0)"
      />
      <circle cx="62.5" cy="43" r="12" fill="var(--theme-surface, #dce8fa)" />
      <path d="M43 70c2.7-10 9.2-15 19.5-15S79.3 60 82 70" fill="var(--theme-surface, #cad9f2)" />
      <rect x="41" y="78" width="43" height="4" rx="2" fill="var(--theme-surface, #d8e1ee)" />
      <rect x="47" y="87" width="31" height="3" rx="1.5" fill="var(--theme-surface, #e7ecf4)" />
      <g>
        <circle cx="132" cy="65" r="25" fill={suave} />
        <g
          fill="none"
          stroke={destaque}
          strokeWidth="3.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M124 62v-5a8 8 0 0 1 15-4" />
          <rect x="121" y="62" width="23" height="18" rx="4" />
          <path d="m127 71 3 3 7-7" strokeWidth="2.2" />
        </g>
        <circle cx="153" cy="89" r="9" fill="var(--theme-surface, #d8f0e1)" />
        <path
          d="m149 89 2.5 2.5 5-5"
          fill="none"
          stroke={destaque}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function Campo({
  label: rotulo,
  icon: icone,
  children: conteudo,
  tone: tom,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className={`staff-field staff-field-${icone}`}>
      {icone === 'identificacao' ? (
        <IconeFuncionario name="identificacao" />
      ) : icone === 'status' ? (
        <span className={`staff-field-status-dot ${tom ?? 'blue'}`} aria-hidden="true" />
      ) : (
        <Icone name={icone} size={18} />
      )}
      <label>
        <span>{rotulo}</span>
        <span className="staff-field-control">{conteudo}</span>
      </label>
    </div>
  );
}

export function Vazio({ text: textoLocal }: { text: string }) {
  return <p className="staff-panel-empty">{textoLocal}</p>;
}

export function SituacaoOrdem({ value: valor }: { value: string }) {
  return (
    <span
      className={`staff-order-status ${valor === 'pronto' || valor === 'entregue' ? 'completed' : valor === 'cancelada' ? 'cancelled' : valor === 'aguardando peça' ? 'parts' : valor === 'em andamento' ? 'in-progress' : 'open'}`}
    >
      {rotulos[valor] ?? valor}
    </span>
  );
}

export function Legenda() {
  return (
    <ul className="staff-chart-legend">
      <li>
        <i style={{ background: cores[0] }} />
        Ordens Concluídas
      </li>
      <li>
        <i style={{ background: cores[3] }} />
        Ordens em Aberto
      </li>
      <li>
        <i style={{ background: '#1685ff' }} />
        Taxa de Conclusão (%)
      </li>
    </ul>
  );
}

export function GraficoFuncionario({ series: serie }: { series: PerfilFuncionario['series'] }) {
  const maximo = Math.max(
    5,
    ...serie.flatMap((textoAtual) => [
      textoAtual.concluidas,
      textoAtual.abertas + textoAtual.pecas,
    ]),
  );
  const itemAtual = (indiceLocal: number) =>
    60 + indiceLocal * (640 / Math.max(1, serie.length - 1));
  const pontos = (chave: 'concluidas' | 'abertas' | 'taxa') =>
    serie.map((textoAtual, indiceLocal) => [
      itemAtual(indiceLocal),
      120 -
        (chave === 'taxa'
          ? textoAtual.taxa / 100
          : (chave === 'abertas' ? textoAtual.abertas + textoAtual.pecas : textoAtual.concluidas) /
            maximo) *
          100,
    ]);
  return (
    <svg
      className="staff-line-chart"
      viewBox="0 0 760 156"
      role="img"
      aria-label="Evolução de ordens concluídas, em aberto e taxa de conclusão nos últimos seis meses"
    >
      <text x="12" y="70" textAnchor="middle" transform="rotate(-90 12 70)">
        Ordens
      </text>
      <text x="748" y="70" textAnchor="middle" transform="rotate(-90 748 70)">
        Taxa de Conclusão (%)
      </text>
      {[0, 1, 2, 3].map((indiceLocal) => (
        <g key={indiceLocal}>
          <line
            x1="60"
            x2="700"
            y1={120 - indiceLocal * 30}
            y2={120 - indiceLocal * 30}
            stroke="var(--theme-border, #e2e8f0)"
          />
          <text x="48" y={124 - indiceLocal * 30} textAnchor="end">
            {Math.round((maximo * indiceLocal) / 3)}
          </text>
          <text x="710" y={124 - indiceLocal * 30}>
            {Math.round((indiceLocal / 3) * 100)}%
          </text>
        </g>
      ))}
      {(['concluidas', 'abertas', 'taxa'] as const).map((chave, chaveAtual) => (
        <g key={chave}>
          <polyline
            points={pontos(chave)
              .map((registroAtual) => registroAtual.join(','))
              .join(' ')}
            fill="none"
            stroke={[cores[0], cores[3], '#1685ff'][chaveAtual]}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {pontos(chave).map(([cx, cy], indiceLocal) => (
            <circle
              key={indiceLocal}
              cx={cx}
              cy={cy}
              r="3"
              fill={[cores[0], cores[3], '#1685ff'][chaveAtual]}
            />
          ))}
        </g>
      ))}
      {serie.map((textoAtual, indiceLocal) => (
        <text key={textoAtual.mes} x={itemAtual(indiceLocal)} y="151" textAnchor="middle">
          {new Intl.DateTimeFormat('pt-BR', {
            month: 'short',
            year: '2-digit',
            timeZone: 'UTC',
          }).format(new Date(`${textoAtual.mes}-15T12:00:00Z`))}
        </text>
      ))}
    </svg>
  );
}

export function OrdensFuncionario({ profile: perfil }: { profile: PerfilFuncionario }) {
  const resultadoAtual = perfil.resumo;
  const [busca, setBusca] = useState('');
  const [situacaoLocal, setSituacao] = useState('todos');
  const [servicoLocal, setServico] = useState('todos');
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState(false);
  const [atrasadosOnly, setAtrasadosOnly] = useState(false);
  const [apenasProximos, setProximoOnly] = useState(false);
  useEffect(
    () => setPagina(1),
    [busca, situacaoLocal, servicoLocal, atrasadosOnly, apenasProximos],
  );
  const agora = Date.now();
  const ativoLocal = (objetoAtual: OrdemFuncionario) =>
    !['pronto', 'entregue', 'cancelada'].includes(objetoAtual.status);
  const atrasado = (objetoAtual: OrdemFuncionario) =>
    ativoLocal(objetoAtual) &&
    !!objetoAtual.previsao &&
    new Date(objetoAtual.previsao).getTime() < agora;
  const proximos = (objetoAtual: OrdemFuncionario) =>
    ativoLocal(objetoAtual) &&
    !!objetoAtual.previsao &&
    new Date(objetoAtual.previsao).getTime() >= agora &&
    new Date(objetoAtual.previsao).getTime() <= agora + 3 * 86400000;
  const proximo = perfil.ordens.filter(proximos).length;
  const filtrado = useMemo(
    () =>
      perfil.ordens.filter(
        (objetoAtual) =>
          (situacaoLocal === 'todos' || objetoAtual.status === situacaoLocal) &&
          (servicoLocal === 'todos' || objetoAtual.servico === servicoLocal) &&
          (!atrasadosOnly || atrasado(objetoAtual)) &&
          (!apenasProximos || proximos(objetoAtual)) &&
          correspondeBusca(
            busca,
            `${objetoAtual.id} OS-${String(objetoAtual.id).padStart(4, '0')} ${objetoAtual.cliente} ${objetoAtual.veiculo} ${objetoAtual.placa ?? ''}`,
          ),
      ),
    [perfil.ordens, situacaoLocal, servicoLocal, busca, atrasadosOnly, apenasProximos],
  );
  const atual = Math.min(pagina, Math.max(1, Math.ceil(filtrado.length / 5)));
  const linhas = filtrado.slice((atual - 1) * 5, atual * 5);
  const grupos = [
    resultadoAtual.concluidas,
    resultadoAtual.abertas,
    resultadoAtual.pecas,
    resultadoAtual.canceladas,
  ];
  const soma = grupos.reduce((numeroLocal, valorAtual) => numeroLocal + valorAtual, 0);
  let inicio = 0;
  const rosca = grupos
    .map((valorAtual, indiceLocal) => {
      const origem = inicio;
      inicio += soma ? (valorAtual / soma) * 100 : 0;
      return `${cores[indiceLocal]} ${origem}% ${inicio}%`;
    })
    .join(',');
  const dias = new Date(
    Number(perfil.mes.slice(0, 4)),
    Number(perfil.mes.slice(5, 7)),
    0,
  ).getDate();
  const tendencia = Array.from(
    { length: dias },
    (_, indiceLocal) =>
      perfil.ordens.filter(
        (objetoAtual) =>
          Number(objetoAtual.entrada.slice(8, 10)) <= indiceLocal + 1 &&
          ['pronto', 'entregue'].includes(objetoAtual.status),
      ).length,
  );
  const maximo = Math.max(5, resultadoAtual.total);
  const area = tendencia
    .map(
      (numeroLocal, indiceLocal) =>
        `${38 + (indiceLocal * 460) / (dias - 1)},${159 - (numeroLocal / maximo) * 130}`,
    )
    .join(' ');
  const gradiente = useId().replaceAll(':', '');
  return (
    <>
      <div
        className="staff-metrics staff-order-metrics indicadores-grid"
        data-indicadores
        data-colunas="5"
      >
        {[
          {
            title: 'Total de OS Atribuídas',
            value: resultadoAtual.total,
            desc: '100% do período',
            icon: 'total',
            tone: 'blue',
          },
          {
            title: 'OS Concluídas',
            value: resultadoAtual.concluidas,
            desc: `${resultadoAtual.total ? Math.round((resultadoAtual.concluidas / resultadoAtual.total) * 100) : 0}% do total`,
            icon: 'concluidas',
            tone: 'green',
          },
          {
            title: 'OS em Aberto',
            value: resultadoAtual.abertas,
            desc: 'Aguardando ou em andamento',
            icon: 'abertas',
            tone: 'red',
          },
          {
            title: 'Aguardando Peças',
            value: resultadoAtual.pecas,
            desc: 'Aguardando reposição',
            icon: 'espera',
            tone: 'purple',
          },
          {
            title: 'OS Canceladas',
            value: resultadoAtual.canceladas,
            desc: 'No período selecionado',
            icon: 'canceladas',
            tone: 'gray',
          },
        ].map((mesAtual) => (
          <MetricaFuncionario
            key={mesAtual.title}
            title={mesAtual.title}
            value={mesAtual.value}
            description={mesAtual.desc}
            icon={mesAtual.icon as 'total'}
            tone={mesAtual.tone}
          />
        ))}
      </div>
      <div className="staff-orders-charts">
        <PainelFuncionario title="Evolução de Ordens de Serviço">
          <div className="staff-chart-legend">
            <span>
              <i style={{ background: cores[0] }} />
              Concluídas
            </span>
            <span>
              <i style={{ background: cores[1] }} />
              Em Aberto
            </span>
            <span>
              <i style={{ background: cores[2] }} />
              Aguardando Peças
            </span>
            <span>
              <i style={{ background: cores[3] }} />
              Canceladas
            </span>
          </div>
          <svg
            className="staff-area-chart"
            viewBox="0 0 530 190"
            role="img"
            aria-label="Ordens atualmente concluídas, acumuladas pela data de entrada no mês"
          >
            <defs>
              <linearGradient id={gradiente} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#10a553" stopOpacity=".13" />
                <stop offset="100%" stopColor="#10a553" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((indiceLocal) => (
              <g key={indiceLocal}>
                <line
                  x1="38"
                  x2="500"
                  y1={159 - indiceLocal * 32}
                  y2={159 - indiceLocal * 32}
                  stroke="var(--theme-border, #e8eef5)"
                />
                <text x="28" y={163 - indiceLocal * 32} textAnchor="end">
                  {Math.round((maximo * indiceLocal) / 4)}
                </text>
              </g>
            ))}
            <polygon points={`38,159 ${area} 498,159`} fill={`url(#${gradiente})`} />
            {grupos.map((_, chaveAtual) => {
              const estados = [
                ['pronto', 'entregue'],
                ['aguardando', 'em andamento'],
                ['aguardando peça'],
                ['cancelada'],
              ][chaveAtual];
              const valores = Array.from(
                { length: dias },
                (_, indiceLocal) =>
                  perfil.ordens.filter(
                    (objetoAtual) =>
                      Number(objetoAtual.entrada.slice(8, 10)) <= indiceLocal + 1 &&
                      estados.includes(objetoAtual.status),
                  ).length,
              );
              return (
                <polyline
                  key={chaveAtual}
                  points={valores
                    .map(
                      (valorAtual, indiceLocal) =>
                        `${38 + (indiceLocal * 460) / (dias - 1)},${159 - (valorAtual / maximo) * 130}`,
                    )
                    .join(' ')}
                  fill="none"
                  stroke={cores[chaveAtual]}
                  strokeWidth="1.8"
                />
              );
            })}
            {[1, 8, 15, 22, dias]
              .filter(
                (valorAtual, indiceLocal, primeiroElemento) =>
                  primeiroElemento.indexOf(valorAtual) === indiceLocal,
              )
              .map((dadosAtual) => (
                <text
                  key={dadosAtual}
                  x={38 + ((dadosAtual - 1) * 460) / (dias - 1)}
                  y="181"
                  textAnchor="middle"
                >
                  {String(dadosAtual).padStart(2, '0')}{' '}
                  {new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(
                    new Date(`${perfil.mes}-15T12:00:00Z`),
                  )}
                </text>
              ))}
          </svg>
        </PainelFuncionario>
        <PainelFuncionario title="Situação das Ordens de Serviço">
          <div className="staff-donut-layout">
            <div
              className="staff-donut"
              role="img"
              aria-label={`${resultadoAtual.total} ordens: ${resultadoAtual.concluidas} concluídas, ${resultadoAtual.abertas} em aberto, ${resultadoAtual.pecas} aguardando peças e ${resultadoAtual.canceladas} canceladas`}
              style={{
                background: soma ? `conic-gradient(${rosca})` : 'var(--theme-raised, #edf1f5)',
              }}
            >
              <div>
                <strong>{resultadoAtual.total}</strong>
                <small>Total de OS</small>
              </div>
            </div>
            <ul>
              {['Concluídas', 'Em Aberto', 'Aguardando Peças', 'Canceladas'].map(
                (rotulo, indiceLocal) => (
                  <li key={rotulo}>
                    <i style={{ background: cores[indiceLocal] }} />
                    <span>{rotulo}</span>
                    <b>
                      {grupos[indiceLocal]} (
                      {soma ? Math.round((grupos[indiceLocal] / soma) * 100) : 0}%)
                    </b>
                  </li>
                ),
              )}
            </ul>
          </div>
        </PainelFuncionario>
        <div className="staff-deadlines">
          <button
            className="staff-panel"
            onClick={() => {
              setFiltros(true);
              setProximoOnly((valorAtual) => !valorAtual);
              setAtrasadosOnly(false);
              setBusca('');
              setSituacao('todos');
              setServico('todos');
            }}
          >
            <Icone name="clock" size={22} />
            <span>
              <h3>OS com prazo próximo</h3>
              <strong>{proximo}</strong>
              <small>Conclusão prevista nos próximos 3 dias</small>
            </span>
          </button>
          <button
            className="staff-panel"
            onClick={() => {
              setFiltros(true);
              setProximoOnly(false);
              setAtrasadosOnly((valorAtual) => !valorAtual);
            }}
            aria-pressed={atrasadosOnly}
          >
            <Icone name="info" size={22} />
            <span>
              <h3>OS atrasadas</h3>
              <strong>{perfil.ordens.filter(atrasado).length}</strong>
              <small>Com previsão de conclusão vencida</small>
            </span>
          </button>
        </div>
      </div>
      <section className="staff-directory staff-orders-directory">
        <header className="staff-orders-toolbar">
          <h2>Lista de Ordens de Serviço</h2>
          <label className="staff-search">
            <Icone name="search" size={15} />
            <input
              value={busca}
              onChange={(eventoRecebido) => setBusca(eventoRecebido.target.value)}
              placeholder="Buscar por nº OS, cliente ou veículo..."
              aria-label="Buscar ordens do funcionário"
            />
          </label>
          <label>
            Situação
            <select
              value={situacaoLocal}
              onChange={(eventoRecebido) => setSituacao(eventoRecebido.target.value)}
            >
              <option value="todos">Todos</option>
              {Object.keys(rotulos).map((textoAtual) => (
                <option key={textoAtual} value={textoAtual}>
                  {rotulos[textoAtual]}
                  {textoAtual === 'pronto'
                    ? ' (pronta)'
                    : textoAtual === 'entregue'
                      ? ' (entregue)'
                      : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tipo de Serviço
            <select
              value={servicoLocal}
              onChange={(eventoRecebido) => setServico(eventoRecebido.target.value)}
            >
              <option value="todos">Todos</option>
              {[...new Set(perfil.ordens.map((objetoAtual) => objetoAtual.servico))]
                .sort()
                .map((textoAtual) => (
                  <option key={textoAtual}>{textoAtual}</option>
                ))}
            </select>
          </label>
          <button
            className="staff-outline"
            aria-expanded={filtros}
            onClick={() => setFiltros((valorAtual) => !valorAtual)}
          >
            <Icone name="sliders" size={15} />
            Mais Filtros
          </button>
        </header>
        {filtros && (
          <div className="staff-advanced">
            <label>
              <input
                type="checkbox"
                checked={atrasadosOnly}
                onChange={(eventoRecebido) => {
                  setAtrasadosOnly(eventoRecebido.target.checked);
                  setProximoOnly(false);
                }}
              />
              Somente OS atrasadas
            </label>
            <label>
              <input
                type="checkbox"
                checked={apenasProximos}
                onChange={(eventoRecebido) => {
                  setProximoOnly(eventoRecebido.target.checked);
                  setAtrasadosOnly(false);
                }}
              />
              Prazo nos próximos 3 dias
            </label>
            <button
              onClick={() => {
                setBusca('');
                setSituacao('todos');
                setServico('todos');
                setAtrasadosOnly(false);
                setProximoOnly(false);
              }}
            >
              Limpar filtros
            </button>
            <button
              onClick={() =>
                baixarRegistro(`ordens-${perfil.pessoa.id}.csv`, [
                  [
                    'OS',
                    'Entrada',
                    'Cliente',
                    'Veículo',
                    'Serviço',
                    'Situação',
                    'Previsão',
                    'Mão de obra',
                  ],
                  ...filtrado.map((objetoAtual) => [
                    objetoAtual.id,
                    dadosCurta(objetoAtual.entrada),
                    objetoAtual.cliente,
                    objetoAtual.veiculo,
                    objetoAtual.servico,
                    rotulos[objetoAtual.status],
                    dadosCurta(objetoAtual.previsao),
                    objetoAtual.maoDeObra,
                  ]),
                ])
              }
            >
              <Icone name="download" size={14} />
              Exportar resultados
            </button>
          </div>
        )}
        <div className="staff-table-scroll">
          <table className="staff-table staff-orders-table">
            <thead>
              <tr>
                {[
                  'Nº da OS',
                  'Data de Entrada',
                  'Cliente',
                  'Veículo',
                  'Tipo de Serviço',
                  'Situação',
                  'Previsão de Conclusão',
                  'Valor (Mão de Obra)',
                  'Ações',
                ].map((alturaAtual) => (
                  <th key={alturaAtual}>{alturaAtual}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((objetoAtual) => (
                <tr key={objetoAtual.id}>
                  <td>
                    <Link to={`/ordens-de-servico/${objetoAtual.id}`}>
                      OS-{String(objetoAtual.id).padStart(4, '0')}
                    </Link>
                  </td>
                  <td>{dadosCurta(objetoAtual.entrada)}</td>
                  <td>{objetoAtual.cliente}</td>
                  <td>
                    {objetoAtual.veiculo}
                    {objetoAtual.ano ? ` - ${objetoAtual.ano}` : ''}
                  </td>
                  <td>{objetoAtual.servico}</td>
                  <td>
                    <SituacaoOrdem value={objetoAtual.status} />
                  </td>
                  <td>{dadosCurta(objetoAtual.previsao)}</td>
                  <td>{objetoAtual.maoDeObra == null ? '—' : dinheiro(objetoAtual.maoDeObra)}</td>
                  <td>
                    <Link
                      className="staff-link"
                      aria-label={`Abrir OS ${objetoAtual.id}`}
                      to={`/ordens-de-servico/${objetoAtual.id}`}
                    >
                      <Icone name="right" size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
              {!linhas.length && (
                <tr>
                  <td colSpan={9}>
                    <Vazio text="Nenhuma ordem encontrada para os filtros selecionados." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginacaoFuncionario
          page={atual}
          total={filtrado.length}
          count={linhas.length}
          size={5}
          onChange={setPagina}
        />
      </section>
      <p className="staff-privacy">
        Os dados apresentados são baseados na data de entrada e na situação atual das ordens de
        serviço do período selecionado.
      </p>
    </>
  );
}
