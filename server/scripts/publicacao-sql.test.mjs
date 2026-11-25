import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import sharp from 'sharp';
import express from 'express';
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'simulada';
const { registrarCentralMiniaturas } = await import('../src/miniaturas/rotas.ts');
const app = express();
registrarCentralMiniaturas(app);
const roteador = app.router.stack.find((r) =>
  r.handle?.stack?.some((c) => c.route?.path === '/:id/aprovar'),
).handle;
const aprovar = roteador.stack.find((r) => r.route?.path === '/:id/aprovar').route.stack[0].handle;
let pg, imagem;
before(async () => {
  pg = new PGlite();
  await pg.exec(`
    create table miniatura_catalogo (id uuid primary key, revisao integer not null default 0, publicada uuid, atualizado_em timestamptz default now());
    create table miniatura_pedidos (id uuid primary key, catalogo_id uuid references miniatura_catalogo(id), status text, candidato text, verificacao jsonb, atualizado_em timestamptz default now());
    create table miniatura_publicacoes (id uuid primary key default gen_random_uuid(), catalogo_id uuid references miniatura_catalogo(id), pedido_id uuid references miniatura_pedidos(id), caminho text, admin_id uuid, criado_em timestamptz default now());
  `);
  const migracao = await readFile(
    new URL('../../supabase/migrations/20261115003443_central_miniaturas.sql', import.meta.url),
    'utf8',
  );
  const inicio = migracao.indexOf('create or replace function public.publicar_miniatura(');
  const fim = migracao.indexOf('create or replace function public.restaurar_miniatura(', inicio);
  await pg.exec(migracao.slice(inicio, fim));
  imagem = await sharp({
    create: { width: 400, height: 300, channels: 4, background: '#00000000' },
  })
    .composite([
      {
        input: { create: { width: 240, height: 150, channels: 4, background: '#222' } },
        left: 80,
        top: 75,
      },
    ])
    .png()
    .toBuffer();
});
after(async () => {
  await pg?.close();
});
async function contexto(verificacao, revisao = 0) {
  const id = randomUUID(),
    catalogo = randomUUID(),
    admin = randomUUID();
  await pg.query('insert into miniatura_catalogo(id,revisao) values($1,$2)', [catalogo, revisao]);
  await pg.query(
    "insert into miniatura_pedidos(id,catalogo_id,status,candidato,verificacao) values($1,$2,'revisao',$3,$4)",
    [id, catalogo, `candidatas/${id}/original.png`, JSON.stringify(verificacao)],
  );
  const db = {
    storage: {
      from: () => ({ download: async () => ({ data: new Blob([imagem]), error: null }) }),
    },
    from(tabela) {
      assert.equal(tabela, 'miniatura_pedidos');
      let alteracoes,
        filtros = [];
      const q = {
        select: () => q,
        eq(campo, valor) {
          filtros.push([campo, valor]);
          return q;
        },
        update(valor) {
          alteracoes = valor;
          return q;
        },
        async maybeSingle() {
          const r = await pg.query(
            'select p.*,row_to_json(c) as catalogo from miniatura_pedidos p join miniatura_catalogo c on c.id=p.catalogo_id where p.id=$1',
            [id],
          );
          return { data: r.rows[0], error: null };
        },
        then(ok, erro) {
          const executar = async () => {
            assert.deepEqual(Object.keys(alteracoes), ['verificacao', 'atualizado_em']);
            const parametros = [
              JSON.stringify(alteracoes.verificacao),
              alteracoes.atualizado_em,
              ...filtros.map(([, valor]) => valor),
            ];
            const where = filtros.map(([campo], i) => `${campo}=$${i + 3}`).join(' and ');
            const r = await pg.query(
              `update miniatura_pedidos set verificacao=$1, atualizado_em=$2 where ${where} returning id`,
              parametros,
            );
            return { data: r.rows, error: null };
          };
          return executar().then(ok, erro);
        },
      };
      return q;
    },
    async rpc(nome, parametros) {
      assert.equal(nome, 'publicar_miniatura');
      try {
        const r = await pg.query('select publicar_miniatura($1,$2,$3) as id', [
          parametros.p_pedido,
          parametros.p_admin,
          parametros.p_revisao,
        ]);
        return { data: r.rows[0].id, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
  const req = {
    params: { id },
    body: {
      revisao,
      confirmouIdentidade: true,
      confirmouDireita: true,
      confirmouInteira: true,
      confirmouUso: true,
    },
  };
  const res = {
    locals: { db, adminUserId: admin },
    statusCode: 200,
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return { id, catalogo, admin, req, res };
}
for (const verificacao of [
  { automatica: false, direcao: 'incerta', inteira: false },
  { automatica: true, direcao: 'incerta', inteira: true },
  { automatica: true, direcao: 'direita', inteira: true, fundoTransparente: false },
  {},
])
  test(`API publica com SQL original: ${JSON.stringify(verificacao)}`, async () => {
    const c = await contexto(verificacao);
    if (verificacao.direcao !== 'direita')
      await assert.rejects(
        pg.query('select publicar_miniatura($1,$2,$3)', [c.id, c.admin, 0]),
        /Enquadramento nao confirmado/,
      );
    await aprovar(c.req, c.res);
    assert.equal(c.res.statusCode, 200, JSON.stringify(c.res.body));
    const r = await pg.query(
      'select p.status,p.verificacao,c.revisao,c.publicada from miniatura_pedidos p join miniatura_catalogo c on c.id=p.catalogo_id where p.id=$1',
      [c.id],
    );
    assert.equal(r.rows[0].status, 'aprovada');
    assert.equal(r.rows[0].revisao, 1);
    assert.equal(r.rows[0].publicada, c.res.body.publicacao);
    assert.equal(r.rows[0].verificacao.analise_original.automatica, verificacao.automatica);
    c.res.statusCode = 200;
    await aprovar(c.req, c.res);
    assert.equal(c.res.body.jaAprovada, true);
    const contagem = await pg.query(
      'select count(*)::int as total from miniatura_publicacoes where pedido_id=$1',
      [c.id],
    );
    assert.equal(contagem.rows[0].total, 1, 'retry nao duplica a publicacao');
  });
test('revisao desatualizada nao altera confirmacao nem publicacao', async () => {
  const c = await contexto({ automatica: false, direcao: 'incerta' }, 2);
  c.req.body.revisao = 1;
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 409);
  const r = await pg.query('select status,verificacao from miniatura_pedidos where id=$1', [c.id]);
  assert.equal(r.rows[0].status, 'revisao');
  assert.equal(r.rows[0].verificacao.confirmado_por, undefined);
});
test('direcao errada detectada pela IA nao chega a publicacao SQL', async () => {
  const c = await contexto({ automatica: true, direcao: 'esquerda', inteira: true });
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 422);
  const r = await pg.query(
    'select count(*)::int as total from miniatura_publicacoes where pedido_id=$1',
    [c.id],
  );
  assert.equal(r.rows[0].total, 0);
});

test('candidata diferente da exibida e rejeitada antes de gravar', async () => {
  const c = await contexto({ automatica: false });
  c.req.body.candidato = 'candidatas/anterior/original.png';
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 409);
  const r = await pg.query('select verificacao from miniatura_pedidos where id=$1', [c.id]);
  assert.equal(r.rows[0].verificacao.confirmado_por, undefined);
});
test('alteracao concorrente durante download impede sobrescrever a conferencia', async () => {
  const c = await contexto({ automatica: false });
  c.res.locals.db.storage.from = () => ({
    download: async () => {
      await pg.query(
        "update miniatura_pedidos set atualizado_em=atualizado_em+interval '1 second' where id=$1",
        [c.id],
      );
      return { data: new Blob([imagem]), error: null };
    },
  });
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 409);
  const r = await pg.query('select status,verificacao from miniatura_pedidos where id=$1', [c.id]);
  assert.equal(r.rows[0].status, 'revisao');
  assert.equal(r.rows[0].verificacao.confirmado_por, undefined);
});
test('conflito dentro da funcao SQL retorna conflito e nao grava publicacao parcial', async () => {
  const c = await contexto({ automatica: false });
  const rpc = c.res.locals.db.rpc;
  c.res.locals.db.rpc = async (...args) => {
    await pg.query('update miniatura_catalogo set revisao=revisao+1 where id=$1', [c.catalogo]);
    return rpc(...args);
  };
  await aprovar(c.req, c.res);
  assert.equal(c.res.statusCode, 409);
  assert.match(c.res.body.message, /publicação atualizou/);
  const r = await pg.query(
    'select count(*)::int as total from miniatura_publicacoes where pedido_id=$1',
    [c.id],
  );
  assert.equal(r.rows[0].total, 0);
});
