import type { SupabaseClient } from '@supabase/supabase-js';
import { situacaoMotocicleta } from '../statusMotocicleta.js';
import { consultarTodasPaginas, IDS_POR_CONSULTA } from './paginacao.js';

type MotocicletaBanco = {
  id_moto: number;
  id_cliente: number;
  modelo: string;
  placa: string;
  ano: number | null;
  ano_modelo: number | null;
  cor: string | null;
  quilometragem: number | null;
  chassi: string | null;
  renavam: string | null;
  observacoes: string | null;
  ativa: boolean;
};
type ClienteBanco = {
  id_cliente: number;
  nome: string;
  telefone: string | null;
  excluido_em: string | null;
};
type OrdemBanco = {
  id_os: number;
  id_moto: number;
  status: string;
  data_entrada: string;
  data_saida: string | null;
};

// A situacao da moto depende da OS mais recente e do pagamento daquela OS.
export async function listarMotocicletas(db: SupabaseClient) {
  const motos = await consultarTodasPaginas<MotocicletaBanco>((inicio, fim) =>
    db
      .from('moto')
      .select(
        'id_moto,id_cliente,modelo,placa,ano,ano_modelo,cor,quilometragem,chassi,renavam,observacoes,ativa',
      )
      .order('id_moto', { ascending: false })
      .range(inicio, fim),
  );
  const clientes = await consultarTodasPaginas<ClienteBanco>((inicio, fim) =>
    db
      .from('cliente')
      .select('id_cliente,nome,telefone,excluido_em')
      .order('id_cliente')
      .range(inicio, fim),
  );
  const idsMotos = motos.map((moto) => moto.id_moto);
  const ordens: OrdemBanco[] = [];
  for (let indice = 0; indice < idsMotos.length; indice += IDS_POR_CONSULTA) {
    const idsSelecionados = idsMotos.slice(indice, indice + IDS_POR_CONSULTA);
    const ordensDoGrupo = await consultarTodasPaginas<OrdemBanco>((inicio, fim) =>
      db
        .from('ordem_servico')
        .select('id_os,id_moto,status,data_entrada,data_saida')
        .in('id_moto', idsSelecionados)
        .order('id_os', { ascending: false })
        .range(inicio, fim),
    );
    ordens.push(...ordensDoGrupo);
  }
  const clienteMapa = new Map(clientes.map((cliente) => [cliente.id_cliente, cliente]));
  const maisRecente = new Map<number, OrdemBanco>();
  const ordemQuantidade = new Map<number, number>();
  for (const ordem of ordens) {
    ordemQuantidade.set(ordem.id_moto, (ordemQuantidade.get(ordem.id_moto) ?? 0) + 1);
    const anterior = maisRecente.get(ordem.id_moto);
    if (
      !anterior ||
      new Date(ordem.data_entrada).getTime() > new Date(anterior.data_entrada).getTime() ||
      (ordem.data_entrada === anterior.data_entrada && ordem.id_os > anterior.id_os)
    )
      maisRecente.set(ordem.id_moto, ordem);
  }
  const pagamentoMapa = new Map<number, string>();
  const maisRecenteIds = [...maisRecente.values()].map((ordem) => ordem.id_os);
  for (let indice = 0; indice < maisRecenteIds.length; indice += IDS_POR_CONSULTA) {
    const { data: dados, error: erro } = await db
      .from('pagamento_os')
      .select('id_os,status')
      .in('id_os', maisRecenteIds.slice(indice, indice + IDS_POR_CONSULTA));
    if (erro) throw erro;
    for (const pagamento of dados ?? []) pagamentoMapa.set(pagamento.id_os, pagamento.status);
  }
  const itens = motos
    .filter((motocicleta) => !clienteMapa.get(motocicleta.id_cliente)?.excluido_em)
    .map((motocicleta) => {
      const cliente = clienteMapa.get(motocicleta.id_cliente);
      const ultimo = maisRecente.get(motocicleta.id_moto);
      const pago = ultimo ? pagamentoMapa.get(ultimo.id_os) === 'pago' : false;
      const situacao = situacaoMotocicleta(
        motocicleta.ativa,
        ultimo?.status,
        pago,
        !!ultimo?.data_saida,
      );
      return {
        id: motocicleta.id_moto,
        clientId: motocicleta.id_cliente,
        client: cliente?.nome ?? 'Cliente indisponível',
        phone: cliente?.telefone ?? null,
        model: motocicleta.modelo,
        plate: motocicleta.placa,
        year: motocicleta.ano,
        modelYear: motocicleta.ano_modelo,
        color: motocicleta.cor,
        mileage: motocicleta.quilometragem,
        chassis: motocicleta.chassi ?? '',
        renavam: motocicleta.renavam ?? '',
        notes: motocicleta.observacoes ?? '',
        active: motocicleta.ativa,
        status: situacao,
        lastOrder: ultimo
          ? {
              id: ultimo.id_os,
              date: ultimo.data_entrada,
              status: ultimo.status,
              paymentStatus: pago ? 'pago' : 'pendente',
            }
          : null,
        orderCount: ordemQuantidade.get(motocicleta.id_moto) ?? 0,
      };
    });
  const contagens: Record<string, number> = {
    all: itens.length,
    active: 0,
    maintenance: 0,
    completed: 0,
    pickup: 0,
    inactive: 0,
    delivered: 0,
    cancelled: 0,
    'no-orders': 0,
  };
  for (const item of itens) contagens[item.status] = (contagens[item.status] ?? 0) + 1;
  return {
    items: itens,
    counts: contagens,
    clients: clientes
      .filter((cliente) => !cliente.excluido_em)
      .map((cliente) => ({ id: cliente.id_cliente, name: cliente.nome })),
  };
}
