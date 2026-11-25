import testar from 'node:test';
import verificar from 'node:assert/strict';
import { consultarTodasPaginas, REGISTROS_POR_CONSULTA } from '../dist/services/paginacao.js';
import { listarMotocicletas } from '../dist/services/motocicletas.js';

testar('paginacao conserva todos os registros acima do limite de uma consulta', async () => {
  const registros = Array.from({ length: REGISTROS_POR_CONSULTA * 2 + 1 }, (_, id) => ({ id }));
  const intervalos = [];
  const resultado = await consultarTodasPaginas(async (inicio, fim) => {
    intervalos.push([inicio, fim]);
    return { data: registros.slice(inicio, fim + 1), error: null };
  });
  verificar.deepEqual(resultado, registros);
  verificar.deepEqual(intervalos, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});

testar('pagina exatamente cheia exige a consulta seguinte antes de encerrar', async () => {
  let consultas = 0;
  const registros = Array.from({ length: REGISTROS_POR_CONSULTA }, (_, id) => ({ id }));
  const resultado = await consultarTodasPaginas(async (inicio, fim) => {
    consultas++;
    return { data: registros.slice(inicio, fim + 1), error: null };
  });
  verificar.equal(resultado.length, REGISTROS_POR_CONSULTA);
  verificar.equal(consultas, 2);
});

testar('ausencia de registros retorna uma lista vazia', async () => {
  verificar.deepEqual(await consultarTodasPaginas(async () => ({ data: null, error: null })), []);
});

testar('falha de uma pagina nao apresenta resultados parciais como completos', async () => {
  const erro = new Error('consulta interrompida');
  await verificar.rejects(
    () =>
      consultarTodasPaginas(async (inicio) => {
        if (inicio) return { data: null, error: erro };
        return {
          data: Array.from({ length: REGISTROS_POR_CONSULTA }, (_, id) => ({ id })),
          error: null,
        };
      }),
    (capturado) => capturado === erro,
  );
});

function bancoSimulado(tabelas) {
  return {
    from(tabela) {
      let registros = [...(tabelas[tabela] ?? [])];
      return {
        select() {
          return this;
        },
        order(coluna, { ascending = true } = {}) {
          registros.sort(
            (a, b) =>
              (a[coluna] < b[coluna] ? -1 : a[coluna] > b[coluna] ? 1 : 0) * (ascending ? 1 : -1),
          );
          return this;
        },
        in(coluna, valores) {
          registros = registros.filter((registro) => valores.includes(registro[coluna]));
          return this;
        },
        range(inicio, fim) {
          registros = registros.slice(inicio, fim + 1);
          return this;
        },
        then(resolver, rejeitar) {
          return Promise.resolve({ data: registros, error: null }).then(resolver, rejeitar);
        },
      };
    },
  };
}

testar(
  'listagem preserva desempate da ultima OS, pagamento, contagem e clientes arquivados',
  async () => {
    const moto = (id, idCliente = 1, ativa = true) => ({
      id_moto: id,
      id_cliente: idCliente,
      modelo: 'Honda',
      placa: 'ABC1D23',
      ano: 2020,
      ano_modelo: 2020,
      cor: 'Vermelho',
      quilometragem: 100,
      chassi: null,
      renavam: null,
      observacoes: null,
      ativa,
    });
    const db = bancoSimulado({
      moto: [moto(1), moto(2), moto(3, 1, false), moto(4, 2)],
      cliente: [
        { id_cliente: 1, nome: 'Cliente ativo', telefone: null, excluido_em: null },
        { id_cliente: 2, nome: 'Cliente arquivado', telefone: null, excluido_em: '2026-01-01' },
      ],
      ordem_servico: [
        {
          id_os: 1,
          id_moto: 1,
          status: 'aguardando',
          data_entrada: '2026-10-01',
          data_saida: null,
        },
        { id_os: 2, id_moto: 1, status: 'pronto', data_entrada: '2026-10-01', data_saida: null },
        { id_os: 3, id_moto: 1, status: 'cancelada', data_entrada: '2026-09-01', data_saida: null },
      ],
      pagamento_os: [{ id_os: 2, status: 'pago' }],
    });
    const resultado = await listarMotocicletas(db);
    verificar.equal(resultado.items.length, 3);
    verificar.equal(resultado.items.find((moto) => moto.id === 1).lastOrder.id, 2);
    verificar.equal(resultado.items.find((moto) => moto.id === 1).orderCount, 3);
    verificar.equal(resultado.items.find((moto) => moto.id === 1).status, 'pickup');
    verificar.equal(resultado.items.find((moto) => moto.id === 2).status, 'no-orders');
    verificar.equal(resultado.items.find((moto) => moto.id === 3).status, 'inactive');
    verificar.equal(resultado.counts.all, 3);
    verificar.deepEqual(resultado.clients, [{ id: 1, name: 'Cliente ativo' }]);
  },
);
