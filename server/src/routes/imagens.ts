import type express from 'express';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { enfileirarModelo } from '../filaMiniaturas.js';
import { verificarModeloMotocicleta } from '../pesquisaModelo.js';
import { clienteDaOrdem, idOrdemDaFoto, REPOSITORIO_FOTOS_CLIENTES } from '../services/fotos.js';
import {
  clienteMiniaturas,
  imagemMotocicletaArmazenada,
  modeloVerificado,
} from '../services/previas.js';

export function registrarRotasImagens(app: express.Express) {
  app.get('/api/orders/:id/client-photo', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = idOrdemDaFoto(req, res);
    if (!id) return;
    try {
      const cliente = await clienteDaOrdem(db, id);
      if (!cliente?.foto || !cliente.foto.startsWith(`clients/${cliente.id_cliente}/`))
        return res.status(404).json({ message: 'Foto não cadastrada.' });
      const { data: dados, error: erroLocal } = await db.storage
        .from(REPOSITORIO_FOTOS_CLIENTES)
        .download(cliente.foto);
      if (erroLocal || !dados) return res.status(404).json({ message: 'Foto não encontrada.' });
      const imagem = Buffer.from(await dados.arrayBuffer());
      res.type(cliente.foto.endsWith('.png') ? 'png' : 'jpeg');
      return res.send(imagem);
    } catch (erroLocal) {
      console.error('[client-photo/read]', erroLocal);
      return res.status(500).json({ message: 'Não foi possível carregar a foto do cliente.' });
    }
  });

  app.get('/api/motorcycle-thumbnails/by-model', async (req, res) => {
    const db = await clienteMiniaturas(req, res);
    if (!db) return;
    try {
      const modeloLocal = await modeloVerificado(req, res, db);
      if (!modeloLocal) return;
      const imagem = await imagemMotocicletaArmazenada(db, modeloLocal);
      if (imagem)
        return res.json({
          status: 'pronta',
          imageUrl: `/api/motorcycle-thumbnails/image?model=${encodeURIComponent(modeloLocal)}`,
        });
      if (req.get('Authorization'))
        return res.status(202).json({ status: 'indisponivel', imageUrl: null });
      const tarefa = await enfileirarModelo(db, modeloLocal);
      return res
        .status(202)
        .json({ status: tarefa.status, nextRetryAt: tarefa.nextRetryAt, imageUrl: null });
    } catch (erroLocal) {
      console.error('[thumbnail/status]', erroLocal);
      return res.status(503).json({ message: 'Falha ao consultar a fila de miniaturas.' });
    }
  });

  app.get('/api/motorcycle-thumbnails/image', async (req, res) => {
    const db = await clienteMiniaturas(req, res);
    if (!db) return;
    try {
      const modeloLocal = await modeloVerificado(req, res, db);
      if (!modeloLocal) return;
      const imagem = await imagemMotocicletaArmazenada(db, modeloLocal);
      if (!imagem) {
        if (!req.get('Authorization')) await enfileirarModelo(db, modeloLocal);
        return res
          .status(202)
          .json({ code: 'IMAGE_QUEUED', message: 'Miniatura em processamento.' });
      }
      res.setHeader('X-Preview-Origin', imagem.origin);
      res.setHeader('Content-Type', imagem.mime);
      return res.send(imagem.bytes);
    } catch (erroLocal) {
      console.error('[thumbnail/image]', erroLocal);
      return res.status(503).json({ message: 'Falha ao carregar miniatura.' });
    }
  });

  app.get('/api/motorcycle-thumbnails/preview-existing', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const modeloLocal = z
      .string()
      .trim()
      .min(3)
      .max(100)
      .refine((valor) => !/[\r\n<>]/.test(valor))
      .safeParse(req.query.model);
    if (!modeloLocal.success) return res.status(400).json({ message: 'Modelo inválido.' });
    try {
      const imagem = await imagemMotocicletaArmazenada(db, modeloLocal.data);
      if (!imagem) return res.status(404).end();
      res.setHeader('X-Preview-Origin', imagem.origin);
      res.setHeader('X-Preview-Origin', imagem.origin);
      res.setHeader('Content-Type', imagem.mime);
      return res.send(imagem.bytes);
    } catch (erroLocal) {
      console.error('[thumbnail/preview-existing]', erroLocal);
      return res.status(503).json({ message: 'Não foi possível consultar a miniatura.' });
    }
  });

  app.get('/api/orders/:id/model-preview', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
    try {
      const { data: ordem, error: erroLocal } = await db
        .from('ordem_servico')
        .select('id_moto')
        .eq('id_os', id.data)
        .maybeSingle();
      if (erroLocal) throw erroLocal;
      if (!ordem) return res.status(404).json({ message: 'OS não encontrada.' });
      const { data: moto, error: motoErro } = await db
        .from('moto')
        .select('modelo,ano_modelo,ano')
        .eq('id_moto', ordem.id_moto)
        .maybeSingle();
      if (motoErro) throw motoErro;
      const modeloLocal = moto?.modelo?.trim();
      if (!modeloLocal || modeloLocal.length > 100 || /[\r\n<>]/.test(modeloLocal))
        return res.status(422).json({ message: 'Modelo inválido.' });
      const imagem = await imagemMotocicletaArmazenada(
        db,
        modeloLocal,
        moto?.ano_modelo || moto?.ano || null,
        ordem.id_moto,
      );
      if (imagem) {
        res.setHeader('X-Preview-Origin', imagem.origin);
        res.setHeader('Content-Type', imagem.mime);
        return res.send(imagem.bytes);
      }
      if (req.get('Authorization'))
        return res.status(202).json({ status: 'indisponivel', imageUrl: null });
      const tarefa = await enfileirarModelo(db, modeloLocal);
      return res.status(202).json({
        code: 'IMAGE_QUEUED',
        status: tarefa.status,
        nextRetryAt: tarefa.nextRetryAt,
        message: 'Miniatura em processamento.',
      });
    } catch (erroLocal) {
      console.error('[orders/model-preview]', erroLocal);
      return res
        .status(503)
        .json({ code: 'IMAGE_UNAVAILABLE', message: 'Não foi possível carregar a miniatura.' });
    }
  });

  app.get('/api/motorcycle-models', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const { data: dados, error: erroLocal } = await db
      .from('moto')
      .select('modelo')
      .order('id_moto', { ascending: false })
      .limit(500);
    if (erroLocal)
      return res.status(503).json({ message: 'Não foi possível carregar os modelos cadastrados.' });
    return res.json({
      models: [
        ...new Set((dados ?? []).map((linha) => linha.modelo?.trim()).filter(Boolean)),
      ].slice(0, 150),
    });
  });

  app.get('/api/motorcycle-models/research', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const modeloLocal = z.string().trim().min(3).max(100).safeParse(req.query.model);
    if (!modeloLocal.success)
      return res.status(400).json({ message: 'Informe a marca e o modelo.' });
    try {
      const { data: dados, error: erroLocal } = await db.from('moto').select('modelo').limit(500);
      if (erroLocal) throw erroLocal;
      return res.json(
        await verificarModeloMotocicleta(modeloLocal.data, [
          ...new Set(
            (dados ?? []).map((linha) => linha.modelo).filter((nome): nome is string => !!nome),
          ),
        ]),
      );
    } catch (erroLocal) {
      console.error('[motorcycle-models/research]', erroLocal);
      return res.status(503).json({ message: 'Não foi possível consultar os modelos agora.' });
    }
  });

  const rotaSubstituida: express.RequestHandler = async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    res.status(410).json({
      message: 'Use o estudio de miniaturas e a fila persistente.',
      replacement: '/api/admin/miniaturas',
    });
  };
  app.get(
    ['/api/orders/:id/model-preview/candidate', '/api/motorcycles/:id/model-preview/candidate'],
    rotaSubstituida,
  );
  app.post(
    [
      '/api/orders/:id/model-preview/draft',
      '/api/motorcycles/:id/model-preview/draft',
      '/api/orders/:id/model-preview/approve',
      '/api/motorcycles/:id/model-preview/approve',
      '/api/orders/:id/model-preview/candidate/approve',
      '/api/motorcycles/:id/model-preview/candidate/approve',
    ],
    rotaSubstituida,
  );
}
