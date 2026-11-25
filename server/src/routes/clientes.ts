import type express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { diretorioClientes, perfilClienteNoDiretorio } from '../diretorioClientes.js';
import { REPOSITORIO_FOTOS_CLIENTES } from '../services/fotos.js';
import { registrarAtividade } from '../services/logs.js';

export function registrarRotasClientes(app: express.Express) {
  app.get('/api/clients', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    try {
      return res.json(await diretorioClientes(db));
    } catch (erro) {
      console.error('[clients/list]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar os clientes.' });
    }
  });

  app.get('/api/clients/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Cliente inválido.' });
    try {
      const perfil = await perfilClienteNoDiretorio(db, id.data);
      return perfil
        ? res.json(perfil)
        : res.status(404).json({ message: 'Cliente não encontrado.' });
    } catch (erro) {
      console.error('[clients/profile]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar o perfil do cliente.' });
    }
  });

  app.patch('/api/clients/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const valores = z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().max(30).nullable(),
        email: z.union([z.literal(''), z.string().trim().email().max(254)]).nullable(),
        cpf: z
          .string()
          .trim()
          .regex(/^(?:\d{11})?$/),
        birthDate: z.iso.date().nullable(),
        postalCode: z
          .string()
          .regex(/^(?:\d{8})?$/)
          .nullable(),
        address: z.string().trim().max(255).nullable(),
        addressNumber: z.string().trim().max(20).nullable(),
        complement: z.string().trim().max(120).nullable().optional(),
        district: z.string().trim().max(100).nullable(),
        city: z.string().trim().max(100).nullable(),
        state: z
          .string()
          .trim()
          .regex(/^(?:[A-Z]{2})?$/)
          .nullable(),
        photo: z.string().max(2_800_000).optional(),
      })
      .safeParse(req.body);
    if (!id.success || !valores.success)
      return res.status(400).json({ message: 'Confira os dados do cliente e tente novamente.' });
    const entrada = valores.data;
    if (entrada.birthDate && entrada.birthDate > new Date().toISOString().slice(0, 10))
      return res.status(400).json({ message: 'A data de nascimento não pode ser futura.' });
    let novoFoto: Buffer | null = null;
    if (entrada.photo) {
      const correspondencia = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        entrada.photo,
      );
      if (!correspondencia) return res.status(400).json({ message: 'Envie uma foto JPEG válida.' });
      novoFoto = Buffer.from(correspondencia[1], 'base64');
      if (
        !novoFoto.length ||
        novoFoto.length > 2_000_000 ||
        novoFoto[0] !== 0xff ||
        novoFoto[1] !== 0xd8 ||
        novoFoto[2] !== 0xff
      )
        return res.status(400).json({ message: 'A foto precisa ser JPEG e ter até 2 MB.' });
    }
    let enviadoCaminho: string | null = null;
    try {
      const { data: existente, error: encontrarErro } = await db
        .from('cliente')
        .select('id_cliente,nome,foto')
        .eq('id_cliente', id.data)
        .is('excluido_em', null)
        .maybeSingle();
      if (encontrarErro) throw encontrarErro;
      if (!existente) return res.status(404).json({ message: 'Cliente não encontrado.' });
      if (novoFoto) {
        enviadoCaminho = `clients/${id.data}/admin-${randomUUID()}.jpg`;
        const { error: enviarArquivoErro } = await db.storage
          .from(REPOSITORIO_FOTOS_CLIENTES)
          .upload(enviadoCaminho, novoFoto, { contentType: 'image/jpeg', upsert: false });
        if (enviarArquivoErro) throw enviarArquivoErro;
      }
      const { data: dados, error: erro } = await db
        .from('cliente')
        .update({
          nome: entrada.name,
          telefone: entrada.phone || null,
          email: entrada.email || null,
          cpf: entrada.cpf || null,
          data_nascimento: entrada.birthDate,
          cep: entrada.postalCode || null,
          endereco: entrada.address || null,
          ...(entrada.complement !== undefined ? { complemento: entrada.complement || null } : {}),
          numero: entrada.addressNumber || null,
          bairro: entrada.district || null,
          cidade: entrada.city || null,
          estado: entrada.state || null,
          ...(enviadoCaminho ? { foto: enviadoCaminho } : {}),
        })
        .eq('id_cliente', id.data)
        .select('id_cliente')
        .maybeSingle();
      if (erro) throw erro;
      if (
        enviadoCaminho &&
        existente.foto?.startsWith(`clients/${id.data}/`) &&
        existente.foto !== enviadoCaminho
      )
        void db.storage
          .from(REPOSITORIO_FOTOS_CLIENTES)
          .remove([existente.foto])
          .then(({ error: limpezaErro }) => {
            if (limpezaErro) console.error('[clients/old-photo]', limpezaErro);
          });
      await registrarAtividade(db, {
        id_usuario: res.locals.adminUserId,
        evento: 'cliente_atualizado',
        categoria: 'atividade',
        entidade: 'cliente',
        entidade_id: String(id.data),
        id_cliente: id.data,
        nome: entrada.name,
        acao: 'editar',
        resumo: 'Cadastro de cliente atualizado',
      }, req);
      return dados
        ? res.json({ ok: true })
        : res.status(404).json({ message: 'Cliente não encontrado.' });
    } catch (erro) {
      if (enviadoCaminho)
        await db.storage.from(REPOSITORIO_FOTOS_CLIENTES).remove([enviadoCaminho]);
      console.error('[clients/update]', erro);
      return res.status(500).json({ message: 'Não foi possível atualizar o cliente.' });
    }
  });

  app.delete('/api/clients/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Cliente inválido.' });
    const motivo = z.object({ reason: z.string().trim().min(5).max(500) }).safeParse(req.body);
    if (!motivo.success)
      return res
        .status(400)
        .json({ message: 'Informe o motivo da exclusão (mínimo de 5 caracteres).' });
    try {
      const { data: dados, error: erro } = await db.rpc('arquivar_cliente', {
        p_id_cliente: id.data,
        p_usuario: res.locals.adminUserId,
        p_motivo: motivo.data.reason,
      });
      if (erro) throw erro;
      return dados
        ? res.json({ ok: true })
        : res.status(404).json({ message: 'Cliente não encontrado ou já excluído.' });
    } catch (erro) {
      console.error('[clients/archive]', erro);
      return res.status(500).json({ message: 'Não foi possível excluir o cliente.' });
    }
  });

  app.get('/api/clients/:id/photo', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Cliente inválido.' });
    try {
      const { data: cliente, error: clienteErro } = await db
        .from('cliente')
        .select('id_cliente,foto')
        .eq('id_cliente', id.data)
        .maybeSingle();
      if (clienteErro) throw clienteErro;
      if (!cliente?.foto || !cliente.foto.startsWith(`clients/${id.data}/`))
        return res.status(404).json({ message: 'Foto não cadastrada.' });
      const { data: dados, error: erro } = await db.storage
        .from(REPOSITORIO_FOTOS_CLIENTES)
        .download(cliente.foto);
      if (erro || !dados) return res.status(404).json({ message: 'Foto não encontrada.' });
      const imagem = Buffer.from(await dados.arrayBuffer());
      res.type(cliente.foto.toLowerCase().endsWith('.png') ? 'png' : 'jpeg');
      return res.send(imagem);
    } catch (erro) {
      console.error('[clients/photo]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar a foto do cliente.' });
    }
  });
}
