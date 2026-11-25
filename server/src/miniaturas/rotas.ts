import {
  impedimentoPublicacaoMiniatura,
  prepararVerificacaoPublicacao,
  statusMiniaturaEmAberto,
} from '../shared/validacaoMiniatura.js';
import { getEnv } from '../../scripts/env.mjs';
import express from 'express';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { createSupabaseAdmin } from '../config/conexao.js';
import { clienteMiniaturas } from '../services/previas.js';
import { nomeCompleto, identidadeSchema, chaveCatalogo } from './identidade.js';
import { consultarPublicada, podeConsultarMoto } from './consulta.js';
import { geracaoConfigurada, proximaLiberacaoCota, situacaoGeracao } from './provedor.js';
import { importarFotoFabricante } from './fontesPublicas.js';
import { prepararModelosSemMiniatura } from './fila.js';
import { validarArquivoPublicacao, validarMascaraPintura } from './imagens.js';
import { ACERVO } from './identidade.js';
import {
  apagarCandidata,
  conferirErro,
  cancelarEnvios,
  criarEnvio,
  criarPedido,
  envioValido,
  pedidoCompleto,
  publicacaoAtual,
  salvarReferencia,
  urlArquivo,
  urlPrevia,
} from './repositorio.js';
const uuid = z.string().uuid();
const editarSchema = z.object({
  observacoes: z.string().trim().max(1500),
  modo: z.enum(['referencia', 'preservar']),
});
function falha(res: express.Response, erro: unknown) {
  if (erro && typeof erro === 'object' && 'code' in erro) {
    const codigo = String(erro.code);
    console.warn('[miniaturas/api] Banco', { codigo });
    if (codigo === 'P0001') {
      const mensagem = 'message' in erro ? String(erro.message) : '';
      const texto = /imagem publicada mudou|revisao/i.test(mensagem)
        ? 'Outra publicação atualizou este modelo. A tela será atualizada; confira e aprove novamente.'
        : /Enquadramento nao confirmado/i.test(mensagem)
          ? 'O banco não reconheceu a conferência. Atualize o servidor com a correção de aprovação.'
          : 'A solicitação mudou durante a publicação. Atualize os dados e tente novamente.';
      return res.status(409).json({ message: texto });
    }
    if (codigo === '23505')
      return res.status(409).json({
        code: 'MODELO_EM_GERACAO',
        message:
          'Já existe uma miniatura deste mesmo modelo sendo gerada agora. Aguarde ela terminar (ou cancele-a na Central de Miniaturas) e gere de novo.',
      });
    return res.status(503).json({
      message: ['42P01', '42703', '42883', '42501', 'PGRST202', 'PGRST204', 'PGRST205'].includes(
        codigo,
      )
        ? `O banco de miniaturas está indisponível ou desatualizado (código ${codigo}). Confira as migrações e permissões no Supabase.`
        : `Não foi possível acessar o banco de miniaturas (código ${codigo}).`,
    });
  }
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
const LIMITE_TENTATIVAS_AUTOMATICAS = 6;
export function registrarCentralMiniaturas(app: express.Express) {
  const admin = express.Router();
  admin.use(async (req, res, next) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    res.locals.db = db;
    next();
  });
  // A tela consulta antes de gerar para avisar sobre tokens esgotados ou credenciais.
  admin.get('/situacao', (_req, res) => {
    res.json(situacaoGeracao());
  });
  admin.get('/pendencias', async (_req, res) => {
    const { count, error } = await res.locals.db
      .from('miniatura_pedidos')
      .select('id', { count: 'exact', head: true })
      .in('status', [...statusMiniaturaEmAberto]);
    if (error) return falha(res, error);
    return res.json({ quantidade: count || 0 });
  });
  admin.get('/', async (_req, res) => {
    const db = res.locals.db;
    // As tres consultas sao independentes: em paralelo a tela abre mais rapido.
    const [{ data, error }, { data: consumo }, { count: totalPublicacoes }] = await Promise.all([
      db
        .from('miniatura_pedidos')
        .select('*,catalogo:miniatura_catalogo(*)')
        .order('atualizado_em', { ascending: false })
        .limit(500),
      db
        .from('miniatura_consumo')
        .select('geracoes')
        .eq('dia', new Date().toISOString().slice(0, 10))
        .maybeSingle(),
      db.from('miniatura_publicacoes').select('id', { count: 'exact', head: true }),
    ]);
    if (error) return falha(res, error);
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
        // Uma previa ausente no storage nao pode derrubar a central inteira.
        imagem: prontas.has(pedido.id)
          ? await urlPrevia(db, pedido.candidato).catch(() => null)
          : null,
      })),
    );
    const liberacao = proximaLiberacaoCota();
    return res.json({
      pedidos,
      configuracao: {
        geracao: geracaoConfigurada(),
        situacao: situacaoGeracao(),
        pesquisaAmpliada: true,
        retomaEm: liberacao > Date.now() ? new Date(liberacao).toISOString() : null,
        limite: Number(getEnv().MINIATURAS_LIMITE_DIARIO) || 30,
        consumo: consumo?.geracoes || 0,
        publicacoes: totalPublicacoes || 0,
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
        { ...validado.data, motoId: null },
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
        imagem: await urlPrevia(res.locals.db, pedido.candidato),
        atual: await urlPrevia(res.locals.db, atual?.caminho),
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
    try {
      await cancelarEnvios(res.locals.db, String(req.params.id));
      return res.json({ ok: true });
    } catch (erro) {
      return falha(res, erro);
    }
  });
  admin.post('/:id/gerar', async (req, res) => {
    const entrada = z
      .object({
        correcao: z.string().trim().max(800).default(''),
        observacoes: z.string().trim().max(1500).optional(),
        modo: z.enum(['referencia', 'preservar']).optional(),
      })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !entrada.success) return res.status(400).end();
    if (process.env.MINIATURAS_PAUSAR_GERACAO === 'true')
      return res.status(503).json({ message: 'A geração de miniaturas está pausada no servidor.' });
    const situacao = situacaoGeracao();
    if (!geracaoConfigurada() || (!situacao.disponivel && situacao.motivo !== 'sem_tokens'))
      return res.status(503).json({ code: situacao.motivo, message: situacao.mensagem });
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (pedido && ['pendente', 'processando'].includes(pedido.status))
        return res.status(202).json({
          ok: true,
          jaNaFila: true,
          message: 'A solicitação já está na fila. Aguarde o processamento ou cancele para editar.',
        });
      if (!pedido || !editaveis.includes(pedido.status))
        return res.status(409).json({
          code: 'PEDIDO_ENCERRADO',
          message: 'Esta solicitação foi encerrada. Crie uma nova para gerar outra imagem.',
        });
      // O limite de seis vale para as correcoes automaticas de um pedido. Um novo
      // clique do administrador libera outra rodada; o limite diario continua valendo.
      const novaRodada = pedido.tentativas >= LIMITE_TENTATIVAS_AUTOMATICAS;
      const modo = entrada.data.modo || pedido.modo;
      if (modo === 'preservar' && !pedido.referencias.length)
        return res.status(400).json({ message: 'Envie uma foto para preservar esta moto.' });
      const { data, error } = await res.locals.db
        .from('miniatura_pedidos')
        .update({
          status: 'pendente',
          correcao: entrada.data.correcao,
          observacoes: entrada.data.observacoes ?? pedido.observacoes,
          modo,
          erro: null,
          ...(novaRodada ? { tentativas: 0, falhas: 0 } : {}),
          tentar_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', pedido.id)
        .eq('status', pedido.status)
        .eq('atualizado_em', pedido.atualizado_em)
        .select('id');
      conferirErro(error);
      if (!data?.length) {
        const atual = await pedidoCompleto(res.locals.db, pedido.id);
        if (atual && ['pendente', 'processando'].includes(atual.status))
          return res.status(202).json({ ok: true, jaNaFila: true });
        return res.status(409).json({
          code: 'PEDIDO_ALTERADO',
          message: 'O pedido mudou. Atualize a tela antes de gerar.',
        });
      }
      return res.status(202).json({
        ok: true,
        ...(situacao.motivo === 'sem_tokens' ? { aviso: situacao.mensagem } : {}),
      });
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
        candidato: z.string().min(1).max(500).optional(),
      })
      .safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !entrada.success)
      return res
        .status(400)
        .json({ message: 'Confirme identidade, direcao, enquadramento e autorizacao de uso.' });
    try {
      const pedido = await pedidoCompleto(res.locals.db, String(req.params.id));
      if (!pedido) return res.status(404).json({ message: 'Solicitação não encontrada.' });
      if (pedido.status === 'aprovada') return res.json({ ok: true, jaAprovada: true });
      if (pedido.status !== 'revisao' || !pedido.candidato)
        return res.status(409).json({
          message: 'A geração ainda não está pronta para aprovação. Atualize a solicitação.',
        });
      if (entrada.data.candidato && entrada.data.candidato !== pedido.candidato)
        return res
          .status(409)
          .json({ message: 'A candidata mudou. Confira a nova imagem antes de aprovar.' });
      if (entrada.data.revisao !== pedido.catalogo.revisao)
        return res.status(409).json({
          message: 'A imagem publicada mudou. Atualize a revisão e confira antes de aprovar.',
        });
      const arquivo = await res.locals.db.storage.from(ACERVO).download(pedido.candidato);
      conferirErro(arquivo.error);
      if (!arquivo.data)
        return res
          .status(422)
          .json({ message: 'A candidata não está mais disponível. Gere outra imagem.' });
      const bytesCandidata = Buffer.from(await arquivo.data.arrayBuffer());
      await validarArquivoPublicacao(bytesCandidata);
      // Toda candidata da fila atual e personalizavel; pedidos antigos sem mascara seguem validos.
      if (pedido.verificacao?.pinturaPersonalizavel) {
        const mascara = await res.locals.db.storage
          .from(ACERVO)
          .download(pedido.candidato.replace('original.png', 'pintura.png'));
        conferirErro(mascara.error);
        if (!mascara.data)
          return res
            .status(422)
            .json({ message: 'A mascara de pintura esta ausente. Gere outra opcao.' });
        await validarMascaraPintura(bytesCandidata, Buffer.from(await mascara.data.arrayBuffer()));
      }
      // A analise da IA pode errar; o administrador ja confirmou direcao e enquadramento
      // (confirmouDireita/confirmouInteira). O alerta fica registrado na verificacao.
      const verificacao = { ...(pedido.verificacao || {}), fundoTransparente: true };
      const alertaIa = impedimentoPublicacaoMiniatura(verificacao);
      if (alertaIa)
        pedido.verificacao = { ...(pedido.verificacao || {}), alerta_ia_ignorado: alertaIa };
      const confirmacao = await res.locals.db
        .from('miniatura_pedidos')
        .update({
          verificacao: prepararVerificacaoPublicacao(
            pedido.verificacao || {},
            res.locals.adminUserId,
            pedido.candidato,
          ),
          atualizado_em: new Date(
            Math.max(Date.now(), Date.parse(pedido.atualizado_em) + 1),
          ).toISOString(),
        })
        .eq('id', pedido.id)
        .eq('status', 'revisao')
        .eq('candidato', pedido.candidato)
        .eq('atualizado_em', pedido.atualizado_em)
        .select('id');
      conferirErro(confirmacao.error);
      if (!confirmacao.data?.length)
        return res.status(409).json({ message: 'A candidata mudou. Atualize antes de aprovar.' });
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
    const { data: anterior } = await res.locals.db
      .from('miniatura_pedidos')
      .select('candidato')
      .eq('id', req.params.id)
      .maybeSingle();
    const { data, error } = await res.locals.db
      .from('miniatura_pedidos')
      .update({
        status: 'descartada',
        executor: null,
        candidato: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .in('status', [...editaveis, 'pendente', 'processando'])
      .select('id');
    if (error || !data?.length)
      return falha(res, new Error('A solicitacao ja foi encerrada. Atualize a tela.'));
    await cancelarEnvios(res.locals.db, String(req.params.id));
    // A limpeza do storage nao pode desfazer o descarte se falhar.
    await apagarCandidata(res.locals.db, anterior?.candidato).catch((falhaLimpeza) =>
      console.warn(
        '[miniaturas/descartar] limpeza',
        falhaLimpeza instanceof Error ? falhaLimpeza.message : 'falha',
      ),
    );
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
        mascara: publicacao
          ? await urlArquivo(db, publicacao.caminho.replace('original.png', 'pintura.png')).catch(
              () => null,
            )
          : null,
        atualizadoEm: catalogo?.atualizado_em || null,
      });
    } catch (erro) {
      return falha(res, erro);
    }
  });
}
