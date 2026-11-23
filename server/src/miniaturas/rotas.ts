import { getEnv } from '../../scripts/env.mjs';
import express from 'express';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { createSupabaseAdmin } from '../config/conexao.js';
import { clienteMiniaturas } from '../services/previas.js';
import { nomeCompleto, identidadeSchema, chaveCatalogo } from './identidade.js';
import { consultarPublicada, podeConsultarMoto } from './consulta.js';
import { geracaoConfigurada, proximaLiberacaoCota } from './provedor.js';
import { importarFotoFabricante } from './fontesPublicas.js';
import { prepararModelosSemMiniatura } from './fila.js';
import {
  conferirErro,
  criarEnvio,
  criarPedido,
  envioValido,
  pedidoCompleto,
  publicacaoAtual,
  salvarReferencia,
  urlArquivo,
} from './repositorio.js';
const uuid = z.string().uuid();
const editarSchema = z.object({
  observacoes: z.string().trim().max(1500),
  modo: z.enum(['referencia', 'preservar']),
});
function falha(res: express.Response, erro: unknown) {
  console.warn('[miniaturas/api]', erro instanceof Error ? erro.message : 'Falha no banco');
  return res.status(409).json({
    message:
      erro instanceof Error
        ? erro.message
        : 'Nao foi possivel concluir. Atualize e tente novamente.',
  });
}
const enviosRecentes = new Map<string, { inicio: number; quantidade: number }>();
function permitirEnvio(token: string) {
  const agora = Date.now();
  if (enviosRecentes.size > 2000)
    for (const [chave, janela] of enviosRecentes)
      if (agora - janela.inicio > 60_000) enviosRecentes.delete(chave);
  const atual = enviosRecentes.get(token);
  if (!atual && enviosRecentes.size >= 2000) return false;
  if (!atual || agora - atual.inicio > 60_000) {
    enviosRecentes.set(token, { inicio: agora, quantidade: 1 });
    return true;
  }
  atual.quantidade++;
  return atual.quantidade <= 20;
}
const editaveis = ['rascunho', 'informacao', 'falhou', 'revisao'];
export function registrarCentralMiniaturas(app: express.Express) {
  const admin = express.Router();
  admin.use(async (req, res, next) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    res.locals.db = db;
    next();
  });
  admin.get('/', async (_req, res) => {
    const db = res.locals.db;
    const { data, error } = await db
      .from('miniatura_pedidos')
      .select('*,catalogo:miniatura_catalogo(*)')
      .order('atualizado_em', { ascending: false })
      .limit(500);
    if (error) return falha(res, error);
    const { data: consumo } = await db
      .from('miniatura_consumo')
      .select('geracoes')
      .eq('dia', new Date().toISOString().slice(0, 10))
      .maybeSingle();
    const { data: historico } = await db.from('miniatura_publicacoes').select('id').limit(1000);
    const linhas = (data || []) as {
      id: string;
      status: string;
      candidato: string | null;
      [campo: string]: unknown;
    }[];
    const prontas = new Set(
      linhas
        .filter((pedido) => pedido.status === 'revisao')
        .slice(0, 12)
        .map((pedido) => pedido.id),
    );
    const pedidos = await Promise.all(
      linhas.map(async (pedido) => ({
        ...pedido,
        imagem: prontas.has(pedido.id) ? await urlArquivo(db, pedido.candidato) : null,
      })),
    );
    return res.json({
      pedidos,
      configuracao: {
        geracao: geracaoConfigurada(),
        pesquisaAmpliada: true,
        retomaEm:
          proximaLiberacaoCota() > Date.now()
            ? new Date(proximaLiberacaoCota()).toISOString()
            : null,
        limite: Number(getEnv().MINIATURAS_LIMITE_DIARIO) || 30,
        consumo: consumo?.geracoes || 0,
        publicacoes: historico?.length || 0,
      },
    });
  });
  admin.post('/', async (req, res) => {
    const validado = identidadeSchema
      .extend({
        modo: z.enum(['referencia', 'preservar']).default('referencia'),
        observacoes: z.string().max(1500).default(''),
      })
      .safeParse(req.body);
    if (!validado.success)
      return res.status(400).json({ message: 'Confira modelo, ano e observacoes.' });
    try {
      if (validado.data.motoId) {
        const { data } = await res.locals.db
          .from('moto')
          .select('id_moto')
          .eq('id_moto', validado.data.motoId)
          .maybeSingle();
        if (!data) return res.status(404).json({ message: 'Moto nao encontrada.' });
      }
      const pedido = await criarPedido(
        res.locals.db,
        validado.data,
        res.locals.adminUserId,
        validado.data.modo,
        validado.data.observacoes,
      );
      return res.status(201).json({ id: pedido.id });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.post('/preparar-cadastradas', async (_req, res) => {
    try {
      await prepararModelosSemMiniatura(res.locals.db);
      return res.json({ ok: true });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.post('/lote', async (req, res) => {
    const entrada = z
      .object({ modelos: z.array(identidadeSchema.shape.modelo).min(1).max(100) })
      .safeParse(req.body);
    if (!entrada.success)
      return res.status(400).json({ message: 'Informe ate 100 modelos, um por linha.' });
    const unicos = new Map(
      entrada.data.modelos.map((modelo) => {
        const identidade = { modelo, ano: null, variante: '', motoId: null };
        return [chaveCatalogo(identidade), { chave: chaveCatalogo(identidade), modelo }];
      }),
    );
    const { data, error } = await res.locals.db.rpc('enfileirar_miniaturas_lote', {
      p_modelos: [...unicos.values()],
      p_admin: res.locals.adminUserId,
    });
    if (error) return falha(res, error);
    return res.status(202).json({ pedidos: data });
  });
  admin.get('/:id', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).end();
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (!pedido) return res.status(404).end();
      const atual = await publicacaoAtual(res.locals.db, pedido.catalogo);
      const { data: historico, error } = await res.locals.db
        .from('miniatura_publicacoes')
        .select('*')
        .eq('catalogo_id', pedido.catalogo_id)
        .order('criado_em', { ascending: false })
        .limit(10);
      conferirErro(error);
      return res.json({
        ...pedido,
        imagem: await urlArquivo(res.locals.db, pedido.candidato),
        atual: await urlArquivo(res.locals.db, atual?.caminho),
        referencias: await Promise.all(
          pedido.referencias.map(async (ref: { caminho: string }) => ({
            ...ref,
            imagem: await urlArquivo(res.locals.db, ref.caminho),
          })),
        ),
        historico,
      });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.patch('/:id', async (req, res) => {
    const entrada = editarSchema.safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !entrada.success) return res.status(400).end();
    const { data, error } = await res.locals.db
      .from('miniatura_pedidos')
      .update({ ...entrada.data, atualizado_em: new Date().toISOString() })
      .eq('id', req.params.id)
      .in('status', editaveis)
      .select('id');
    if (error || !data?.length)
      return falha(res, new Error('Este pedido nao pode ser editado agora.'));
    return res.json({ ok: true });
  });
  admin.post(
    '/:id/referencias',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }),
    async (req, res) => {
      if (!uuid.safeParse(req.params.id).success || !Buffer.isBuffer(req.body))
        return res.status(400).json({ message: 'Envie uma foto JPEG, PNG ou WebP.' });
      try {
        await salvarReferencia(res.locals.db, String(req.params.id), req.body, 'admin');
        return res.status(201).json({ ok: true });
      } catch (erro) {
        return falha(res, erro);
      }
    },
  );
  admin.post('/:id/fonte', async (req, res) => {
    const entrada = z
      .object({ url: z.string().url().max(1800), confirmouUso: z.literal(true) })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !entrada.success)
      return res.status(400).json({ message: 'Informe o link e confirme a autorizacao de uso.' });
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (!pedido || !editaveis.includes(pedido.status) || pedido.referencias.length >= 4)
        return res
          .status(409)
          .json({ message: 'Pedido indisponivel para receber outra referencia.' });
      const foto = await importarFotoFabricante(entrada.data.url);
      await salvarReferencia(res.locals.db, pedido.id, foto.bytes, 'web', {
        url: foto.url,
        licenca: `Uso declarado pelo administrador ${res.locals.adminUserId}`,
      });
      return res.status(201).json({ ok: true });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.delete('/:id/referencias/:indice', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).end();
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      const indice = Number(req.params.indice);
      if (
        !pedido ||
        !editaveis.includes(pedido.status) ||
        !Number.isInteger(indice) ||
        !pedido.referencias[indice]
      )
        return res.status(409).end();
      // Fotos ficam privadas no historico; removemos somente o vinculo do rascunho.
      const { data, error } = await res.locals.db
        .from('miniatura_pedidos')
        .update({
          referencias: pedido.referencias.filter((_item: unknown, i: number) => i !== indice),
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pedido.id)
        .eq('atualizado_em', pedido.atualizado_em)
        .in('status', editaveis)
        .select('id');
      conferirErro(error);
      if (!data?.length) throw new Error('As referencias mudaram. Atualize antes de remover.');
      return res.json({ ok: true });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.post('/:id/celular', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).end();
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (!pedido || !editaveis.includes(pedido.status))
        return res.status(409).json({ message: 'Pedido indisponivel para receber fotos.' });
      return res.json(await criarEnvio(res.locals.db, pedido.id));
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.delete('/:id/celular', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).end();
    const { error } = await res.locals.db
      .from('miniatura_envios')
      .update({ cancelado: true })
      .eq('pedido_id', req.params.id);
    if (error) return falha(res, error);
    return res.json({ ok: true });
  });
  admin.post('/:id/gerar', async (req, res) => {
    const entrada = z
      .object({ correcao: z.string().trim().max(800).default('') })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !entrada.success) return res.status(400).end();
    if (!geracaoConfigurada())
      return res.status(503).json({
        message:
          'Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN no servidor antes de gerar.',
      });
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (!pedido || !editaveis.includes(pedido.status))
        return res.status(409).json({ message: 'Este pedido ja esta na fila ou foi encerrado.' });
      if (pedido.tentativas >= 6)
        return res.status(429).json({
          message:
            'Limite de seis tentativas atingido. Revise as referencias antes de criar outra solicitacao.',
        });
      if (pedido.modo === 'preservar' && !pedido.referencias.length)
        return res.status(400).json({ message: 'Envie uma foto para preservar esta moto.' });
      const { data, error } = await res.locals.db
        .from('miniatura_pedidos')
        .update({
          status: 'pendente',
          correcao: entrada.data.correcao,
          erro: null,
          tentar_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pedido.id)
        .eq('status', pedido.status)
        .eq('atualizado_em', pedido.atualizado_em)
        .select('id');
      conferirErro(error);
      if (!data?.length) throw new Error('O pedido mudou. Atualize a tela.');
      return res.status(202).json({ ok: true });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.post('/:id/aprovar', async (req, res) => {
    const entrada = z
      .object({
        revisao: z.number().int().min(0),
        confirmouIdentidade: z.literal(true),
        confirmouDireita: z.literal(true),
        confirmouInteira: z.literal(true),
        confirmouUso: z.literal(true),
      })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !entrada.success)
      return res
        .status(400)
        .json({ message: 'Confirme identidade, direcao, enquadramento e autorizacao de uso.' });
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (!pedido || pedido.status !== 'revisao') return res.status(409).end();
      const verificacao = pedido.verificacao || {};
      if (verificacao.automatica && (verificacao.direcao === 'esquerda' || !verificacao.inteira))
        return res.status(422).json({
          message: 'A candidata foi reprovada no enquadramento. Corrija antes de publicar.',
        });
      conferirErro(
        (
          await res.locals.db
            .from('miniatura_pedidos')
            .update({
              verificacao: {
                ...verificacao,
                direcao: 'direita',
                inteira: true,
                confirmado_por: res.locals.adminUserId,
              },
            })
            .eq('id', pedido.id)
            .eq('status', 'revisao')
        ).error,
      );
      const resultado = await res.locals.db.rpc('publicar_miniatura', {
        p_pedido: pedido.id,
        p_admin: res.locals.adminUserId,
        p_revisao: entrada.data.revisao,
      });
      conferirErro(resultado.error);
      return res.json({ ok: true, publicacao: resultado.data });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.post('/:id/descartar', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) return res.status(400).end();
    const { data, error } = await res.locals.db
      .from('miniatura_pedidos')
      .update({ status: 'descartada', atualizado_em: new Date().toISOString() })
      .eq('id', req.params.id)
      .in('status', editaveis)
      .select('id');
    if (error || !data?.length)
      return falha(res, new Error('Nao e possivel descartar durante o processamento.'));
    return res.json({ ok: true });
  });
  admin.post('/publicacoes/:id/restaurar', async (req, res) => {
    if (!uuid.safeParse(req.params.id).success || !Number.isInteger(req.body?.revisao))
      return res.status(400).end();
    const { error } = await res.locals.db.rpc('restaurar_miniatura', {
      p_publicacao: req.params.id,
      p_admin: res.locals.adminUserId,
      p_revisao: req.body.revisao,
    });
    if (error) return falha(res, error);
    return res.json({ ok: true });
  });
  app.use('/api/admin/miniaturas', admin);

  // O token permite apenas enviar fotos; nunca ler referencias ou publicar imagens.
  const celular = express.Router();
  celular.use(async (req, res, next) => {
    const token = /^Bearer (.+)$/.exec(req.get('Authorization') || '')?.[1];
    const db = createSupabaseAdmin();
    if (!token || !db) return res.status(401).json({ message: 'Link indisponivel ou expirado.' });
    if (!permitirEnvio(token))
      return res.status(429).json({ message: 'Aguarde um minuto antes de enviar novamente.' });
    try {
      const envio = await envioValido(db, token);
      if (!envio)
        return res
          .status(410)
          .json({ message: 'Link expirado ou cancelado. Peca um novo QR Code.' });
      res.locals.db = db;
      res.locals.envio = envio;
      next();
    } catch (erro) {
      return falha(res, erro);
    }
  });
  celular.get('/', async (_req, res) => {
    const pedido = await pedidoCompleto(res.locals.db, res.locals.envio.pedido_id);
    if (!pedido) return res.status(410).end();
    return res.json({
      modelo: pedido.catalogo.modelo,
      quantidade: pedido.referencias.length,
      podeEnviar: editaveis.includes(pedido.status) && pedido.referencias.length < 4,
    });
  });
  celular.post(
    '/',
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        return res.status(400).json({ message: 'Selecione uma foto JPEG, PNG ou WebP.' });
      try {
        await salvarReferencia(res.locals.db, res.locals.envio.pedido_id, req.body, 'celular');
        return res.status(201).json({ ok: true });
      } catch (erro) {
        return falha(res, erro);
      }
    },
  );
  app.use('/api/miniaturas/celular', celular);
  app.get('/api/miniaturas/creditos', async (req, res) => {
    const db = await clienteMiniaturas(req, res);
    if (!db) return;
    try {
      const { data: catalogos, error } = await db
        .from('miniatura_catalogo')
        .select('modelo,publicada')
        .is('moto_id', null)
        .not('publicada', 'is', null)
        .limit(1000);
      conferirErro(error);
      if (!catalogos?.length) return res.json({ fontes: [] });
      const { data: publicacoes, error: erroPublicacoes } = await db
        .from('miniatura_publicacoes')
        .select('id,pedido_id')
        .in(
          'id',
          catalogos.map((item) => item.publicada),
        );
      conferirErro(erroPublicacoes);
      const ids = [...new Set((publicacoes || []).map((item) => item.pedido_id))];
      const { data: pedidos, error: erroPedidos } = await db
        .from('miniatura_pedidos')
        .select('id,pesquisa')
        .in('id', ids);
      conferirErro(erroPedidos);
      const fontes = (pedidos || []).flatMap((pedido) =>
        (pedido.pesquisa?.usadas || []).map(
          (fonte: {
            titulo: string;
            url: string;
            autor?: string;
            licenca?: string;
            licencaUrl?: string;
          }) => ({
            titulo: fonte.titulo,
            url: fonte.url,
            autor: fonte.autor || 'Autor indicado na fonte',
            licenca: fonte.licenca || '',
            licencaUrl: fonte.licencaUrl || '',
          }),
        ),
      );
      return res.json({ fontes: [...new Map(fontes.map((fonte) => [fonte.url, fonte])).values()] });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  app.get('/api/miniaturas/publicada', async (req, res) => {
    const db = await clienteMiniaturas(req, res);
    if (!db) return;
    const entrada = identidadeSchema.safeParse({
      modelo: req.query.modelo,
      variante: req.query.variante || '',
      ano: req.query.ano ? Number(req.query.ano) : null,
    });
    if (!entrada.success) return res.status(400).end();
    try {
      let modelo = nomeCompleto({ ...entrada.data, ano: null });
      let ano = entrada.data.ano;
      let motoId: number | null = null;
      if (req.query.motoId) {
        const id = z.coerce.number().int().positive().safeParse(req.query.motoId);
        if (!id.success) return res.status(400).end();
        const { data: moto, error } = await db
          .from('moto')
          .select('id_cliente,modelo,ano_modelo,ano')
          .eq('id_moto', id.data)
          .maybeSingle();
        conferirErro(error);
        if (
          !moto ||
          !(await podeConsultarMoto(db, id.data, moto.id_cliente, {
            administrador: !!res.locals.adminUserId || !!res.locals.miniaturaAdministrador,
            cliente: res.locals.miniaturaCliente || null,
            funcionario: res.locals.miniaturaFuncionario || null,
          }))
        )
          return res.status(404).end();
        modelo = moto.modelo;
        ano = moto.ano_modelo || moto.ano;
        motoId = id.data;
      }
      const { catalogo, publicacao } = await consultarPublicada(db, modelo, ano, motoId);
      return res.json({
        status: publicacao ? 'publicada' : 'indisponivel',
        catalogoId: catalogo?.id || null,
        revisao: catalogo?.revisao || 0,
        imagem: await urlArquivo(
          db,
          publicacao?.caminho.replace(
            'original.png',
            req.query.tamanho === 'original'
              ? 'original.png'
              : req.query.tamanho === 'tabela'
                ? 'tabela.webp'
                : 'card.webp',
          ),
        ),
        atualizadoEm: catalogo?.atualizado_em || null,
      });
    } catch (erro) {
      return falha(res, erro);
    }
  });
}
