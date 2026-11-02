// Restaura uma cópia local dos dados do escopo e ensaia a transição sem rede.
import { PGlite } from '../.verificacao/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync,readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import {sqlTransicao} from './sql-transicao.mjs';
const backup=process.argv[2];
if(!backup)throw Error('Informe a pasta do backup local.');
const original=JSON.parse(readFileSync(`${backup}/dados-antes.json`,'utf8'));
const metadata=JSON.parse(readFileSync(`${backup}/esquema-antes.json`,'utf8'));
const db=new PGlite();
try {
  // Mesmo esquema mínimo usado pelo teste funcional; não descreve o banco completo.
  const fixture=readFileSync('scripts/verificar-tabelas.mjs','utf8').match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await db.exec(fixture);
  const files=readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const f of files.filter(f=>f<'20261030'))await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
  await db.exec('set session_replication_role=replica');
  // Apenas chaves substitutas para as entidades externas ao backup do escopo.
  for(const row of original.data.admin_notifications)if(row.order_id!=null)
    await db.query('insert into ordem_servico(id_os) values($1) on conflict do nothing',[row.order_id]);
  for(const [table,rows]of Object.entries(original.data)) {
    if(!rows.length)continue;
    const columns=metadata.columns.filter(c=>c.table_name===table).map(c=>c.column_name);
    assert(columns.every(c=>/^[a-z_]+$/.test(c)));
    await db.query(`insert into public.${table}(${columns.join(',')}) overriding system value select ${columns.join(',')} from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(rows)]);
  }
  await db.exec('set session_replication_role=origin');
  for(const f of metadata.functions)await db.exec(f.definition);
  await db.exec(sqlTransicao());
  const maps={
    admin_notifications:['public.admin_notify',{tipo:'kind',id_os:'order_id',titulo:'title',mensagem:'body',criado_em:'created_at'}],
    admin_notification_receipts:['public.admin_leitura',{id_aviso:'notification_id',id_usuario:'admin_user_id',lido_em:'read_at',dispensado_em:'dismissed_at'}],
    client_admin_audit:['public.cliente_historico',{id_cliente:'client_id',nome:'client_name',id_usuario:'admin_user_id',acao:'action',motivo:'reason',criado_em:'occurred_at'}],
    motorcycle_thumbnail_jobs:['public.miniaturas_motos',{chave:'model_key',modelo:'model',tentativas:'attempts',tentar_em:'next_retry_at',travado_em:'locked_at',id_executor:'locked_by',erro:'last_error',criado_em:'created_at',atualizado_em:'updated_at'}],
    order_admin_audit:['recuperacao.os_auditoria',{}],order_status_history:['recuperacao.os_status',{}],
    order_observation_history:['recuperacao.os_observacao',{id_os:'order_id',tipo:'kind',texto:'body',id_usuario:'actor_user_id',criado_em:'created_at'}],
    order_observation_migration_backup:['recuperacao.os_backup',{id_os:'order_id',texto:'original_body',salvo_em:'saved_at'}],pagamento_os:['public.pagamento_os',{}],
  };
  const values={nova_os:'new_order',aguardando_peca:'waiting_part',pronta:'ready',cancelada:'cancelled',arquivar:'archive',pendente:'pending',processando:'processing',aguardando_cota:'waiting_quota',tentar_novamente:'retry',aguardando_revisao:'needs_review',concluido:'done',observacao_anterior:'previous_observation',nota_status:'status_note'};
  for(const[old,[table,columns]]of Object.entries(maps)) {
    const rows=(await db.query(`select to_jsonb(t) as row from ${table} t order by ${old==='admin_notification_receipts'?'id_aviso,id_usuario':old==='pagamento_os'?'id_os':old==='order_observation_migration_backup'?'id_os':'id'}`)).rows.map(r=>Object.fromEntries(Object.entries(r.row).map(([key,value])=>[columns[key]??key,(['tipo','status','acao'].includes(key)&&old!=='pagamento_os'&&values[value])||value])));
    assert.deepEqual(rows,original.data[old],`Conteúdo divergente: ${old}`);
  }
  const helper=(await db.query("select pg_get_functiondef('public.gerar_notificacoes_temporais(interval)'::regprocedure) as definition")).rows[0].definition;
  assert(helper.includes("h.tipo = 'status'"));assert(!helper.includes('order_status_history'));
  console.log('OK: backup real restaurado localmente; 9 tabelas conferidas integralmente após a transição.');
} catch(error){console.error('FALHOU:',error.message);process.exitCode=1;}
finally{await db.close();}
