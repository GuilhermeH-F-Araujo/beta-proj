import type { SupabaseClient } from '@supabase/supabase-js';

type ClienteLinha = {
  id_cliente: number;
  nome: string;
  telefone: string | null;
  foto: string | null;
  excluido_em: string | null;
};
type MotocicletaLinha = {
  id_moto: number;
  id_cliente: number;
  modelo: string;
  placa: string | null;
};
type OrdemLinha = {
  id_os: number;
  id_moto: number;
  status: string;
  data_entrada: string;
  data_saida: string | null;
};

// O PostgREST limita cada resposta; pagine para incluir clientes sem OS nos indicadores.
async function todosLinhas<T>(db: SupabaseClient, tabela: string, colunas: string): Promise<T[]> {
  const linhas: T[] = [];
  for (let deslocamento = 0; ; deslocamento += 500) {
    const primaryChave =
      tabela === 'cliente' ? 'id_cliente' : tabela === 'moto' ? 'id_moto' : 'id_os';
    const { data: dados, error: erro } = await db
      .from(tabela)
      .select(colunas)
      .order(primaryChave)
      .range(deslocamento, deslocamento + 499);
    if (erro) throw erro;
    linhas.push(...((dados as T[]) ?? []));
    if (!dados || dados.length < 500) return linhas;
  }
}

const ativoSituacoes = new Set(['aguardando', 'em andamento', 'aguardando peça', 'pronto']);
const concluidoSituacoes = new Set(['pronto', 'entregue']);

export async function diretorioClientes(db: SupabaseClient) {
  const [clientes, motocicletas, ordens] = await Promise.all([
    todosLinhas<ClienteLinha>(db, 'cliente', 'id_cliente,nome,telefone,foto,excluido_em'),
    todosLinhas<MotocicletaLinha>(db, 'moto', 'id_moto,id_cliente,modelo,placa'),
    todosLinhas<OrdemLinha>(db, 'ordem_servico', 'id_os,id_moto,status,data_entrada,data_saida'),
  ]);
  const motosPorCliente = new Map<number, MotocicletaLinha[]>();
  for (const motocicleta of motocicletas)
    motosPorCliente.set(motocicleta.id_cliente, [
      ...(motosPorCliente.get(motocicleta.id_cliente) ?? []),
      motocicleta,
    ]);
  const motocicletaResponsavel = new Map(
    motocicletas.map((motocicleta) => [motocicleta.id_moto, motocicleta]),
  );
  const ordensPorCliente = new Map<number, OrdemLinha[]>();
  for (const ordem of ordens) {
    const motocicleta = motocicletaResponsavel.get(ordem.id_moto);
    if (motocicleta)
      ordensPorCliente.set(motocicleta.id_cliente, [
        ...(ordensPorCliente.get(motocicleta.id_cliente) ?? []),
        ordem,
      ]);
  }
  const partesDados = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const parte = (tipo: string) => partesDados.find((valor) => valor.type === tipo)?.value ?? '';
  const hoje = `${parte('year')}-${parte('month')}-${parte('day')}`;
  const mes = hoje.slice(0, 7);
  const returnDadosLimite = new Date(`${hoje}T12:00:00Z`);
  returnDadosLimite.setUTCDate(returnDadosLimite.getUTCDate() - 90);

  const ativoClientes = clientes.filter((cliente) => !cliente.excluido_em);
  const ativoIds = new Set(ativoClientes.map((cliente) => cliente.id_cliente));
  const itens = ativoClientes
    .map((cliente) => {
      const motos = motosPorCliente.get(cliente.id_cliente) ?? [];
      const clienteOrdens = (ordensPorCliente.get(cliente.id_cliente) ?? []).sort(
        (primeiroElemento, segundoElemento) =>
          segundoElemento.data_entrada.localeCompare(primeiroElemento.data_entrada) ||
          segundoElemento.id_os - primeiroElemento.id_os,
      );
      const ultimoOrdem = clienteOrdens[0];
      const ativo = clienteOrdens.find((ordem) => ativoSituacoes.has(ordem.status));
      const concluido = clienteOrdens.find((ordem) => concluidoSituacoes.has(ordem.status));
      const primeiroAttendance = clienteOrdens.at(-1)?.data_entrada ?? null;
      const novoThisMes = primeiroAttendance?.slice(0, 7) === mes;
      const awaitingReturn =
        !ativo &&
        !!concluido &&
        (concluido.data_saida ?? concluido.data_entrada).slice(0, 10) <=
          returnDadosLimite.toISOString().slice(0, 10);
      const selecionadoMoto =
        motocicletaResponsavel.get((ativo ?? ultimoOrdem)?.id_moto) ?? motos[0];
      const situacao =
        ativo?.status === 'em andamento'
          ? 'em andamento'
          : ativo?.status === 'aguardando peça'
            ? 'aguardando peça'
            : ativo?.status === 'pronto'
              ? 'pronto'
              : ativo
                ? 'aguardando'
                : awaitingReturn
                  ? 'retorno'
                  : ultimoOrdem?.status === 'entregue'
                    ? 'entregue'
                    : ultimoOrdem?.status === 'cancelada'
                      ? 'cancelada'
                      : 'sem-os';
      return {
        id: cliente.id_cliente,
        name: cliente.nome,
        phone: cliente.telefone,
        hasPhoto: Boolean(cliente.foto),
        photoUrl: cliente.foto?.startsWith('https://') ? cliente.foto : null,
        motorcycle: selecionadoMoto?.modelo ?? null,
        plate: selecionadoMoto?.placa ?? null,
        motorcycles: motos.map((motocicleta) => ({
          id: motocicleta.id_moto,
          model: motocicleta.modelo,
          plate: motocicleta.placa,
        })),
        firstAttendance: primeiroAttendance,
        lastAttendance: ultimoOrdem?.data_entrada ?? null,
        situation: situacao,
        active: Boolean(ativo),
        awaitingReturn,
        newThisMonth: novoThisMes,
        motorcycleCount: motos.length,
        orderCount: clienteOrdens.length,
      };
    })
    .sort((primeiroElemento, segundoElemento) =>
      primeiroElemento.name.localeCompare(segundoElemento.name, 'pt-BR'),
    );
  return {
    items: itens,
    counts: {
      all: itens.length,
      active: itens.filter((item) => item.active).length,
      return: itens.filter((item) => item.awaitingReturn).length,
      new: itens.filter((item) => item.newThisMonth).length,
    },
    models: [
      ...new Set(
        motocicletas
          .filter((motocicleta) => ativoIds.has(motocicleta.id_cliente))
          .map((motocicleta) => motocicleta.modelo)
          .filter(Boolean),
      ),
    ].sort((primeiroElemento, segundoElemento) =>
      primeiroElemento.localeCompare(segundoElemento, 'pt-BR'),
    ),
  };
}

