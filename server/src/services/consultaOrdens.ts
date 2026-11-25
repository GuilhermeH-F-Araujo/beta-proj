// Aplica os mesmos filtros na listagem, nos indicadores e na exportacao.
import { z } from 'zod';
import { createSupabaseClient } from '../config/conexao.js';
import { consultaOrdensSchema } from '../validators/atendimento.js';
import { relevanciaTexto } from '../utils/pesquisaTexto.js';

export type FiltrosOrdens = z.infer<typeof consultaOrdensSchema>;

export const ORDENS_POR_PAGINA = 15;

export function limitesPeriodo(periodo: FiltrosOrdens['period']) {
  if (periodo === 'todos') return null;
  const partesDados = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const parte = (tipo: string) => partesDados.find((item) => item.type === tipo)?.value ?? '';
  const inicio = new Date(`${parte('year')}-${parte('month')}-${parte('day')}T12:00:00Z`);
  if (periodo === 'mes') inicio.setUTCDate(1);
  else inicio.setUTCDate(inicio.getUTCDate() - (periodo === '7d' ? 7 : 30));
  return inicio.toISOString().slice(0, 10);
}

export async function aplicarFiltrosOrdens(
  db: ReturnType<typeof createSupabaseClient>,
  busca: string,
) {
  if (!busca) return null;
  const padrao = `%${busca}%`;
  const [
    { data: clientes, error: clientesErro },
    { data: porModelo, error: modeloErro },
    { data: porPlaca, error: placaErro },
    { data: mecanicos, error: mecanicoErro },
  ] = await Promise.all([
    db.from('cliente').select('id_cliente').ilike('nome', padrao).limit(1000),
    db.from('moto').select('id_moto').ilike('modelo', padrao).limit(1000),
    db.from('moto').select('id_moto').ilike('placa', padrao).limit(1000),
    db.from('funcionario').select('id_funcionario').ilike('nome', padrao).limit(1000),
  ]);
  if (clientesErro || modeloErro || placaErro || mecanicoErro)
    throw new Error('Não foi possível pesquisar as ordens.');
  let clientesEncontrados = clientes ?? [];
  let modelosEncontrados = porModelo ?? [];
  let placasEncontradas = porPlaca ?? [];
  let mecanicosEncontrados = mecanicos ?? [];
  if (
    !clientesEncontrados.length &&
    !modelosEncontrados.length &&
    !placasEncontradas.length &&
    !mecanicosEncontrados.length
  ) {
    const [todosClientes, todasMotos, todosMecanicos] = await Promise.all([
      db.from('cliente').select('id_cliente,nome').limit(5000),
      db.from('moto').select('id_moto,modelo,placa').limit(5000),
      db.from('funcionario').select('id_funcionario,nome').limit(5000),
    ]);
    if (todosClientes.error || todasMotos.error || todosMecanicos.error)
      throw new Error('Não foi possível conferir nomes parecidos na pesquisa.');
    const pontuacao = (valor: string | null | undefined) =>
      relevanciaTexto(busca, valor ?? '');
    clientesEncontrados = (todosClientes.data ?? [])
      .filter((item) => pontuacao(item.nome))
      .map((item) => ({ id_cliente: item.id_cliente }));
    modelosEncontrados = (todasMotos.data ?? [])
      .filter((item) => pontuacao(item.modelo))
      .map((item) => ({ id_moto: item.id_moto }));
    placasEncontradas = (todasMotos.data ?? [])
      .filter((item) => pontuacao(item.placa))
      .map((item) => ({ id_moto: item.id_moto }));
    mecanicosEncontrados = (todosMecanicos.data ?? [])
      .filter((item) => pontuacao(item.nome))
      .map((item) => ({ id_funcionario: item.id_funcionario }));
  }
  const clienteIds = clientesEncontrados.map((item) => item.id_cliente);
  const { data: clienteMotos, error: motoErro } = clienteIds.length
    ? await db.from('moto').select('id_moto').in('id_cliente', clienteIds).limit(1000)
    : { data: [], error: null };
  if (motoErro) throw new Error('Não foi possível pesquisar as motocicletas.');
  const motoIds = [
    ...new Set(
      [...modelosEncontrados, ...placasEncontradas, ...(clienteMotos ?? [])].map((item) =>
        Number(item.id_moto),
      ),
    ),
  ];
  const mecanicoIds = mecanicosEncontrados.map((item) => Number(item.id_funcionario));
  const pecas = [];
  if (/^#?\d+$/.test(busca.replace(/^OS\s*/i, '')))
    pecas.push(`id_os.eq.${Number(busca.replace(/^OS\s*#?/i, ''))}`);
  if (motoIds.length) pecas.push(`id_moto.in.(${motoIds.join(',')})`);
  if (mecanicoIds.length) pecas.push(`id_mecanico.in.(${mecanicoIds.join(',')})`);
  return pecas;
}

export async function carregarOrdens(
  db: ReturnType<typeof createSupabaseClient>,
  filtros: FiltrosOrdens,
) {
  const buscaPecas = await aplicarFiltrosOrdens(db, filtros.search);
  if (buscaPecas?.length === 0)
    return { items: [], total: 0, page: filtros.page, pageSize: ORDENS_POR_PAGINA };
  const { data: motosCliente, error: motosErro } = filtros.clientId
    ? await db.from('moto').select('id_moto').eq('id_cliente', filtros.clientId)
    : { data: null, error: null };
  if (motosErro) throw new Error('Não foi possível consultar as motos do cliente.');
  if (filtros.clientId && !motosCliente?.length)
    return { items: [], total: 0, page: filtros.page, pageSize: ORDENS_POR_PAGINA };
  let consulta = db
    .from('ordem_servico')
    .select('id_os,id_moto,id_mecanico,status,data_entrada,previsao_entrega,total', {
      count: 'exact',
    })
    .order('id_os', { ascending: false });
  if (filtros.status !== 'todos') consulta = consulta.eq('status', filtros.status);
  const origemDados = filtros.dateFrom ?? limitesPeriodo(filtros.period);
  if (origemDados) consulta = consulta.gte('data_entrada', origemDados);
  if (filtros.dateTo) consulta = consulta.lte('data_entrada', `${filtros.dateTo}T23:59:59.999`);
  if (motosCliente)
    consulta = consulta.in(
      'id_moto',
      motosCliente.map((motocicleta) => motocicleta.id_moto),
    );
  if (buscaPecas) consulta = consulta.or(buscaPecas.join(','));
  const deslocamento = (filtros.page - 1) * ORDENS_POR_PAGINA;
  const {
    data: linhas,
    error: erro,
    count: quantidade,
  } = await consulta.range(deslocamento, deslocamento + ORDENS_POR_PAGINA - 1);
  if (erro) throw new Error(`Consulta de OS falhou: ${erro.message}`);
  const motoIds = [...new Set((linhas ?? []).map((linha) => linha.id_moto))];
  const ordemIds = (linhas ?? []).map((linha) => linha.id_os);
  const mecanicoIds = [
    ...new Set(
      (linhas ?? []).map((linha) => linha.id_mecanico).filter((id): id is number => id != null),
    ),
  ];
  const [
    { data: motos, error: motoErro },
    { data: mecanicos, error: mecanicoErro },
    { data: pagamentos, error: pagamentoErro },
  ] = await Promise.all([
    motoIds.length
      ? db.from('moto').select('id_moto,id_cliente,modelo,placa').in('id_moto', motoIds)
      : Promise.resolve({ data: [], error: null }),
    mecanicoIds.length
      ? db.from('funcionario').select('id_funcionario,nome').in('id_funcionario', mecanicoIds)
      : Promise.resolve({ data: [], error: null }),
    ordemIds.length
      ? db.from('pagamento_os').select('id_os,status').in('id_os', ordemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (motoErro || mecanicoErro || pagamentoErro)
    throw new Error('Não foi possível carregar os vínculos das ordens e pagamentos.');
  const clienteIds = [...new Set((motos ?? []).map((moto) => moto.id_cliente))];
  const { data: clientes, error: clienteErro } = clienteIds.length
    ? await db.from('cliente').select('id_cliente,nome,telefone').in('id_cliente', clienteIds)
    : { data: [], error: null };
  if (clienteErro) throw new Error('Não foi possível carregar os clientes.');
  const mapaMotos = new Map((motos ?? []).map((moto) => [moto.id_moto, moto]));
  const clienteMapa = new Map((clientes ?? []).map((cliente) => [cliente.id_cliente, cliente]));
  const mecanicoMapa = new Map(
    (mecanicos ?? []).map((mecanico) => [mecanico.id_funcionario, mecanico]),
  );
  const pagamentoMapa = new Map(
    (pagamentos ?? []).map((pagamento) => [pagamento.id_os, pagamento.status]),
  );
  return {
    items: (linhas ?? []).map((linha) => {
      const moto = mapaMotos.get(linha.id_moto);
      const cliente = moto ? clienteMapa.get(moto.id_cliente) : null;
      return {
        id: linha.id_os,
        status: linha.status,
        entry: linha.data_entrada,
        forecast: linha.previsao_entrega,
        total: linha.total,
        client: cliente?.nome ?? 'Cliente não encontrado',
        phone: cliente?.telefone ?? null,
        motorcycle: moto?.modelo ?? 'Motocicleta não encontrada',
        plate: moto?.placa ?? null,
        mechanic: linha.id_mecanico
          ? (mecanicoMapa.get(linha.id_mecanico)?.nome ?? 'Não informado')
          : 'Não atribuído',
        paymentStatus: pagamentoMapa.get(linha.id_os) === 'pago' ? 'pago' : 'pendente',
      };
    }),
    total: quantidade ?? 0,
    page: filtros.page,
    pageSize: ORDENS_POR_PAGINA,
  };
}
