import { useEffect, useMemo, useState } from 'react';
import { request } from '../../services/api/transporte';
import { useAcessoConta } from '../../services/acessoConta';
import { Icone } from '../MenuAdmin';
import { SkeletonRow } from '../Skeleton';
import { correspondeBusca } from '../../utils/buscaAproximada';
import { useDadosVivos } from '../../hooks/useDadosVivos';
import './gestao-administradores.css';

type EstadoAcesso = 'pendente' | 'aprovado' | 'recusado';
type Nivel = 'administrador' | 'superadministrador' | 'dono';
type Administrador = {
  id: string;
  nome: string;
  email: string;
  nivel: Nivel;
  estado: EstadoAcesso;
  solicitadoEm?: string | null;
  solicitadoPor?: string | null;
};
type PedidoFuncionario = {
  id: string;
  authUserId?: string | null;
  nome: string;
  email: string;
  cargo: string;
  departamento?: string | null;
  solicitadoEm: string;
  estado: EstadoAcesso;
};
type PedidoUnificado = {
  id: string;
  tipo: 'administrador' | 'funcionario';
  pessoaId: string;
  nome: string;
  email: string;
  cargo: string;
  nivel?: Nivel;
  estado: EstadoAcesso;
  solicitadoEm?: string | null;
  solicitadoPor?: string | null;
};
type Aba = EstadoAcesso;

const rotuloNivel: Record<Nivel, string> = {
  dono: 'Dono',
  superadministrador: 'Superadministrador',
  administrador: 'Administrador',
};
const podeAprovar = (nivel?: Nivel) => nivel === 'dono' || nivel === 'superadministrador';

