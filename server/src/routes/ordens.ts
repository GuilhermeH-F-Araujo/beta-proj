import type express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { permitir } from '../cargos.js';
import { enfileirarModelo } from '../filaMiniaturas.js';
import { formatarNomeModeloMoto } from '../pesquisaModelo.js';
import { carregarOrdens, ORDENS_POR_PAGINA } from '../services/consultaOrdens.js';
import { registrarAtividade } from '../services/logs.js';
import {
  consultaOrdensSchema,
  corrigirOrdemSchema,
  criarOrdemSchema,
} from '../validators/atendimento.js';

export function registrarRotasOrdens(app: express.Express) {
  app.get('/api/orders/create-options', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    try {
      const [
        { data: clientes, error: clienteErro },
        { data: motocicletas, error: motoErro },
        { data: mecanicos, error: mecanicoErro },
      ] = await Promise.all([
        db
          .from('cliente')
          .select('id_cliente,nome,telefone,email,cpf')
          .is('excluido_em', null)
          .order('nome')
          .limit(2000),
        db
          .from('moto')
          .select('id_moto,id_cliente,modelo,placa,ano,cor,quilometragem')
          .order('id_moto', { ascending: false })
          .limit(5000),
        db.from('mecanico').select('id_funcionario').limit(500),
      ]);
      if (clienteErro || motoErro || mecanicoErro) throw clienteErro || motoErro || mecanicoErro;
      const mecanicoIds = (mecanicos ?? []).map((item) => item.id_funcionario);
      const { data: equipe, error: equipeErro } = mecanicoIds.length
        ? await db
            .from('funcionario')
            .select('id_funcionario,nome')
            .in('id_funcionario', mecanicoIds)
        : { data: [], error: null };
      if (equipeErro) throw equipeErro;
      const detalhesCliente =
        permitir(res.locals.acesso, 'clientes', 'visualizar') ||
        permitir(res.locals.acesso, 'ordens', 'visualizar');
      return res.json({
        clients: (clientes ?? []).map((elementoAtual) => ({
          id: elementoAtual.id_cliente,
          name: elementoAtual.nome,
          phone: detalhesCliente ? elementoAtual.telefone : null,
          email: detalhesCliente ? elementoAtual.email : null,
          cpf: detalhesCliente ? elementoAtual.cpf : null,
        })),
        motorcycles: (motocicletas ?? []).map((mesAtual) => ({
          id: mesAtual.id_moto,
          clientId: mesAtual.id_cliente,
          model: mesAtual.modelo,
          plate: mesAtual.placa,
          year: mesAtual.ano,
          color: mesAtual.cor,
          mileage: mesAtual.quilometragem,
        })),
        mechanics: permitir(res.locals.acesso, 'ordens', 'visualizar')
          ? (equipe ?? []).map((mesAtual) => ({ id: mesAtual.id_funcionario, name: mesAtual.nome }))
          : [],
      });
    } catch (erro) {
      console.error('[orders/create-options]', erro);
      return res
        .status(500)
        .json({ message: 'Não foi possível carregar clientes e motos para a nova OS.' });
    }
  });

  app.post('/api/orders', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = criarOrdemSchema.safeParse(req.body);
    if (!validado.success)
      return res
        .status(400)
        .json({ message: validado.error.issues[0]?.message || 'Confira os dados da OS.' });
    const entrada = validado.data;
    const enviado: string[] = [];
    try {
      const fotos: { url: string }[] = [];
      const rascunho = randomUUID();
      const validoFotos = entrada.photos.map((fotoLocal) => {
        const correspondencia = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
          fotoLocal.data,
        );
        if (!correspondencia) throw new Error('As fotos devem ser imagens JPEG válidas.');
        const bytes = Buffer.from(correspondencia[1], 'base64');
        if (
          bytes.length > 550_000 ||
          bytes.length < 100 ||
          bytes[0] !== 0xff ||
          bytes[1] !== 0xd8 ||
          bytes[2] !== 0xff
        )
          throw new Error('Foto inválida ou maior que 550 KB.');
        return bytes;
      });
      for (const [indice, bytes] of validoFotos.entries()) {
        const caminho = `orders/${rascunho}/entrada-${indice + 1}.jpg`;
        const { error: enviarArquivoErro } = await db.storage
          .from('fotos-os')
          .upload(caminho, bytes, { contentType: 'image/jpeg', upsert: false });
        if (enviarArquivoErro) throw enviarArquivoErro;
        enviado.push(caminho);
        fotos.push({ url: db.storage.from('fotos-os').getPublicUrl(caminho).data.publicUrl });
      }
      const { data: dados, error: erro } = await db.rpc('admin_create_order', {
        p_payload: {
          ...entrada,
          model: entrada.motorcycleId ? entrada.model : formatarNomeModeloMoto(entrada.model),
          photos: fotos,
          clientCpf: entrada.clientCpf,
          year: entrada.year,
          mileage: entrada.mileage,
        },
      });
      if (erro) throw erro;
      const idOs = Number(dados?.id);
      const idCliente = Number(dados?.clientId);
      const idMoto = Number(dados?.motorcycleId);
      const eventos = [
        registrarAtividade(db, {
          id_usuario: res.locals.adminUserId,
          evento: 'ordem_criada',
          categoria: 'atividade',
          entidade: 'ordem_servico',
          entidade_id: String(idOs),
          id_os: idOs,
          resumo: 'Ordem de serviço criada',
        }, req),
        ...(entrada.clientId
          ? []
          : [
              registrarAtividade(db, {
                id_usuario: res.locals.adminUserId,
                evento: 'cliente_criado',
                categoria: 'atividade',
                entidade: 'cliente',
                entidade_id: String(idCliente),
                id_cliente: idCliente,
                nome: entrada.clientName,
                acao: 'criar',
                resumo: 'Cliente adicionado ao cadastrar uma ordem de serviço',
              }, req),
            ]),
        ...(entrada.motorcycleId
          ? []
          : [
              registrarAtividade(db, {
                id_usuario: res.locals.adminUserId,
                evento: 'motocicleta_criada',
                categoria: 'atividade',
                entidade: 'motocicleta',
                entidade_id: String(idMoto),
                dados: { modelo: entrada.model, placa: entrada.plate.toUpperCase() },
                resumo: 'Motocicleta adicionada ao cadastrar uma ordem de serviço',
              }, req),
            ]),
      ];
      await Promise.all(eventos);
      return res.status(201).json(dados);
    } catch (erro) {
      if (enviado.length) await db.storage.from('fotos-os').remove(enviado);
      console.error('[orders/create]', erro);
      const mensagem = String((erro as { message?: string })?.message ?? '');
      return res
        .status(
          mensagem.includes('duplicate key')
            ? 409
            : mensagem.startsWith('Foto') || mensagem.startsWith('As fotos')
              ? 400
              : 500,
        )
        .json({
          message: mensagem.includes('moto_placa_key')
            ? 'Esta placa já está cadastrada. Selecione a moto existente.'
            : mensagem.includes('não pertence') || mensagem.includes('não encontrado')
              ? mensagem
              : mensagem.startsWith('Foto') || mensagem.startsWith('As fotos')
                ? mensagem
                : 'Não foi possível cadastrar a OS. Confira os dados e tente novamente.',
        });
    }
  });

  app.get('/api/orders', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = consultaOrdensSchema.safeParse(req.query);
    if (!validado.success) return res.status(400).json({ message: 'Filtros inválidos.' });
    try {
      const { data: filtroMotos, error: filtroErro } = validado.data.clientId
        ? await db.from('moto').select('id_moto').eq('id_cliente', validado.data.clientId)
        : { data: null, error: null };
      if (filtroErro) throw filtroErro;
      const restritoMotoIds = filtroMotos?.map((motocicleta) => motocicleta.id_moto) ?? [];
      const [resultado, ...contagens] = await Promise.all([
        carregarOrdens(db, validado.data),
        ...(
          [
            'aguardando',
            'em andamento',
            'aguardando peça',
            'pronto',
            'entregue',
            'cancelada',
          ] as const
        ).map((situacao) => {
          let quantidadeConsulta = db
            .from('ordem_servico')
            .select('id_os', { count: 'exact', head: true })
            .eq('status', situacao);
          if (validado.data.clientId)
            quantidadeConsulta = quantidadeConsulta.in(
              'id_moto',
              restritoMotoIds.length ? restritoMotoIds : [-1],
            );
          return quantidadeConsulta;
        }),
      ]);
      if (contagens.some((item) => item.error))
        throw new Error('Não foi possível contar os status.');
      return res.json({
        ...resultado,
        counts: {
          aguardando: contagens[0].count ?? 0,
          'em andamento': contagens[1].count ?? 0,
          'aguardando peça': contagens[2].count ?? 0,
          pronto: contagens[3].count ?? 0,
          entregue: contagens[4].count ?? 0,
          cancelada: contagens[5].count ?? 0,
        },
      });
    } catch (erro) {
      console.error('[orders]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar as ordens de serviço.' });
    }
  });

  app.get('/api/orders/export', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const validado = consultaOrdensSchema.safeParse(req.query);
    if (!validado.success) return res.status(400).json({ message: 'Filtros inválidos.' });
    try {
      const todos = [];
      for (let pagina = 1; pagina <= 1000; pagina++) {
        const resultado = await carregarOrdens(db, { ...validado.data, page: pagina });
        todos.push(...resultado.items);
        if (pagina * ORDENS_POR_PAGINA >= resultado.total) break;
      }
      const celulaCsv = (valor: unknown) => {
        const bruto = String(valor ?? '');
        const seguro = /^[\s]*[=+@\-]/.test(bruto) ? `'${bruto}` : bruto;
        return `"${seguro.replaceAll('"', '""')}"`;
      };
      const linhasTexto = [
        [
          'Nº OS',
          'Cliente',
          'Telefone',
          'Motocicleta',
          'Placa',
          'Status',
          'Entrada',
          'Previsão',
          'Responsável',
          'Total',
          'Pagamento',
        ],
        ...todos.map((linha) => [
          `OS #${linha.id}`,
          linha.client,
          linha.phone,
          linha.motorcycle,
          linha.plate,
          linha.status,
          linha.entry,
          linha.forecast,
          linha.mechanic,
          linha.total,
          linha.paymentStatus,
        ]),
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ordens-de-servico.csv"');
      return res.send(
        '\uFEFF' +
          linhasTexto.map((linhaLocal) => linhaLocal.map(celulaCsv).join(';')).join('\r\n'),
      );
    } catch (erro) {
      console.error('[orders/export]', erro);
      return res.status(500).json({ message: 'Não foi possível exportar as ordens.' });
    }
  });

  app.patch('/api/orders/:id/status', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const corpo = z
      .object({
        status: z.enum([
          'aguardando',
          'em andamento',
          'aguardando peça',
          'pronto',
          'entregue',
          'cancelada',
        ]),
        observation: z.string().trim().max(500).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!id.success || !corpo.success)
      return res.status(400).json({ message: 'Status ou número da OS inválido.' });
    if (corpo.data.status === 'cancelada' && !corpo.data.observation?.trim())
      return res.status(422).json({ message: 'Informe o motivo do cancelamento.' });
    try {
      const { data: existente, error: lerErro } = await db
        .from('ordem_servico')
        .select('id_os,status')
        .eq('id_os', id.data)
        .maybeSingle();
      if (lerErro) throw lerErro;
      if (!existente) return res.status(404).json({ message: 'OS não encontrada.' });
      if (existente.status === corpo.data.status)
        return res.status(409).json({
          message: 'A OS já está nesse status. Escolha outro para registrar uma alteração.',
        });
      const { error: erro } = await db.rpc('alterar_status_os', {
        p_id_os: id.data,
        p_status: corpo.data.status,
        p_texto: corpo.data.observation ?? '',
        p_usuario: res.locals.adminUserId,
      });
      if (erro) throw erro;
      return res.json({ id: id.data, status: corpo.data.status });
    } catch (erro) {
      console.error('[orders/status]', erro);
      return res.status(500).json({ message: 'Não foi possível alterar o status da OS.' });
    }
  });

  app.get('/api/orders/:id/actions', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
    try {
      const { data: ordem, error: ordemErro } = await db
        .from('ordem_servico')
        .select('id_os,id_moto,status,problema_relatado,observacoes')
        .eq('id_os', id.data)
        .maybeSingle();
      if (ordemErro) throw ordemErro;
      if (!ordem) return res.status(404).json({ message: 'OS não encontrada.' });
      const { data: moto, error: motoErro } = await db
        .from('moto')
        .select('id_cliente,modelo,placa,ano,cor')
        .eq('id_moto', ordem.id_moto)
        .maybeSingle();
      if (motoErro || !moto) throw motoErro ?? new Error('Motocicleta não encontrada.');
      const { data: cliente, error: clienteErro } = await db
        .from('cliente')
        .select('nome,telefone,email,cpf')
        .eq('id_cliente', moto.id_cliente)
        .maybeSingle();
      if (clienteErro || !cliente) throw clienteErro ?? new Error('Cliente não encontrado.');
      return res.json({
        id: ordem.id_os,
        status: ordem.status,
        client: {
          name: cliente.nome,
          phone: cliente.telefone,
          email: cliente.email,
          cpf: cliente.cpf,
        },
        motorcycle: { model: moto.modelo, plate: moto.placa, year: moto.ano, color: moto.cor },
        problem: ordem.problema_relatado,
        observations: ordem.observacoes,
      });
    } catch (erro) {
      console.error('[orders/actions]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar as informações da OS.' });
    }
  });

  app.put('/api/orders/:id/actions', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const corpo = corrigirOrdemSchema.safeParse(req.body);
    if (!id.success || !corpo.success)
      return res.status(400).json({
        message: corpo.error?.issues.some((problema) => problema.path.join('.') === 'client.cpf')
          ? 'O CPF precisa ter 11 dígitos. Confira e tente novamente.'
          : 'Confira os campos da OS antes de salvar.',
      });
    const {
      client: cliente,
      motorcycle: motocicletaLocal,
      problem: problemaLocal,
      observations: observacoesLocal,
    } = corpo.data;
    try {
      const { data: existente, error: lerErro } = await db
        .from('ordem_servico')
        .select('id_os')
        .eq('id_os', id.data)
        .maybeSingle();
      if (lerErro) throw lerErro;
      if (!existente) return res.status(404).json({ message: 'OS não encontrada.' });
      const { error: erro } = await db.rpc('editar_os', {
        p_id_os: id.data,
        p_nome: cliente.name,
        p_telefone: cliente.phone,
        p_email: cliente.email,
        p_cpf: cliente.cpf
          ? cliente.cpf.replace(/\D/g, '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
          : '',
        p_modelo: formatarNomeModeloMoto(motocicletaLocal.model),
        p_placa: motocicletaLocal.plate.toUpperCase(),
        p_ano: motocicletaLocal.year,
        p_cor: motocicletaLocal.color,
        p_problema: problemaLocal,
        p_observacoes: observacoesLocal,
        p_usuario: res.locals.adminUserId,
      });
      if (erro?.code === '23505')
        return res
          .status(409)
          .json({ message: 'Essa placa já está cadastrada em outra motocicleta.' });
      if (erro) throw erro;
      void enfileirarModelo(db, formatarNomeModeloMoto(motocicletaLocal.model)).catch(
        (geracaoErro) => console.error('[motorcycle-image/edit]', geracaoErro),
      );
      return res.json({ ok: true });
    } catch (erro) {
      console.error('[orders/edit]', erro);
      return res.status(500).json({ message: 'Não foi possível salvar as informações da OS.' });
    }
  });

  app.delete('/api/orders/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    if (
      res.locals.acesso?.nivel !== 'superadministrador' &&
      res.locals.acesso?.nivel !== 'dono'
    )
      return res.status(403).json({
        message: 'Somente a dona ou um superadministrador pode excluir uma OS permanentemente.',
        code: 'PERMISSION_DENIED',
      });
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    const corpo = z
      .object({
        confirmId: z.number().int().positive(),
        reason: z.string().trim().max(500).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!id.success || !corpo.success || corpo.data.confirmId !== id.data)
      return res.status(400).json({ message: 'Confirme o número da OS para excluir.' });
    try {
      const { data: existente, error: lerErro } = await db
        .from('ordem_servico')
        .select('id_os')
        .eq('id_os', id.data)
        .maybeSingle();
      if (lerErro) throw lerErro;
      if (!existente) return res.status(404).json({ message: 'OS não encontrada.' });
      const { error: erro } = await db.rpc('excluir_os', {
        p_id_os: id.data,
        p_usuario: res.locals.adminUserId,
        p_motivo: corpo.data.reason ?? '',
      });
      if (erro) throw erro;
      return res.status(204).end();
    } catch (erro) {
      console.error('[orders/delete]', erro);
      return res.status(500).json({ message: 'Não foi possível excluir a OS.' });
    }
  });

  app.get('/api/orders/:id/history', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
    try {
      const { data: origemDados, error: origemDadosErro } = await db
        .from('ordem_servico')
        .select('id_moto')
        .eq('id_os', id.data)
        .maybeSingle();
      if (origemDadosErro) throw origemDadosErro;
      if (!origemDados) return res.status(404).json({ message: 'OS não encontrada.' });
      const [{ data: moto, error: motoErro }, { data: linhas, error: linhasErro }] =
        await Promise.all([
          db
            .from('moto')
            .select('id_moto,id_cliente,modelo,placa,ano,cor,foto,quilometragem')
            .eq('id_moto', origemDados.id_moto)
            .maybeSingle(),
          db
            .from('ordem_servico')
            .select(
              'id_os,id_mecanico,status,data_entrada,data_saida,quilometragem_entrada,quilometragem_saida,total,problema_relatado,observacoes',
            )
            .eq('id_moto', origemDados.id_moto)
            .order('data_entrada', { ascending: false })
            .limit(1000),
        ]);
      if (motoErro || linhasErro || !moto)
        throw new Error('Falha ao carregar histórico da motocicleta.');
      const os = linhas ?? [];
      const ids = os.map((linha) => linha.id_os);
      const mecanicoIds = [
        ...new Set(
          os.map((linha) => linha.id_mecanico).filter((valor): valor is number => valor != null),
        ),
      ];
      const [
        { data: cliente, error: clienteErro },
        { data: mecanicos, error: mecanicosErro },
        { data: servicos, error: servicosErro },
        { data: pecas, error: pecasErro },
        { data: pagamentos, error: pagamentosErro },
        { data: cancellationEventos, error: cancellationErro },
      ] = await Promise.all([
        db.from('cliente').select('nome').eq('id_cliente', moto.id_cliente).maybeSingle(),
        mecanicoIds.length
          ? db.from('funcionario').select('id_funcionario,nome').in('id_funcionario', mecanicoIds)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? db.from('os_servico').select('id_os,descricao,preco').in('id_os', ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? db.from('os_peca').select('id_os,nome_peca,quantidade,preco_unitario').in('id_os', ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? db.from('pagamento_os').select('id_os,status').in('id_os', ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? db
              .from('logs')
              .select('id_os,texto,criado_em')
              .eq('entidade', 'ordem_servico')
              .eq('tipo', 'status')
              .in('id_os', ids)
              .eq('novo', 'cancelada')
              .order('criado_em', { ascending: false })
              .order('id', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (
        clienteErro ||
        mecanicosErro ||
        servicosErro ||
        pecasErro ||
        pagamentosErro ||
        cancellationErro
      )
        throw new Error('Falha ao carregar itens do histórico.');
      const mecanicoNomes = new Map(
        (mecanicos ?? []).map((pessoa) => [pessoa.id_funcionario, pessoa.nome]),
      );
      const pagamentoEstados = new Map(
        (pagamentos ?? []).map((pagamento) => [pagamento.id_os, pagamento.status]),
      );
      const cancellationReasons = new Map<number, string | null>();
      for (const evento of cancellationEventos ?? [])
        if (!cancellationReasons.has(evento.id_os))
          cancellationReasons.set(evento.id_os, evento.texto?.trim() || null);
      const historico = os.map((linha) => ({
        id: linha.id_os,
        status: linha.status,
        entry: linha.data_entrada,
        exit: linha.data_saida,
        problem: linha.problema_relatado,
        observations: linha.observacoes,
        cancellationReason:
          linha.status === 'cancelada' ? (cancellationReasons.get(linha.id_os) ?? null) : null,
        kmEntry: linha.quilometragem_entrada,
        kmExit: linha.quilometragem_saida,
        mechanic: linha.id_mecanico
          ? (mecanicoNomes.get(linha.id_mecanico) ?? 'Não informado')
          : 'Não atribuído',
        paymentStatus: pagamentoEstados.get(linha.id_os) === 'pago' ? 'pago' : 'pendente',
        services: (servicos ?? [])
          .filter((item) => item.id_os === linha.id_os)
          .map((item) => ({ description: item.descricao, price: Number(item.preco) })),
        parts: (pecas ?? [])
          .filter((item) => item.id_os === linha.id_os)
          .map((item) => ({
            name: item.nome_peca,
            quantity: Number(item.quantidade),
            unitPrice: Number(item.preco_unitario),
          })),
        total: linha.total == null ? null : Number(linha.total),
      }));
      const parteTotals = new Map<string, { name: string; quantity: number; total: number }>();
      for (const parte of pecas ?? []) {
        const chave = parte.nome_peca.trim().toLocaleLowerCase('pt-BR');
        const item = parteTotals.get(chave) ?? { name: parte.nome_peca, quantity: 0, total: 0 };
        item.quantity += Number(parte.quantidade);
        item.total += Number(parte.quantidade) * Number(parte.preco_unitario);
        parteTotals.set(chave, item);
      }
      const km = os
        .map((linha) => linha.quilometragem_saida ?? linha.quilometragem_entrada)
        .filter((valor): valor is number => valor != null);
      return res.json({
        motorcycle: {
          id: moto.id_moto,
          model: moto.modelo,
          plate: moto.placa,
          year: moto.ano,
          color: moto.cor,
          photo: moto.foto,
          km: Math.max(0, Number(moto.quilometragem ?? 0), ...km),
          client: cliente?.nome ?? 'Cliente não encontrado',
        },
        summary: {
          total: historico.length,
          completed: historico.filter((linha) => linha.status === 'entregue').length,
          inProgress: historico.filter((linha) => linha.status === 'em andamento').length,
          cancelled: historico.filter((linha) => linha.status === 'cancelada').length,
          waitingParts: historico.filter((linha) => linha.status === 'aguardando peça').length,
          open: historico.filter((linha) => linha.status === 'aguardando').length,
          services: (servicos ?? []).length,
          parts: (pecas ?? []).reduce((soma, item) => soma + Number(item.quantidade), 0),
          spent: historico.reduce(
            (soma, linha) =>
              soma +
              (linha.total ??
                linha.services.reduce((numero, item) => numero + item.price, 0) +
                  linha.parts.reduce((numero, item) => numero + item.quantity * item.unitPrice, 0)),
            0,
          ),
        },
        mostUsedParts: [...parteTotals.values()].sort(
          (primeiroElemento, segundoElemento) =>
            segundoElemento.quantity - primeiroElemento.quantity ||
            segundoElemento.total - primeiroElemento.total,
        ),
        orders: historico,
      });
    } catch (erro) {
      console.error('[orders/history]', erro);
      return res
        .status(500)
        .json({ message: 'Não foi possível carregar o histórico da motocicleta.' });
    }
  });

  app.get('/api/orders/:id', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
    try {
      const { data: ordem, error: ordemErro } = await db
        .from('ordem_servico')
        .select(
          'id_os,id_moto,id_mecanico,status,data_entrada,data_saida,previsao_entrega,quilometragem_entrada,quilometragem_saida,total,problema_relatado,observacoes',
        )
        .eq('id_os', id.data)
        .maybeSingle();
      if (ordemErro) throw ordemErro;
      if (!ordem) return res.status(404).json({ message: 'OS não encontrada.' });
      const [
        { data: moto, error: motoErro },
        { data: mecanico, error: mecanicoErro },
        { data: servicos, error: servicosErro },
        { data: pecas, error: pecasErro },
        { data: fotos, error: fotosErro },
        { data: pagamento, error: pagamentoErro },
        { data: situacaoEventos, error: situacaoErro },
        { data: administradorEventos, error: auditErro },
      ] = await Promise.all([
        db
          .from('moto')
          .select('id_cliente,modelo,placa,ano,cor,foto')
          .eq('id_moto', ordem.id_moto)
          .maybeSingle(),
        ordem.id_mecanico
          ? db
              .from('funcionario')
              .select('nome')
              .eq('id_funcionario', ordem.id_mecanico)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        db.from('os_servico').select('descricao,preco').eq('id_os', id.data),
        db.from('os_peca').select('nome_peca,quantidade,preco_unitario').eq('id_os', id.data),
        db
          .from('foto_os')
          .select('id_foto,tipo,url,data_registro')
          .eq('id_os', id.data)
          .eq('tipo', 'entrada')
          .order('data_registro', { ascending: true }),
        db.from('pagamento_os').select('status').eq('id_os', id.data).maybeSingle(),
        db
          .from('logs')
          .select('id,anterior,novo,criado_em,id_usuario,texto')
          .eq('entidade', 'ordem_servico')
          .eq('id_os', id.data)
          .eq('tipo', 'status')
          .order('criado_em', { ascending: false })
          .order('id', { ascending: false })
          .limit(200),
        db
          .from('logs')
          .select('id,tipo,id_usuario,criado_em,dados')
          .eq('entidade', 'ordem_servico')
          .eq('id_os', id.data)
          .eq('tipo', 'edicao')
          .order('criado_em', { ascending: false })
          .order('id', { ascending: false })
          .limit(200),
      ]);
      if (
        motoErro ||
        mecanicoErro ||
        servicosErro ||
        pecasErro ||
        fotosErro ||
        pagamentoErro ||
        situacaoErro ||
        auditErro
      )
        throw new Error('Falha ao carregar dados relacionados à OS.');
      const { data: cliente, error: clienteErro } = moto
        ? await db
            .from('cliente')
            .select('nome,telefone,email,foto')
            .eq('id_cliente', moto.id_cliente)
            .maybeSingle()
        : { data: null, error: null };
      if (clienteErro) throw clienteErro;
      const autorIds = [
        ...new Set(
          [
            ...(situacaoEventos ?? []).map((evento) => evento.id_usuario),
            ...(administradorEventos ?? []).map((evento) => evento.id_usuario),
          ].filter((valor): valor is string => !!valor),
        ),
      ];
      const { data: autores, error: autorErro } = autorIds.length
        ? await db.from('funcionario').select('auth_user_id,nome').in('auth_user_id', autorIds)
        : { data: [], error: null };
      if (autorErro) throw autorErro;
      const autorNomes = new Map((autores ?? []).map((autor) => [autor.auth_user_id, autor.nome]));
      const movimentacoes = [
        ...(situacaoEventos ?? []).map((evento) => ({
          id: `status-${evento.id}`,
          action: 'status',
          before: evento.anterior,
          after: evento.novo,
          note: evento.texto ?? null,
          actor:
            autorNomes.get(evento.id_usuario) ??
            (evento.id_usuario ? 'Usuário autenticado' : 'Sistema'),
          at: evento.criado_em,
        })),
        ...(administradorEventos ?? []).map((evento) => ({
          id: `edit-${evento.id}`,
          action: 'edicao',
          before: null,
          after: null,
          note: null,
          actor: autorNomes.get(evento.id_usuario) ?? 'Administrador',
          at: evento.criado_em,
        })),
      ].sort(
        (primeiroElemento, segundoElemento) =>
          Date.parse(segundoElemento.at) - Date.parse(primeiroElemento.at),
      );
      const servicoTotal = (servicos ?? []).reduce(
        (soma, item) => soma + Number(item.preco ?? 0),
        0,
      );
      const pecasTotal = (pecas ?? []).reduce(
        (soma, item) => soma + Number(item.quantidade) * Number(item.preco_unitario ?? 0),
        0,
      );
      return res.json({
        id: ordem.id_os,
        status: ordem.status,
        entry: ordem.data_entrada,
        exit: ordem.data_saida,
        forecast: ordem.previsao_entrega,
        lastUpdated: movimentacoes[0]?.at ?? ordem.data_saida ?? ordem.data_entrada,
        movements: movimentacoes,
        mechanic: mecanico?.nome ?? 'Não atribuído',
        total: ordem.total == null ? null : Number(ordem.total),
        problem: ordem.problema_relatado,
        observations: ordem.observacoes,
        cancellationReason:
          ordem.status === 'cancelada'
            ? (situacaoEventos?.find((evento) => evento.novo === 'cancelada')?.texto?.trim() ??
              null)
            : null,
        client: {
          name: cliente?.nome ?? 'Cliente não encontrado',
          phone: cliente?.telefone ?? null,
          email: cliente?.email ?? null,
          photo: cliente?.foto ?? null,
        },
        motorcycle: {
          model: moto?.modelo ?? 'Motocicleta não encontrada',
          plate: moto?.placa ?? null,
          year: moto?.ano ?? null,
          color: moto?.cor ?? null,
          photo: moto?.foto ?? null,
          kmEntry: ordem.quilometragem_entrada,
          kmExit: ordem.quilometragem_saida,
        },
        services: (servicos ?? []).map((item) => ({
          description: item.descricao,
          price: Number(item.preco),
        })),
        parts: (pecas ?? []).map((item) => ({
          name: item.nome_peca,
          quantity: item.quantidade,
          unitPrice: Number(item.preco_unitario),
        })),
        photos: (fotos ?? []).map((item) => ({
          id: item.id_foto,
          url: item.url,
          recordedAt: item.data_registro,
        })),
        serviceTotal: servicoTotal,
        partsTotal: pecasTotal,
        paymentStatus: pagamento?.status === 'pago' ? 'pago' : 'pendente',
      });
    } catch (erro) {
      console.error('[orders/dados]', erro);
      return res.status(500).json({ message: 'Não foi possível carregar os detalhes da OS.' });
    }
  });

  app.get('/api/orders/:id/observation-history', async (req, res) => {
    const db = await autorizarAcessoBanco(req, res);
    if (!db) return;
    const id = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Número da OS inválido.' });
    try {
      const { data: ordem, error: ordemErro } = await db
        .from('ordem_servico')
        .select('id_os')
        .eq('id_os', id.data)
        .maybeSingle();
      if (ordemErro) throw ordemErro;
      if (!ordem) return res.status(404).json({ message: 'OS não encontrada.' });
      const { data: eventos, error: erro } = await db
        .from('logs')
        .select('id,tipo,texto,id_usuario,criado_em,anterior,novo')
        .eq('entidade', 'ordem_servico')
        .eq('id_os', id.data)
        .in('tipo', ['observacao_anterior', 'nota_status', 'status'])
        .not('texto', 'is', null)
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false })
        .limit(200);
      if (erro) throw erro;
      const autores = [
        ...new Set(
          (eventos ?? [])
            .map((eventoRecebido) => eventoRecebido.id_usuario)
            .filter((valorAtual): valorAtual is string => !!valorAtual),
        ),
      ];
      const { data: perfis, error: perfilErro } = autores.length
        ? await db.from('funcionario').select('auth_user_id,nome').in('auth_user_id', autores)
        : { data: [], error: null };
      if (perfilErro) throw perfilErro;
      const nomes = new Map(
        (perfis ?? []).map((registroAtual) => [registroAtual.auth_user_id, registroAtual.nome]),
      );
      const registros = (eventos ?? [])
        .filter((eventoRecebido) => eventoRecebido.texto?.trim())
        .map((eventoRecebido) => ({
          id: String(eventoRecebido.id),
          kind: eventoRecebido.tipo === 'status' ? 'nota_status' : eventoRecebido.tipo,
          body: eventoRecebido.texto!,
          at: eventoRecebido.criado_em,
          actor:
            nomes.get(eventoRecebido.id_usuario) ??
            (eventoRecebido.id_usuario ? 'Usuário autenticado' : 'Sistema'),
          context:
            eventoRecebido.tipo === 'status'
              ? `${eventoRecebido.anterior} → ${eventoRecebido.novo}`
              : null,
        }));
      return res.json({ entries: registros });
    } catch (erro) {
      console.error('[orders/observation-history]', erro);
      return res.status(503).json({ message: 'Não foi possível carregar o histórico.' });
    }
  });
}
