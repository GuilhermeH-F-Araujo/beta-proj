import type { SupabaseClient } from '@supabase/supabase-js';
import { Router, type Request, type Response } from 'express';
type Ordem = {
  id_os: number;
  id_moto: number;
  id_mecanico: number | null;
  status: string;
  data_entrada: string;
  data_saida: string | null;
  previsao_entrega: string | null;
};
async function ler<T>(db: SupabaseClient, tabela: string, colunas: string, chave: string) {
  const itens: T[] = [];
  for (let indice = 0; ; indice += 500) {
    const { data: dados, error: erro } = await db
      .from(tabela)
      .select(colunas)
      .order(chave)
      .range(indice, indice + 499);
    if (erro) throw erro;
    itens.push(...(dados as T[]));
    if (dados.length < 500) return itens;
  }
}
export function rotasPainel(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const roteador = Router();
  roteador.get('/', async (req, res, next) => {
    try {
      const db = await autorizar(req, res);
      if (!db) return;
      res.setHeader('Cache-Control', 'private, no-store');
      const [ordens, funcionarios] = await Promise.all([
        ler<Ordem>(
          db,
          'ordem_servico',
          'id_os,id_moto,id_mecanico,status,data_entrada,data_saida,previsao_entrega',
          'id_os',
        ),
        ler<{ id_funcionario: number; nome: string; cargo: string }>(
          db,
          'funcionario',
          'id_funcionario,nome,cargo',
          'id_funcionario',
        ),
      ]);
      const ativo = ordens
        .filter((objetoAtual) => !['entregue', 'cancelada'].includes(objetoAtual.status))
        .sort(
          (primeiroElemento, segundoElemento) =>
            primeiroElemento.data_entrada.localeCompare(segundoElemento.data_entrada) ||
            primeiroElemento.id_os - segundoElemento.id_os,
        )
        .slice(0, 6);
      const ids = [...new Set(ativo.map((objetoAtual) => objetoAtual.id_moto))];
      const motosResultado = ids.length
        ? await db.from('moto').select('id_moto,id_cliente,modelo,placa').in('id_moto', ids)
        : { data: [], error: null };
      if (motosResultado.error) throw motosResultado.error;
      const clienteIds = [
        ...new Set(
          (motosResultado.data ?? []).map((segundoElemento) => segundoElemento.id_cliente),
        ),
      ];
      const clientesResultado = clienteIds.length
        ? await db.from('cliente').select('id_cliente,nome,telefone').in('id_cliente', clienteIds)
        : { data: [], error: null };
      if (clientesResultado.error) throw clientesResultado.error;
      const motos = new Map(
        (motosResultado.data ?? []).map((segundoElemento) => [
          segundoElemento.id_moto,
          segundoElemento,
        ]),
      );
      const clientes = new Map(
        (clientesResultado.data ?? []).map((elementoAtual) => [
          elementoAtual.id_cliente,
          elementoAtual,
        ]),
      );
      const mecanicos = new Map(
        funcionarios.map((eventoRecebido) => [eventoRecebido.id_funcionario, eventoRecebido.nome]),
      );
      const contagens: Record<string, number> = {
        aguardando: 0,
        'em andamento': 0,
        'aguardando peça': 0,
        pronto: 0,
        entregue: 0,
        cancelada: 0,
      };
      ordens.forEach((objetoAtual) => {
        if (objetoAtual.status in contagens) contagens[objetoAtual.status]++;
      });
      const atribuidosMecanicos = new Set(ordens.map((objetoAtual) => objetoAtual.id_mecanico));
      return res.json({
        orders: ordens.map((objetoAtual) => ({
          id: objetoAtual.id_os,
          status: objetoAtual.status,
          entry: objetoAtual.data_entrada,
          exit: objetoAtual.data_saida,
          forecast: objetoAtual.previsao_entrega,
          mechanicId: objetoAtual.id_mecanico,
        })),
        counts: contagens,
        employees: funcionarios
          .filter(
            (eventoRecebido) =>
              atribuidosMecanicos.has(eventoRecebido.id_funcionario) ||
              eventoRecebido.cargo
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase() === 'mecanico',
          )
          .map((eventoRecebido) => ({
            id: eventoRecebido.id_funcionario,
            nome: eventoRecebido.nome,
            cargo: eventoRecebido.cargo,
          })),
        oldest: ativo.map((objetoAtual) => {
          const segundoElemento = motos.get(objetoAtual.id_moto);
          const elementoAtual = segundoElemento ? clientes.get(segundoElemento.id_cliente) : null;
          return {
            id: objetoAtual.id_os,
            status: objetoAtual.status,
            entry: objetoAtual.data_entrada,
            forecast: objetoAtual.previsao_entrega,
            client: elementoAtual?.nome ?? 'Cliente não informado',
            phone: elementoAtual?.telefone ?? null,
            motorcycle: segundoElemento?.modelo ?? 'Motocicleta não informada',
            plate: segundoElemento?.placa ?? null,
            mechanic: mecanicos.get(objetoAtual.id_mecanico ?? 0) ?? 'Não atribuído',
            total: null,
            paymentStatus: 'pendente',
          };
        }),
      });
    } catch (erro) {
      next(erro);
    }
  });
  return roteador;
}