export async function perfilClienteNoDiretorio(db: SupabaseClient, id: number) {
  const { data: cliente, error: erro } = await db
    .from('cliente')
    .select(
      'id_cliente,nome,telefone,email,cpf,foto,data_nascimento,cep,endereco,numero,complemento,bairro,cidade,estado',
    )
    .eq('id_cliente', id)
    .is('excluido_em', null)
    .maybeSingle();
  if (erro) throw erro;
  if (!cliente) return null;
  const { data: motocicletas, error: motosErro } = await db
    .from('moto')
    .select('id_moto,modelo,placa,ano,cor,quilometragem')
    .eq('id_cliente', id)
    .order('id_moto', { ascending: false });
  if (motosErro) throw motosErro;
  const ids = (motocicletas ?? []).map((motocicleta) => motocicleta.id_moto);
  const ordens: (OrdemLinha & { total: number | null; problema_relatado: string | null })[] = [];
  if (ids.length)
    for (let deslocamento = 0; ; deslocamento += 500) {
      const { data: dados, error: ordensErro } = await db
        .from('ordem_servico')
        .select('id_os,id_moto,status,data_entrada,data_saida,total,problema_relatado')
        .in('id_moto', ids)
        .order('id_os')
        .range(deslocamento, deslocamento + 499);
      if (ordensErro) throw ordensErro;
      ordens.push(...(dados ?? []));
      if (!dados || dados.length < 500) break;
    }
  ordens.sort(
    (primeiroElemento, segundoElemento) =>
      segundoElemento.data_entrada.localeCompare(primeiroElemento.data_entrada) ||
      segundoElemento.id_os - primeiroElemento.id_os,
  );
  return {
    id: cliente.id_cliente,
    name: cliente.nome,
    phone: cliente.telefone,
    email: cliente.email,
    cpf: cliente.cpf,
    birthDate: cliente.data_nascimento,
    postalCode: cliente.cep,
    address: cliente.endereco,
    addressNumber: cliente.numero,
    complement: cliente.complemento,
    district: cliente.bairro,
    city: cliente.cidade,
    state: cliente.estado,
    hasPhoto: Boolean(cliente.foto),
    photoUrl: cliente.foto?.startsWith('https://') ? cliente.foto : null,
    photoRevision: cliente.foto,
    motorcycles: motocicletas ?? [],
    orders: ordens,
    summary: {
      motorcycleCount: motocicletas?.length ?? 0,
      orderCount: ordens.length,
      recordedTotal: ordens.reduce((soma, ordem) => soma + Number(ordem.total ?? 0), 0),
      firstAttendance: ordens.at(-1)?.data_entrada ?? null,
      lastAttendance: ordens[0]?.data_entrada ?? null,
    },
  };
}
