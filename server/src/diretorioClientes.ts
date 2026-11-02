import type { SupabaseClient } from '@supabase/supabase-js';

type ClientRow = { id_cliente: number; nome: string; telefone: string | null; foto: string | null; excluido_em: string | null };
type MotorcycleRow = { id_moto: number; id_cliente: number; modelo: string; placa: string | null };
type OrderRow = { id_os: number; id_moto: number; status: string; data_entrada: string; data_saida: string | null };

// O PostgREST limita cada resposta; pagine para incluir clientes sem OS nos indicadores.
async function allRows<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const primaryKey = table === 'cliente' ? 'id_cliente' : table === 'moto' ? 'id_moto' : 'id_os';
    const { data, error } = await db.from(table).select(columns).order(primaryKey).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data as T[] ?? []));
    if (!data || data.length < 500) return rows;
  }
}

const activeStatuses = new Set(['aguardando', 'em andamento', 'aguardando peça', 'pronto']);
const completedStatuses = new Set(['pronto', 'entregue']);

export async function diretorioClientes(db: SupabaseClient) {
  const [clients, motorcycles, orders] = await Promise.all([
    allRows<ClientRow>(db, 'cliente', 'id_cliente,nome,telefone,foto,excluido_em'),
    allRows<MotorcycleRow>(db, 'moto', 'id_moto,id_cliente,modelo,placa'),
    allRows<OrderRow>(db, 'ordem_servico', 'id_os,id_moto,status,data_entrada,data_saida'),
  ]);
  const bikesByClient = new Map<number, MotorcycleRow[]>();
  for (const bike of motorcycles) bikesByClient.set(bike.id_cliente, [...(bikesByClient.get(bike.id_cliente) ?? []), bike]);
  const bikeOwner = new Map(motorcycles.map(bike => [bike.id_moto, bike]));
  const ordersByClient = new Map<number, OrderRow[]>();
  for (const order of orders) {
    const bike = bikeOwner.get(order.id_moto);
    if (bike) ordersByClient.set(bike.id_cliente, [...(ordersByClient.get(bike.id_cliente) ?? []), order]);
  }
  const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => dateParts.find(value => value.type === type)?.value ?? '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const month = today.slice(0, 7);
  const returnCutoff = new Date(`${today}T12:00:00Z`);
  returnCutoff.setUTCDate(returnCutoff.getUTCDate() - 90);

  const activeClients = clients.filter(client => !client.excluido_em);
  const activeIds = new Set(activeClients.map(client => client.id_cliente));
  const items = activeClients.map(client => {
    const bikes = bikesByClient.get(client.id_cliente) ?? [];
    const clientOrders = (ordersByClient.get(client.id_cliente) ?? []).sort((a, b) =>
      b.data_entrada.localeCompare(a.data_entrada) || b.id_os - a.id_os);
    const lastOrder = clientOrders[0];
    const active = clientOrders.find(order => activeStatuses.has(order.status));
    const completed = clientOrders.find(order => completedStatuses.has(order.status));
    const firstAttendance = clientOrders.at(-1)?.data_entrada ?? null;
    const newThisMonth = firstAttendance?.slice(0, 7) === month;
    const awaitingReturn = !active && !!completed &&
      (completed.data_saida ?? completed.data_entrada).slice(0, 10) <= returnCutoff.toISOString().slice(0, 10);
    const selectedBike = bikeOwner.get((active ?? lastOrder)?.id_moto) ?? bikes[0];
    const situation = active?.status === 'em andamento' ? 'em andamento'
      : active?.status === 'aguardando peça' ? 'aguardando peça'
      : active?.status === 'pronto' ? 'pronto'
      : active ? 'aguardando'
      : awaitingReturn ? 'retorno'
      : lastOrder?.status === 'entregue' ? 'entregue'
      : lastOrder?.status === 'cancelada' ? 'cancelada' : 'sem-os';
    return {
      id: client.id_cliente, name: client.nome, phone: client.telefone, hasPhoto: Boolean(client.foto),
      photoUrl: client.foto?.startsWith('https://') ? client.foto : null,
      motorcycle: selectedBike?.modelo ?? null, plate: selectedBike?.placa ?? null,
      motorcycles: bikes.map(bike => ({ id: bike.id_moto, model: bike.modelo, plate: bike.placa })),
      firstAttendance, lastAttendance: lastOrder?.data_entrada ?? null,
      situation, active: Boolean(active), awaitingReturn, newThisMonth,
      motorcycleCount: bikes.length, orderCount: clientOrders.length,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return {
    items,
    counts: {
      all: items.length,
      active: items.filter(item => item.active).length,
      return: items.filter(item => item.awaitingReturn).length,
      new: items.filter(item => item.newThisMonth).length,
    },
    models: [...new Set(motorcycles.filter(bike => activeIds.has(bike.id_cliente)).map(bike => bike.modelo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

export async function perfilClienteNoDiretorio(db: SupabaseClient, id: number) {
  const { data: client, error } = await db.from('cliente').select('id_cliente,nome,telefone,email,cpf,foto,data_nascimento,cep,endereco,numero,bairro,cidade,estado').eq('id_cliente', id).is('excluido_em', null).maybeSingle();
  if (error) throw error;
  if (!client) return null;
  const { data: motorcycles, error: bikesError } = await db.from('moto')
    .select('id_moto,modelo,placa,ano,cor,quilometragem').eq('id_cliente', id).order('id_moto', { ascending: false });
  if (bikesError) throw bikesError;
  const ids = (motorcycles ?? []).map(bike => bike.id_moto);
  const orders: (OrderRow & { total: number | null; problema_relatado: string | null })[] = [];
  if (ids.length) for (let offset = 0; ; offset += 500) {
    const { data, error: ordersError } = await db.from('ordem_servico')
      .select('id_os,id_moto,status,data_entrada,data_saida,total,problema_relatado')
      .in('id_moto', ids).order('id_os').range(offset, offset + 499);
    if (ordersError) throw ordersError;
    orders.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }
  orders.sort((a, b) => b.data_entrada.localeCompare(a.data_entrada) || b.id_os - a.id_os);
  return {
    id: client.id_cliente, name: client.nome, phone: client.telefone, email: client.email, cpf: client.cpf,
    birthDate: client.data_nascimento, postalCode: client.cep, address: client.endereco, addressNumber: client.numero,
    district: client.bairro, city: client.cidade, state: client.estado,
    hasPhoto: Boolean(client.foto), photoUrl: client.foto?.startsWith('https://') ? client.foto : null, photoRevision: client.foto,
    motorcycles: motorcycles ?? [], orders,
    summary: { motorcycleCount: motorcycles?.length ?? 0, orderCount: orders.length,
      recordedTotal: orders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      firstAttendance: orders.at(-1)?.data_entrada ?? null,
      lastAttendance: orders[0]?.data_entrada ?? null },
  };
}
