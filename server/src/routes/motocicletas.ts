import type express from 'express';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { enfileirarModelo } from '../filaMiniaturas.js';
import { sugestoesMarcasMotocicleta } from '../marcasMotocicleta.js';
import { formatarNomeModeloMoto } from '../pesquisaModelo.js';
import { listarMotocicletas } from '../services/motocicletas.js';
import { registrarAtividade } from '../services/logs.js';
import { motocicletaSchema } from '../validators/atendimento.js';

export function registrarRotasMotocicletas(app: express.Express) {
  app.get('/api/motorcycles', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    try {
      return res.json(await listarMotocicletas(db));
    } catch (erro) {
      console.error('[motorcycles/list]', erro);
      return res.status(503).json({ message: 'Não foi possível carregar as motocicletas.' });
    }
  });

  app.post('/api/motorcycles', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = motocicletaSchema.safeParse(req.body);
    if (!validado.success)
      return res.status(400).json({ message: 'Confira os dados da motocicleta.' });
    const entrada = validado.data;
    try {
      const { data: responsavel, error: responsavelErro } = await db
        .from('cliente')
        .select('id_cliente,excluido_em')
        .eq('id_cliente', entrada.clientId)
        .maybeSingle();
      if (responsavelErro) throw responsavelErro;
      if (!responsavel || responsavel.excluido_em)
        return res.status(404).json({ message: 'Selecione um cliente ativo.' });
      const normalizado = formatarNomeModeloMoto(entrada.model);
      const { data: dados, error: erro } = await db
        .from('moto')
        .insert({
          id_cliente: entrada.clientId,
          modelo: normalizado,
          placa: entrada.plate.toUpperCase(),
          ano: entrada.year,
          ano_modelo: entrada.modelYear,
          cor: entrada.color || null,
          quilometragem: entrada.mileage,
          chassi: entrada.chassis || null,
          renavam: entrada.renavam || null,
          observacoes: entrada.notes || null,
          ativa: entrada.active,
        })
        .select('id_moto')
        .single();
      if (erro?.code === '23505')
        return res.status(409).json({ message: 'Esta placa já está cadastrada.' });
      if (erro) throw erro;
      await registrarAtividade(db, {
        id_usuario: res.locals.adminUserId,
        evento: 'motocicleta_criada',
        categoria: 'atividade',
        entidade: 'motocicleta',
        entidade_id: String(dados.id_moto),
        dados: { modelo: normalizado, placa: entrada.plate.toUpperCase() },
        resumo: 'Motocicleta adicionada',
      }, req);
      void enfileirarModelo(db, normalizado).catch((erroCapturado) =>
        console.error('[motorcycles/thumbnail]', erroCapturado),
      );
      return res.status(201).json({ id: dados.id_moto });
    } catch (erro) {
      console.error('[motorcycles/create]', erro);
      return res.status(503).json({ message: 'Não foi possível cadastrar a motocicleta.' });
    }
  });

  app.patch('/api/motorcycles/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const validado = motocicletaSchema.safeParse(req.body);
    if (!id.success || !validado.success)
      return res.status(400).json({ message: 'Confira os dados da motocicleta.' });
    const entrada = validado.data;
    try {
      const [
        { data: anteriorLocal, error: anteriorErro },
        { data: responsavel, error: responsavelErro },
      ] = await Promise.all([
        db.from('moto').select('id_cliente,modelo').eq('id_moto', id.data).maybeSingle(),
        db
          .from('cliente')
          .select('id_cliente,excluido_em')
          .eq('id_cliente', entrada.clientId)
          .maybeSingle(),
      ]);
      if (anteriorErro || responsavelErro) throw anteriorErro || responsavelErro;
      if (!anteriorLocal) return res.status(404).json({ message: 'Motocicleta não encontrada.' });
      if (!responsavel || responsavel.excluido_em)
        return res.status(404).json({ message: 'Selecione um cliente ativo.' });
      if (anteriorLocal.id_cliente !== entrada.clientId) {
        const { count: quantidade, error: erro } = await db
          .from('ordem_servico')
          .select('id_os', { count: 'exact', head: true })
          .eq('id_moto', id.data);
        if (erro) throw erro;
        if (quantidade)
          return res.status(409).json({
            message:
              'Esta moto possui OS vinculadas. O proprietário não pode ser alterado sem transferir também o histórico.',
          });
      }
      const normalizado = formatarNomeModeloMoto(entrada.model);
      const { data: dados, error: erro } = await db
        .from('moto')
        .update({
          id_cliente: entrada.clientId,
          modelo: normalizado,
          placa: entrada.plate.toUpperCase(),
          ano: entrada.year,
          ano_modelo: entrada.modelYear,
          cor: entrada.color || null,
          quilometragem: entrada.mileage,
          chassi: entrada.chassis || null,
          renavam: entrada.renavam || null,
          observacoes: entrada.notes || null,
          ativa: entrada.active,
        })
        .eq('id_moto', id.data)
        .select('id_moto')
        .maybeSingle();
      if (erro?.code === '23505')
        return res.status(409).json({ message: 'Esta placa já está cadastrada em outra moto.' });
      if (erro) throw erro;
      if (!dados) return res.status(404).json({ message: 'Motocicleta não encontrada.' });
      await registrarAtividade(db, {
        id_usuario: res.locals.adminUserId,
        evento: 'motocicleta_atualizada',
        categoria: 'atividade',
        entidade: 'motocicleta',
        entidade_id: String(id.data),
        dados: {
          modelo_anterior: anteriorLocal.modelo,
          modelo: normalizado,
          placa: entrada.plate.toUpperCase(),
        },
        resumo: 'Cadastro da motocicleta atualizado',
      }, req);
      if (normalizado !== anteriorLocal.modelo)
        void enfileirarModelo(db, normalizado).catch((erroCapturado) =>
          console.error('[motorcycles/thumbnail]', erroCapturado),
        );
      return res.json({ ok: true });
    } catch (erro) {
      console.error('[motorcycles/edit]', erro);
      return res.status(503).json({ message: 'Não foi possível salvar a motocicleta.' });
    }
  });

  app.delete('/api/motorcycles/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Motocicleta inválida.' });
    return res.status(409).json({
      message:
        'A exclusão de motocicletas foi desativada para preservar o cadastro e o histórico. Edite a motocicleta para marcar o cadastro como inativo.',
    });
  });

  app.get('/api/motorcycle-brands', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    return res.json({ brands: await sugestoesMarcasMotocicleta() });
  });
}
