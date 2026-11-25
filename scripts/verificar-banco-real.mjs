// Restaura uma copia local dos dados do escopo e ensaia a transicao sem rede.
import { PGlite } from '../.verificacao/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { sqlTransicao } from './sql-transicao.mjs';
const copiaSeguranca = process.argv[2];
if (!copiaSeguranca) throw Error('Informe a pasta do backup local.');
const original = JSON.parse(readFileSync(`${copiaSeguranca}/dados-antes.json`, 'utf8'));
const metadados = JSON.parse(readFileSync(`${copiaSeguranca}/esquema-antes.json`, 'utf8'));
const banco = new PGlite();
try {
  // Mesmo esquema minimo usado pelo teste funcional; nao descreve o banco completo.
  const cenarioTeste = readFileSync('scripts/verificar-tabelas.mjs', 'utf8').match(
    /await db\.exec\(`([\s\S]*?)`\);/,
  )[1];
  await banco.exec(cenarioTeste);
  const arquivos = readdirSync('supabase/migrations')
    .filter((funcaoAtual) => funcaoAtual.endsWith('.sql'))
    .sort();
  for (const funcaoAtual of arquivos.filter((funcaoAtual) => funcaoAtual < '20261030'))
    await banco.exec(readFileSync(`supabase/migrations/${funcaoAtual}`, 'utf8'));
  await banco.exec('set session_replication_role=replica');
  // Apenas chaves substitutas para as entidades externas ao backup do escopo.
  for (const linha of original.data.admin_notifications)
    if (linha.order_id != null)
      await banco.query('insert into ordem_servico(id_os) values($1) on conflict do nothing', [
        linha.order_id,
      ]);
  for (const [tabela, linhas] of Object.entries(original.data)) {
    if (!linhas.length) continue;
    const colunas = metadados.columns
      .filter((elementoAtual) => elementoAtual.table_name === tabela)
      .map((elementoAtual) => elementoAtual.column_name);
    assert(colunas.every((elementoAtual) => /^[a-z_]+$/.test(elementoAtual)));
    await banco.query(
      `insert into public.${tabela}(${colunas.join(',')}) overriding system value select ${colunas.join(',')} from jsonb_populate_recordset(null::public.${tabela},$1::jsonb)`,
      [JSON.stringify(linhas)],
    );
  }
  await banco.exec('set session_replication_role=origin');
  for (const funcaoAtual of metadados.functions) await banco.exec(funcaoAtual.definition);
  await banco.exec(sqlTransicao());
  const mapas = {
    admin_notifications: [
      'public.admin_notify',
      {
        tipo: 'kind',
        id_os: 'order_id',
        titulo: 'title',
        mensagem: 'body',
        criado_em: 'created_at',
      },
    ],
    admin_notification_receipts: [
      'public.admin_leitura',
      {
        id_aviso: 'notification_id',
        id_usuario: 'admin_user_id',
        lido_em: 'read_at',
        dispensado_em: 'dismissed_at',
      },
    ],
    client_admin_audit: [
      'public.cliente_historico',
      {
        id_cliente: 'client_id',
        nome: 'client_name',
        id_usuario: 'admin_user_id',
        acao: 'action',
        motivo: 'reason',
        criado_em: 'occurred_at',
      },
    ],
    motorcycle_thumbnail_jobs: [
      'public.miniaturas_motos',
      {
        chave: 'model_key',
        modelo: 'model',
        tentativas: 'attempts',
        tentar_em: 'next_retry_at',
        travado_em: 'locked_at',
        id_executor: 'locked_by',
        erro: 'last_error',
        criado_em: 'created_at',
        atualizado_em: 'updated_at',
      },
    ],
    order_admin_audit: ['recuperacao.os_auditoria', {}],
    order_status_history: ['recuperacao.os_status', {}],
    order_observation_history: [
      'recuperacao.os_observacao',
      {
        id_os: 'order_id',
        tipo: 'kind',
        texto: 'body',
        id_usuario: 'actor_user_id',
        criado_em: 'created_at',
      },
    ],
    order_observation_migration_backup: [
      'recuperacao.os_backup',
      { id_os: 'order_id', texto: 'original_body', salvo_em: 'saved_at' },
    ],
    pagamento_os: ['public.pagamento_os', {}],
  };
  const valores = {
    nova_os: 'new_order',
    aguardando_peca: 'waiting_part',
    pronta: 'ready',
    cancelada: 'cancelled',
    arquivar: 'archive',
    pendente: 'pending',
    processando: 'processing',
    aguardando_cota: 'waiting_quota',
    tentar_novamente: 'retry',
    aguardando_revisao: 'needs_review',
    concluido: 'done',
    observacao_anterior: 'previous_observation',
    nota_status: 'status_note',
  };
  for (const [anterior, [tabela, colunas]] of Object.entries(mapas)) {
    const linhas = (
      await banco.query(
        `select to_jsonb(t) as row from ${tabela} t order by ${anterior === 'admin_notification_receipts' ? 'id_aviso,id_usuario' : anterior === 'pagamento_os' ? 'id_os' : anterior === 'order_observation_migration_backup' ? 'id_os' : 'id'}`,
      )
    ).rows.map((resultadoAtual) =>
      Object.fromEntries(
        Object.entries(resultadoAtual.row).map(([chaveLocal, valor]) => [
          colunas[chaveLocal] ?? chaveLocal,
          (['tipo', 'status', 'acao'].includes(chaveLocal) &&
            anterior !== 'pagamento_os' &&
            valores[valor]) ||
            valor,
        ]),
      ),
    );
    assert.deepEqual(linhas, original.data[anterior], `Conteúdo divergente: ${anterior}`);
  }
  const auxiliar = (
    await banco.query(
      "select pg_get_functiondef('public.gerar_notificacoes_temporais(interval)'::regprocedure) as definition",
    )
  ).rows[0].definition;
  assert(auxiliar.includes("h.tipo = 'status'"));
  assert(!auxiliar.includes('order_status_history'));
  console.log(
    'OK: backup real restaurado localmente; 9 tabelas conferidas integralmente após a transição.',
  );
} catch (erroLocal) {
  console.error('FALHOU:', erroLocal.message);
  process.exitCode = 1;
} finally {
  await banco.close();
}