export default function GestaoAdministradores() {
  const acesso = useAcessoConta();
  const [administradores, setAdministradores] = useState<Administrador[]>([]);
  const [pedidosFuncionarios, setPedidosFuncionarios] = useState<PedidoFuncionario[]>([]);
  const [aba, setAba] = useState<Aba>('pendente');
  const [busca, setBusca] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(podeAprovar(acesso.nivel));
  const [ocupado, setOcupado] = useState('');

  async function carregar(signal?: AbortSignal) {
    const [resultado, pedidos] = await Promise.all([
      request<{ items: Administrador[] }>('/api/admin/security/admins', {
        method: 'GET',
        signal,
      }),
      request<{ items: PedidoFuncionario[] }>('/api/admin/security/employee-requests', {
        method: 'GET',
        signal,
      }),
    ]);
    if (!signal?.aborted) {
      setAdministradores(resultado.items);
      setPedidosFuncionarios(pedidos.items);
      setErro('');
    }
  }

  useDadosVivos(
    async (valido) => {
      if (valido() && podeAprovar(acesso.nivel)) await carregar();
    },
    podeAprovar(acesso.nivel),
    acesso.nivel ?? '',
  );

  useEffect(() => {
    if (!podeAprovar(acesso.nivel)) {
      setCarregando(false);
      setErro('Somente superadministradores e a dona podem consultar as aprovações.');
      return;
    }
    const controle = new AbortController();
    setCarregando(true);
    void carregar(controle.signal)
      .catch((falha: unknown) => {
        if (!controle.signal.aborted)
          setErro(falha instanceof Error ? falha.message : 'Não foi possível carregar as aprovações.');
      })
      .finally(() => {
        if (!controle.signal.aborted) setCarregando(false);
      });
    return () => controle.abort();
  }, [acesso.nivel]);

  const itens = useMemo<PedidoUnificado[]>(() => {
    const idsAdministradores = new Set(administradores.map((item) => item.id));
    const linhasAdmin: PedidoUnificado[] = administradores.map((item) => ({
      id: `admin:${item.id}`,
      pessoaId: item.id,
      tipo: 'administrador',
      nome: item.nome,
      email: item.email,
      cargo: rotuloNivel[item.nivel],
      nivel: item.nivel,
      estado: item.estado,
      solicitadoEm: item.solicitadoEm,
      solicitadoPor: item.solicitadoPor,
    }));
    const linhasFuncionarios: PedidoUnificado[] = pedidosFuncionarios
      .filter((item) => !item.authUserId || !idsAdministradores.has(item.authUserId))
      .map((item) => ({
        id: `funcionario:${item.id}`,
        pessoaId: item.id,
        tipo: item.cargo.trim().toLocaleLowerCase('pt-BR') === 'administrador'
          ? 'administrador'
          : 'funcionario',
        nome: item.nome,
        email: item.email,
        cargo: item.cargo,
        estado: item.estado,
        solicitadoEm: item.solicitadoEm,
      }));
    return [...linhasAdmin, ...linhasFuncionarios].sort(
      (a, b) => (b.solicitadoEm ?? '').localeCompare(a.solicitadoEm ?? ''),
    );
  }, [administradores, pedidosFuncionarios]);

  const pendentes = itens.filter((item) => item.estado === 'pendente').length;
  const visiveis = itens.filter(
    (item) =>
      item.estado === aba &&
      correspondeBusca(busca, `${item.nome} ${item.email} ${item.cargo}`),
  );

  async function decidirFuncionario(item: PedidoUnificado, decisao: 'aprovar' | 'recusar') {
    setOcupado(item.id);
    setMensagem('');
    setErro('');
    try {
      await request(`/api/admin/security/employee-requests/${item.pessoaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ decisao }),
      });
      await carregar();
      setMensagem(
        decisao === 'aprovar'
          ? `Cadastro de ${item.nome} aprovado; o acesso foi criado.`
          : `Solicitação de ${item.nome} recusada.`,
      );
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível decidir a solicitação.');
    } finally {
      setOcupado('');
    }
  }

  async function decidirAdministrador(
    item: PedidoUnificado,
    nivel: 'administrador' | 'superadministrador' | 'recusado',
  ) {
    setOcupado(item.id);
    setMensagem('');
    setErro('');
    try {
      await request(`/api/admin/security/admins/${item.pessoaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ nivel }),
      });
      await carregar();
      setMensagem(
        nivel === 'recusado'
          ? `Solicitação de ${item.nome} recusada.`
          : nivel === 'superadministrador'
            ? `${item.nome} agora é superadministrador.`
            : `Acesso de ${item.nome} atualizado.`,
      );
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar o acesso.');
    } finally {
      setOcupado('');
    }
  }

  if (!podeAprovar(acesso.nivel)) return null;

  return (
    <section className="acessos-workspace" aria-labelledby="admin-authorities-title">
      <header className="acessos-titulo">
        <div>
          <h2 id="admin-authorities-title">Acessos e aprovações</h2>
          <p>Solicitações de funcionários e administradores reunidas em uma única lista.</p>
        </div>
        <span className="acessos-nivel">
          <Icone name="shield" size={14} />
          {rotuloNivel[acesso.nivel!]}
        </span>
      </header>

      <section className="acessos-painel" aria-label="Solicitações e acessos da equipe">
        <div className="acessos-toolbar">
          <div className="acessos-segmentos" role="group" aria-label="Filtrar aprovações">
            {(
              [
                ['pendente', 'Solicitações'],
                ['aprovado', 'Aprovados'],
                ['recusado', 'Recusados'],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                aria-pressed={aba === id}
                onClick={() => setAba(id)}
              >
                {rotulo}
                {id === 'pendente' && <span>{pendentes}</span>}
              </button>
            ))}
          </div>
          <label className="acessos-busca">
            <Icone name="search" size={16} />
            <input
              aria-label="Buscar por nome, e-mail, cargo ou nível"
              placeholder="Buscar nome ou e-mail"
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
            />
          </label>
        </div>
        <div className="acessos-colunas" aria-hidden="true">
          <span>Pessoa</span>
          <span>Nível de acesso</span>
          <span>Ações</span>
        </div>
        {carregando ? (
          <div className="acessos-carregando" role="status" aria-label="Carregando aprovações">
            {[0, 1, 2].map((id) => (
              <div key={id}>
                <SkeletonRow width="34px" height={34} />
                <SkeletonRow width="45%" />
                <SkeletonRow width="18%" />
              </div>
            ))}
          </div>
        ) : visiveis.length ? (
          <ul className="acessos-lista">
            {visiveis.map((item) => {
              const solicitacaoDeFuncionario = item.id.startsWith('funcionario:');
              const podePromover = acesso.nivel === 'dono' && item.tipo === 'administrador';
              return (
                <li key={item.id}>
                  <div className="acessos-pessoa">
                    <span
                      className="acessos-avatar"
                      data-nivel={item.estado === 'pendente' ? 'pendente' : item.nivel ?? 'administrador'}
                    >
                      {item.nome
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((parte) => parte[0])
                        .join('')
                        .toUpperCase()}
                    </span>
                    <div>
                      <b>{item.nome}</b>
                      <small>{item.email}</small>
                      <small>
                        {item.cargo}
                        {item.solicitadoEm
                          ? ` · ${new Date(item.solicitadoEm).toLocaleDateString('pt-BR')}`
                          : ''}
                      </small>
                      {item.solicitadoPor && (
                        <small className="acessos-origem">Solicitado por {item.solicitadoPor}</small>
                      )}
                    </div>
                  </div>
                  <span
                    className="acessos-papel"
                    data-nivel={item.estado === 'pendente' ? 'pendente' : item.nivel ?? 'administrador'}
                  >
                    <Icone
                      name={item.estado === 'pendente' ? 'clock' : item.nivel === 'dono' ? 'lock' : item.nivel === 'superadministrador' ? 'shield' : 'staff'}
                      size={13}
                    />
                    {item.estado === 'pendente'
                      ? `Aguardando aprovação · ${item.tipo === 'administrador' ? 'Administrador' : 'Funcionário'}`
                      : item.nivel
                        ? rotuloNivel[item.nivel]
                        : 'Funcionário aprovado'}
                  </span>
                  <div className="acessos-acoes">
                    {item.estado === 'pendente' ? (
                      <>
                        <button
                          className="acessos-aprovar"
                          disabled={!!ocupado}
                          onClick={() =>
                            solicitacaoDeFuncionario
                              ? void decidirFuncionario(item, 'aprovar')
                              : void decidirAdministrador(item, 'administrador')
                          }
                        >
                          <Icone name="check" size={15} />
                          {ocupado === item.id ? 'Aguarde…' : 'Aprovar'}
                        </button>
                        <button
                          disabled={!!ocupado}
                          onClick={() =>
                            solicitacaoDeFuncionario
                              ? void decidirFuncionario(item, 'recusar')
                              : void decidirAdministrador(item, 'recusado')
                          }
                        >
                          Recusar
                        </button>
                      </>
                    ) : item.estado === 'aprovado' && podePromover && item.nivel !== 'dono' ? (
                      <button
                        disabled={!!ocupado}
                        onClick={() =>
                          void decidirAdministrador(
                            item,
                            item.nivel === 'superadministrador'
                              ? 'administrador'
                              : 'superadministrador',
                          )
                        }
                      >
                        <Icone name={item.nivel === 'superadministrador' ? 'staff' : 'shield'} size={14} />
                        {ocupado === item.id
                          ? 'Atualizando…'
                          : item.nivel === 'superadministrador'
                            ? 'Definir administrador'
                            : 'Tornar superadministrador'}
                      </button>
                    ) : item.nivel === 'dono' ? (
                      <span className="acessos-protegido">
                        <Icone name="lock" size={13} /> Protegido
                      </span>
                    ) : (
                      <span className="acessos-protegido">Sem ação pendente</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="acessos-vazio">
            <span>
              <Icone name={busca ? 'search' : 'check'} size={25} />
            </span>
            <h3>
              {busca
                ? 'Nenhum acesso encontrado'
                : aba === 'pendente'
                  ? 'Nenhuma solicitação pendente'
                  : aba === 'aprovado'
                    ? 'Nenhum acesso aprovado nesta lista'
                    : 'Nenhuma solicitação recusada'}
            </h3>
            <p>
              {busca
                ? 'Tente outro nome, e-mail ou cargo.'
                : 'Pedidos de funcionários e administradores aparecerão aqui.'}
            </p>
          </div>
        )}
        <footer className="acessos-rodape">
          <span>{visiveis.length} {visiveis.length === 1 ? 'acesso nesta lista' : 'acessos nesta lista'}</span>
        </footer>
      </section>
      {mensagem && (
        <p className="acessos-feedback" role="status">
          <Icone name="check" size={16} /> {mensagem}
        </p>
      )}
      {erro && (
        <p className="acessos-feedback erro" role="alert">
          {erro}
          <button type="button" onClick={() => void carregar().catch(() => setErro('Não foi possível carregar as aprovações.'))}>
            Tentar novamente
          </button>
        </p>
      )}
    </section>
  );
}
