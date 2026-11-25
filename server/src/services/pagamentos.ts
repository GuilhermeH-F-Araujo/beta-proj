// O total usa os valores registrados na OS e seus itens.
// A exibicao no navegador nao e fonte confiavel para confirmar pagamento.
import { createSupabaseClient } from '../config/conexao.js';

export async function resumoPagamento(db: ReturnType<typeof createSupabaseClient>, id: number) {
  const [
    { data: ordem, error: ordemErro },
    { data: pecas, error: pecasErro },
    { data: servicos, error: servicosErro },
  ] = await Promise.all([
    db.from('ordem_servico').select('id_os,id_moto,total').eq('id_os', id).maybeSingle(),
    db.from('os_peca').select('quantidade,preco_unitario').eq('id_os', id),
    db.from('os_servico').select('preco').eq('id_os', id),
  ]);
  if (ordemErro || pecasErro || servicosErro)
    throw new Error('Não foi possível consultar o resumo da OS.');
  if (!ordem) return null;
  const { data: moto, error: motoErro } = await db
    .from('moto')
    .select('id_cliente,modelo,placa')
    .eq('id_moto', ordem.id_moto)
    .maybeSingle();
  if (motoErro) throw new Error('Não foi possível consultar a motocicleta.');
  const { data: cliente, error: clienteErro } = moto
    ? await db
        .from('cliente')
        .select('nome,telefone')
        .eq('id_cliente', moto.id_cliente)
        .maybeSingle()
    : { data: null, error: null };
  if (clienteErro) throw new Error('Não foi possível consultar o cliente.');
  const centavos = (valor: unknown) => Math.round(Number(valor ?? 0) * 100);
  const pecasCentavos = (pecas ?? []).reduce(
    (soma, parte) => soma + centavos(Number(parte.quantidade) * Number(parte.preco_unitario)),
    0,
  );
  const servicosCentavos = (servicos ?? []).reduce(
    (soma, servico) => soma + centavos(servico.preco),
    0,
  );
  const valorCentavos =
    ordem.total == null ? pecasCentavos + servicosCentavos : centavos(ordem.total);
  if (valorCentavos < 0 || !Number.isSafeInteger(valorCentavos))
    throw new Error('Valor da OS inválido.');
  return {
    id: ordem.id_os,
    client: cliente?.nome ?? 'Cliente não encontrado',
    phone: cliente?.telefone ?? null,
    motorcycle: moto?.modelo ?? 'Motocicleta não encontrada',
    plate: moto?.placa ?? null,
    partsTotal: pecasCentavos / 100,
    servicesTotal: servicosCentavos / 100,
    discount: Math.max(0, pecasCentavos + servicosCentavos - valorCentavos) / 100,
    amount: valorCentavos / 100,
  };
}
