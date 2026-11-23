import type { SupabaseClient } from '@supabase/supabase-js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { cifrarSenhaFuncionario } from './services/senhaSolicitacaoFuncionario.js';

type Ordem = {
  id_os: number;
  id_mecanico: number | null;
  id_moto: number;
  status: string;
  data_entrada: string;
  data_saida: string | null;
  previsao_entrega: string | null;
  total: number | null;
};
type Pessoa = {
  id_funcionario: number;
  nome: string;
  cargo: string;
  cpf: string;
  email: string | null;
  telefone: string | null;
  auth_user_id: string | null;
  data_nascimento?: string | null;
  data_admissao?: string | null;
  departamento?: string | null;
  especialidade?: string | null;
  endereco?: string | null;
  situacao?: string | null;
};
const concluidas = new Set(['pronto', 'entregue']);
const abertas = new Set(['aguardando', 'em andamento']);
const mesAtual = () =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .slice(0, 7);
const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const idSchema = z.coerce.number().int().positive();

async function lerPaginas<T>(
  db: SupabaseClient,
  tabela: string,
  colunas: string,
  chave: string,
  filtro?: { coluna: string; valor: number },
): Promise<T[]> {
  const resultado: T[] = [];
  for (let inicio = 0; ; inicio += 500) {
    let consulta = db
      .from(tabela)
      .select(colunas)
      .order(chave)
      .range(inicio, inicio + 499);
    if (filtro) consulta = consulta.eq(filtro.coluna, filtro.valor);
    const { data: dadosLocal, error: erro } = await consulta;
    if (erro) throw erro;
    resultado.push(...((dadosLocal ?? []) as T[]));
    if (!dadosLocal || dadosLocal.length < 500) return resultado;
  }
}
export function resumoFuncionario(ordens: Ordem[], mes: string) {
  const periodo = ordens.filter((objetoAtual) => objetoAtual.data_entrada.slice(0, 7) === mes);
  const feitas = periodo.filter((objetoAtual) => concluidas.has(objetoAtual.status)).length;
  return {
    total: periodo.length,
    concluidas: feitas,
    abertas: periodo.filter((objetoAtual) => abertas.has(objetoAtual.status)).length,
    pecas: periodo.filter((objetoAtual) => objetoAtual.status === 'aguardando peça').length,
    canceladas: periodo.filter((objetoAtual) => objetoAtual.status === 'cancelada').length,
    taxa: periodo.length ? Math.round((feitas / periodo.length) * 100) : 0,
    totalConcluidas: ordens.filter((objetoAtual) => concluidas.has(objetoAtual.status)).length,
    totalAbertas: ordens.filter(
      (objetoAtual) => abertas.has(objetoAtual.status) || objetoAtual.status === 'aguardando peça',
    ).length,
  };
}
const colunasOrdem =
  'id_os,id_mecanico,id_moto,status,data_entrada,data_saida,previsao_entrega,total';
const camposExtras = [
  'data_nascimento',
  'data_admissao',
  'departamento',
  'especialidade',
  'endereco',
  'situacao',
];
const permissao = (linha: Pessoa) =>
  camposExtras.every((elementoAtual) => Object.hasOwn(linha, elementoAtual));
const conta = (linha: Pessoa) => ({
  id: linha.id_funcionario,
  nome: linha.nome,
  cargo: linha.cargo,
  email: linha.email,
  telefone: linha.telefone,
  departamento: linha.departamento ?? null,
  situacao: linha.situacao ?? 'nao_informado',
  admissao: linha.data_admissao ?? null,
  temConta: !!linha.auth_user_id,
});
const administradorCargo = (valorLocal: string | null | undefined) =>
  (valorLocal ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() === 'administrador';
const estaBloqueado = (usuario: { banned_until?: string | null } | null | undefined) => {
  const bloqueadoAte = Date.parse(usuario?.banned_until ?? '');
  return Number.isFinite(bloqueadoAte) && bloqueadoAte > Date.now();
};

export function rotasFuncionarios(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const roteador = Router();
  roteador.use(async (req, res, next) => {
    try {
      const db = await autorizar(req, res);
      if (!db) return;
      res.locals.funcionariosDb = db;
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    } catch (erro) {
      next(erro);
    }
  });
  const db = (res: Response) => res.locals.funcionariosDb as SupabaseClient;
  const texto = (maximo: number) => z.string().trim().max(maximo);
  const dadosLocal = z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
    .refine((valorAtual) => {
      if (!valorAtual) return true;
      const dadosAtual = new Date(`${valorAtual}T12:00:00Z`);
      return (
        Number.isFinite(dadosAtual.getTime()) &&
        dadosAtual.toISOString().slice(0, 10) === valorAtual
      );
    });
  roteador.post('/', async (req, res, next) => {
    try {
      const corpo = z
        .object({
          nome: texto(100).min(2),
          email: z.email().max(150),
          telefone: texto(20).refine((valorAtual) => valorAtual.replace(/\D/g, '').length >= 10),
          cpf: texto(14).refine((valorAtual) => valorAtual.replace(/\D/g, '').length === 11),
          senha: z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^\w\s]/).optional(),
          confirmarSenha: z.string().max(128).optional(),
          cargo: z.enum(['Administrador', 'Mecânico', 'Atendente']),
          data_nascimento: dadosLocal,
          data_admissao: dadosLocal,
          departamento: texto(100),
          especialidade: texto(150),
          endereco: texto(300),
          cep: texto(12),
          complemento: texto(120),
          tipo_contrato: texto(40),
          duracao_contrato_meses: z.number().int().min(1).max(120).nullable().optional().default(null),
          comissao_servico: z.number().min(0).max(100).nullable(),
          observacoes_profissionais: texto(2000),
          situacao: z.enum(['ativo', 'ferias', 'afastado', 'desligado']),
          telefone_secundario: texto(20).refine((valor) => !valor || valor.replace(/\D/g, '').length >= 10).default(''),
          contato_emergencia: texto(100).default(''),
          parentesco_emergencia: texto(60).default(''),
          telefone_emergencia: texto(20).refine((valor) => !valor || valor.replace(/\D/g, '').length >= 10).default(''),
          foto: z.string().max(740000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).optional(),
        })
        .strict()
        .superRefine((dados, contexto) => {
          if (dados.tipo_contrato === 'Temporário' && !dados.duracao_contrato_meses)
            contexto.addIssue({ code: 'custom', path: ['duracao_contrato_meses'], message: 'Informe a duração do contrato temporário.' });
          if (dados.senha && dados.confirmarSenha !== undefined && dados.senha !== dados.confirmarSenha)
            contexto.addIssue({ code: 'custom', path: ['confirmarSenha'], message: 'As senhas não coincidem.' });
          if (!dados.senha)
            contexto.addIssue({ code: 'custom', path: ['senha'], message: 'Defina uma senha para o acesso.' });
        })
        .safeParse(req.body);
      if (!corpo.success)
        return res.status(400).json({ message: 'Confira os dados do funcionário.' });
      const registroAtual = corpo.data;
      const administradorBanco = db(res);
      const [{ data: porEmail, error: emailErro }, { data: porCpf, error: cpfErro }] =
        await Promise.all([
          administradorBanco
            .from('funcionario')
            .select('id_funcionario')
            .ilike('email', registroAtual.email)
            .limit(1),
          administradorBanco
            .from('funcionario')
            .select('id_funcionario')
            .eq('cpf', registroAtual.cpf.replace(/\D/g, ''))
            .limit(1),
        ]);
      if (emailErro || cpfErro) throw emailErro ?? cpfErro;
      if (porEmail?.length || porCpf?.length)
        return res
          .status(409)
          .json({ message: 'Este CPF ou e-mail já pertence a outro funcionário.' });
      const email = registroAtual.email.trim().toLowerCase();
      const { foto, senha, ...dados } = registroAtual;
      delete (dados as typeof dados & { confirmarSenha?: string }).confirmarSenha;
      const eSuperadministrador = res.locals.acesso?.nivel === 'superadministrador' || res.locals.acesso?.nivel === 'dono';
      if (!eSuperadministrador) {
        const { data: pedido, error: erroPedido } = await administradorBanco
          .from('funcionario_solicitacao')
          .insert({ payload: { ...dados, email, ...cifrarSenhaFuncionario(senha ?? ''), ...(foto ? { foto } : {}) }, solicitado_por: res.locals.adminUserId })
          .select('id')
          .single();
        if (erroPedido?.code === '23505') return res.status(409).json({ message: 'Já existe uma solicitação pendente para este CPF ou e-mail.' });
        if (erroPedido) throw erroPedido;
        return res.status(201).json({ id: pedido.id, approvalPending: true });
      }
      const conviteOuConta = await administradorBanco.auth.admin.createUser({ email, password: senha!, email_confirm: true, user_metadata: { name: registroAtual.nome.trim() } });
      const autenticacao = conviteOuConta.data;
      const autenticacaoErro = conviteOuConta.error;
      if (autenticacaoErro || !autenticacao.user) return res.status(409).json({ message: 'Não foi possível enviar o convite. Confira se este e-mail já está em uso.' });
      const { data: cadastro, error: erro } = await administradorBanco.rpc(
        'registrar_funcionario_com_contato',
        {
          p_actor: res.locals.adminUserId,
          p_payload: {
            ...dados,
            cpf: registroAtual.cpf.replace(/\D/g, ''),
            email,
            id_usuario_autenticacao: autenticacao.user.id,
          },
        },
      );
      if (erro) {
        const { error: limpezaErro } = await administradorBanco.auth.admin.deleteUser(
          autenticacao.user.id,
        );
        if (limpezaErro)
          return res.status(500).json({
            message:
              'A conta de acesso foi criada, mas o cadastro falhou. Contate o administrador antes de tentar novamente.',
          });
        if (erro.code === '23505')
          return res
            .status(409)
            .json({ message: 'Este CPF ou e-mail já pertence a outro funcionário.' });
        throw erro;
      }
      if (foto && cadastro?.id) {
        const { data: funcionario } = await administradorBanco.from('funcionario').select('auth_user_id').eq('id_funcionario', cadastro.id).maybeSingle();
        if (funcionario?.auth_user_id) {
          const bytes = Buffer.from(foto.split(',')[1], 'base64');
          if (bytes.length <= 550000 && bytes[0] === 255 && bytes[1] === 216) {
            await administradorBanco.storage.from('admin-avatars').upload(`admins/${funcionario.auth_user_id}/avatar.jpg`, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' });
          }
        }
      }
      return res.status(201).json(cadastro);
    } catch (erro) {
      next(erro);
    }
  });
  roteador.get('/options', async (_req, res, next) => {
    try {
      const { data: dadosLocal, error: erro } = await db(res)
        .from('funcionario')
        .select('nome,cargo,departamento,situacao')
        .eq('situacao', 'ativo')
        .order('nome');
      if (erro) throw erro;
      res.json({
        itens: (dadosLocal ?? []).filter(
          (registroAtual) =>
            (registroAtual.cargo ?? '')
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase() === 'mecanico',
        ),
      });
    } catch (erroCapturado) {
      next(erroCapturado);
    }
  });
  roteador.get('/', async (req, res, next) => {
    try {
      const mes = mesSchema.safeParse(req.query.mes ?? mesAtual());
      if (!mes.success) return res.status(400).json({ message: 'Mês inválido.' });
      const [pessoas, ordens] = await Promise.all([
        lerPaginas<Pessoa>(db(res), 'funcionario', '*', 'id_funcionario'),
        lerPaginas<Ordem>(db(res), 'ordem_servico', colunasOrdem, 'id_os'),
      ]);
      const porPessoa = new Map<number, Ordem[]>();
      for (const objetoAtual of ordens)
        if (objetoAtual.id_mecanico != null) {
          const grupo = porPessoa.get(objetoAtual.id_mecanico) ?? [];
          grupo.push(objetoAtual);
          porPessoa.set(objetoAtual.id_mecanico, grupo);
        }
      return res.json({
        mes: mes.data,
        itens: pessoas.map((registroAtual) => ({
          ...conta(registroAtual),
          resumo: resumoFuncionario(porPessoa.get(registroAtual.id_funcionario) ?? [], mes.data),
        })),
        camposExtras: pessoas.length ? permissao(pessoas[0]) : true,
      });
    } catch (erro) {
      next(erro);
    }
  });
  roteador.get('/:id/photo', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      if (!id.success) return res.status(400).end();
      const { data: dadosLocal, error: erro } = await db(res)
        .from('funcionario')
        .select('auth_user_id')
        .eq('id_funcionario', id.data)
        .maybeSingle();
      if (erro) throw erro;
      if (!dadosLocal?.auth_user_id) return res.status(404).end();
      const foto = await db(res)
        .storage.from('admin-avatars')
        .download(`admins/${dadosLocal.auth_user_id}/avatar.jpg`);
      if (foto.error || !foto.data) return res.status(404).end();
      res.setHeader('Cache-Control', 'private, max-age=120');
      res.setHeader('Vary', 'Cookie');
      return res.type('image/jpeg').send(Buffer.from(await foto.data.arrayBuffer()));
    } catch (erro) {
      next(erro);
    }
  });
  roteador.get('/:id', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const mes = mesSchema.safeParse(req.query.mes ?? mesAtual());
      if (!id.success || !mes.success)
        return res.status(400).json({ message: 'Funcionário ou mês inválido.' });
      const { data: registroAtual, error: erro } = await db(res)
        .from('funcionario')
        .select('*')
        .eq('id_funcionario', id.data)
        .maybeSingle();
      if (erro) throw erro;
      if (!registroAtual) return res.status(404).json({ message: 'Funcionário não encontrado.' });
      let acessoBloqueado = false;
      if (registroAtual.auth_user_id) {
        const { data: autenticacao, error: autenticacaoErro } = await db(
          res,
        ).auth.admin.getUserById(registroAtual.auth_user_id);
        if (autenticacaoErro) throw autenticacaoErro;
        acessoBloqueado = estaBloqueado(
          autenticacao.user as typeof autenticacao.user & { banned_until?: string | null },
        );
      }
      const ordens = await lerPaginas<Ordem>(db(res), 'ordem_servico', colunasOrdem, 'id_os', {
        coluna: 'id_mecanico',
        valor: id.data,
      });
      const ids = ordens.map((objetoAtual) => objetoAtual.id_os);
      const motosIds = [...new Set(ordens.map((objetoAtual) => objetoAtual.id_moto))];
      // Consultas em lotes: nenhuma requisicao por linha da tabela.
      const motos = [] as {
        id_moto: number;
        id_cliente: number;
        modelo: string;
        placa: string;
        ano: number;
      }[];
      const servicos = [] as { id_os: number; descricao: string; preco: number }[];
      for (let indice = 0; indice < Math.max(ids.length, motosIds.length); indice += 200) {
        const [consultaMotocicletas, consultaServicos] = await Promise.all([
          motosIds.slice(indice, indice + 200).length
            ? db(res)
                .from('moto')
                .select('id_moto,id_cliente,modelo,placa,ano')
                .in('id_moto', motosIds.slice(indice, indice + 200))
            : Promise.resolve({ data: [], error: null }),
          ids.slice(indice, indice + 200).length
            ? db(res)
                .from('os_servico')
                .select('id_os,descricao,preco')
                .in('id_os', ids.slice(indice, indice + 200))
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (consultaMotocicletas.error || consultaServicos.error)
          throw consultaMotocicletas.error ?? consultaServicos.error;
        motos.push(...(consultaMotocicletas.data ?? []));
        servicos.push(...(consultaServicos.data ?? []));
      }
      const clientesIds = [...new Set(motos.map((motocicleta) => motocicleta.id_cliente))];
      const clientes = [] as { id_cliente: number; nome: string }[];
      for (let indice = 0; indice < clientesIds.length; indice += 200) {
        const resultadoAtual = await db(res)
          .from('cliente')
          .select('id_cliente,nome')
          .in('id_cliente', clientesIds.slice(indice, indice + 200));
        if (resultadoAtual.error) throw resultadoAtual.error;
        clientes.push(...(resultadoAtual.data ?? []));
      }
      const documentos = permissao(registroAtual)
        ? await db(res)
            .from('funcionario_documento')
            .select('id,tipo,numero,validade,criado_em')
            .eq('id_funcionario', id.data)
            .order('id', { ascending: false })
            .limit(100)
        : { data: [], error: null };
      if (documentos.error) throw documentos.error;
      const mapaMotos = new Map(motos.map((motocicleta) => [motocicleta.id_moto, motocicleta]));
      const clienteMapa = new Map(
        clientes.map((elementoAtual) => [elementoAtual.id_cliente, elementoAtual.nome]),
      );
      const servicoMapa = new Map<number, typeof servicos>();
      for (const consultaServicos of servicos) {
        const linhas = servicoMapa.get(consultaServicos.id_os) ?? [];
        linhas.push(consultaServicos);
        servicoMapa.set(consultaServicos.id_os, linhas);
      }
      const serie = [];
      for (let indice = 5; indice >= 0; indice--) {
        const mesReferencia = new Date(`${mes.data}-15T12:00:00Z`);
        mesReferencia.setUTCMonth(mesReferencia.getUTCMonth() - indice);
        const chaveLocal = mesReferencia.toISOString().slice(0, 7);
        serie.push({ mes: chaveLocal, ...resumoFuncionario(ordens, chaveLocal) });
      }
      return res.json({
        pessoa: {
          ...conta(registroAtual),
          acessoBloqueado,
          cpf: registroAtual.cpf,
          nascimento: registroAtual.data_nascimento ?? null,
          especialidade: registroAtual.especialidade ?? null,
          endereco: registroAtual.endereco ?? null,
        },
        mes: mes.data,
        camposExtras: permissao(registroAtual),
        resumo: { ...resumoFuncionario(ordens, mes.data), clientes: clientes.length },
        series: serie,
        ordens: ordens
          .filter((objetoAtual) => objetoAtual.data_entrada.slice(0, 7) === mes.data)
          .sort(
            (primeiroElemento, segundoElemento) =>
              segundoElemento.data_entrada.localeCompare(primeiroElemento.data_entrada) ||
              segundoElemento.id_os - primeiroElemento.id_os,
          )
          .map((objetoAtual) => {
            const moto = mapaMotos.get(objetoAtual.id_moto);
            const itens = servicoMapa.get(objetoAtual.id_os) ?? [];
            return {
              id: objetoAtual.id_os,
              entrada: objetoAtual.data_entrada,
              saida: objetoAtual.data_saida,
              previsao: objetoAtual.previsao_entrega,
              status: objetoAtual.status,
              cliente: moto
                ? (clienteMapa.get(moto.id_cliente) ?? 'Não informado')
                : 'Não informado',
              veiculo: moto?.modelo ?? 'Não informado',
              placa: moto?.placa ?? null,
              ano: moto?.ano ?? null,
              servico:
                itens.map((consultaServicos) => consultaServicos.descricao).join(', ') ||
                'Não informado',
              maoDeObra: itens.length
                ? itens.reduce(
                    (numeroLocal, consultaServicos) => numeroLocal + Number(consultaServicos.preco),
                    0,
                  )
                : null,
            };
          }),
        documentos: documentos.data ?? [],
      });
    } catch (erro) {
      next(erro);
    }
  });
  roteador.patch('/:id/access', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const corpo = z.object({ bloqueado: z.boolean() }).strict().safeParse(req.body);
      if (!id.success || !corpo.success)
        return res
          .status(400)
          .json({ message: 'Não foi possível identificar a alteração de acesso.' });
      const { data: registroAtual, error: erro } = await db(res)
        .from('funcionario')
        .select('id_funcionario,nome,cargo,auth_user_id')
        .eq('id_funcionario', id.data)
        .maybeSingle();
      if (erro) throw erro;
      if (!registroAtual) return res.status(404).json({ message: 'Funcionário não encontrado.' });
      if (!registroAtual.auth_user_id)
        return res
          .status(422)
          .json({ message: 'Este funcionário ainda não tem uma conta de acesso vinculada.' });
      const autorId = String(res.locals.adminUserId ?? '');
      if (corpo.data.bloqueado && registroAtual.auth_user_id === autorId)
        return res
          .status(409)
          .json({ message: 'Por segurança, você não pode bloquear a própria conta.' });
      const { data: autenticacao, error: autenticacaoErro } = await db(res).auth.admin.getUserById(
        registroAtual.auth_user_id,
      );
      if (autenticacaoErro) throw autenticacaoErro;
      const currentlyBloqueado = estaBloqueado(
        autenticacao.user as typeof autenticacao.user & { banned_until?: string | null },
      );
      if (currentlyBloqueado === corpo.data.bloqueado)
        return res.json({ ok: true, bloqueado: currentlyBloqueado });
      if (corpo.data.bloqueado && administradorCargo(registroAtual.cargo)) {
        const { data: administradores, error: administradoresErro } = await db(res)
          .from('funcionario')
          .select('auth_user_id,cargo,perfil_acesso')
          .not('auth_user_id', 'is', null);
        if (administradoresErro) throw administradoresErro;
        const ativoAdministradores = await Promise.all(
          (administradores ?? [])
            .filter(
              (linha) => administradorCargo(linha.cargo) && administradorCargo(linha.perfil_acesso),
            )
            .map(async (linha) => {
              if (!linha.auth_user_id) return false;
              const { data: administradorAutenticacao, error: administradorAutenticacaoErro } =
                await db(res).auth.admin.getUserById(linha.auth_user_id);
              if (administradorAutenticacaoErro) throw administradorAutenticacaoErro;
              return !estaBloqueado(
                administradorAutenticacao.user as typeof administradorAutenticacao.user & {
                  banned_until?: string | null;
                },
              );
            }),
        );
        if (ativoAdministradores.filter(Boolean).length <= 1)
          return res
            .status(409)
            .json({ message: 'Não é possível bloquear o último administrador com acesso ativo.' });
      }
      const { data: atualizado, error: atualizarErro } = await db(res).auth.admin.updateUserById(
        registroAtual.auth_user_id,
        {
          ban_duration: corpo.data.bloqueado ? '876000h' : 'none',
        },
      );
      if (atualizarErro) throw atualizarErro;
      const bloqueadoLocal = estaBloqueado(
        atualizado.user as typeof atualizado.user & { banned_until?: string | null },
      );
      return res.json({ ok: true, bloqueado: bloqueadoLocal });
    } catch (erro) {
      next(erro);
    }
  });
  roteador.patch('/:id/password', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const corpo = z
        .object({
          password: z
            .string()
            .min(8)
            .max(128)
            .regex(/[A-Z]/)
            .regex(/[a-z]/)
            .regex(/\d/)
            .regex(/[^\w\s]/),
        })
        .strict()
        .safeParse(req.body);
      if (!id.success) return res.status(400).json({ message: 'Funcionário inválido.' });
      if (!corpo.success)
        return res.status(400).json({
          message: 'Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.',
        });
      const { data: funcionario, error: erro } = await db(res)
        .from('funcionario')
        .select('nome,auth_user_id')
        .eq('id_funcionario', id.data)
        .maybeSingle();
      if (erro) throw erro;
      if (!funcionario) return res.status(404).json({ message: 'Funcionário não encontrado.' });
      if (!funcionario.auth_user_id)
        return res
          .status(422)
          .json({ message: 'Este funcionário ainda não possui uma conta vinculada.' });
      if (funcionario.auth_user_id === String(res.locals.adminUserId ?? ''))
        return res.status(409).json({
          message: 'Para alterar sua própria senha, use a opção de segurança do seu perfil.',
        });
      const { error: atualizarErro } = await db(res).auth.admin.updateUserById(
        funcionario.auth_user_id,
        { password: corpo.data.password },
      );
      if (atualizarErro)
        return res.status(400).json({
          message: 'O Supabase não aceitou a nova senha. Confira os requisitos e tente novamente.',
        });
      return res.json({ ok: true });
    } catch (erro) {
      next(erro);
    }
  });
  const dadosEdicao = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((valorAtual) => {
      const dadosAtual = new Date(`${valorAtual}T12:00:00Z`);
      return (
        Number.isFinite(dadosAtual.getTime()) &&
        dadosAtual.toISOString().slice(0, 10) === valorAtual
      );
    })
    .or(z.literal(''));
  roteador.patch('/:id', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const corpo = z
        .object({
          nome: texto(100).min(2),
          cargo: z.enum(['Administrador', 'Gerente', 'Mecânico', 'Atendente', 'Cliente']),
          telefone: texto(20).refine(
            (valorAtual) => !valorAtual || valorAtual.replace(/\D/g, '').length >= 10,
          ),
          cpf: texto(14).refine((valorAtual) => valorAtual.replace(/\D/g, '').length === 11),
          nascimento: dadosEdicao,
          admissao: dadosEdicao,
          departamento: texto(100),
          especialidade: texto(150),
          endereco: texto(500),
          situacao: z.enum(['ativo', 'ferias', 'afastado', 'desligado', 'nao_informado']),
        })
        .strict()
        .safeParse(req.body);
      if (!id.success || !corpo.success)
        return res.status(400).json({ message: 'Confira os campos e as datas informadas.' });
      const registroAtual = corpo.data;
      const { data: atualizado, error: erro } = await db(res).rpc('admin_update_employee', {
        p_id: id.data,
        p_payload: { ...registroAtual, cpf: registroAtual.cpf.replace(/\D/g, '') },
        p_actor: res.locals.adminUserId,
      });
      if (erro?.code === '23505')
        return res.status(409).json({ message: 'Este CPF já pertence a outro funcionário.' });
      if (erro) {
        const mensagem = String(erro.message ?? '');
        if (mensagem.includes('próprio acesso') || mensagem.includes('único administrador'))
          return res.status(409).json({ message: mensagem });
        throw erro;
      }
      return atualizado
        ? res.json({ ok: true })
        : res.status(404).json({ message: 'Funcionário não encontrado.' });
    } catch (erro) {
      next(erro);
    }
  });
  roteador.post('/:id/photo', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const corpo = z
        .object({
          image: z
            .string()
            .max(740000)
            .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/),
        })
        .safeParse(req.body);
      if (!id.success || !corpo.success)
        return res.status(400).json({ message: 'Envie uma foto JPEG de até 500 KB.' });
      const { data: dadosLocal, error: erro } = await db(res)
        .from('funcionario')
        .select('auth_user_id')
        .eq('id_funcionario', id.data)
        .maybeSingle();
      if (erro) throw erro;
      if (!dadosLocal?.auth_user_id)
        return res
          .status(422)
          .json({ message: 'Vincule uma conta ao funcionário antes de alterar a foto.' });
      const bytes = Buffer.from(corpo.data.image.split(',')[1], 'base64');
      if (bytes.length > 550000 || bytes[0] !== 255 || bytes[1] !== 216)
        return res.status(400).json({ message: 'Foto JPEG inválida.' });
      const resultado = await db(res)
        .storage.from('admin-avatars')
        .upload(`admins/${dadosLocal.auth_user_id}/avatar.jpg`, bytes, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '0',
        });
      if (resultado.error) throw resultado.error;
      return res.json({ ok: true });
    } catch (erro) {
      next(erro);
    }
  });
  roteador.post('/:id/documentos', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const corpo = z
        .object({ tipo: texto(40).min(1), numero: texto(80).min(1), validade: dadosLocal })
        .strict()
        .safeParse(req.body);
      if (!id.success || !corpo.success)
        return res
          .status(400)
          .json({ message: 'Confira o tipo, o número e a validade do documento.' });
      const { error: erro } = await db(res)
        .from('funcionario_documento')
        .insert({ id_funcionario: id.data, ...corpo.data, validade: corpo.data.validade || null });
      if (erro) throw erro;
      return res.status(201).json({ ok: true });
    } catch (erro) {
      next(erro);
    }
  });
  roteador.delete('/:id/:tipo/:item', async (req, res, next) => {
    try {
      const id = idSchema.safeParse(req.params.id);
      const item = idSchema.safeParse(req.params.item);
      const tipo = z.literal('documentos').safeParse(req.params.tipo);
      if (!id.success || !item.success || !tipo.success)
        return res.status(400).json({ message: 'Registro inválido.' });
      const { data: dadosLocal, error: erro } = await db(res)
        .from('funcionario_documento')
        .delete()
        .eq('id_funcionario', id.data)
        .eq('id', item.data)
        .select('id');
      if (erro) throw erro;
      return dadosLocal?.length
        ? res.json({ ok: true })
        : res.status(404).json({ message: 'Registro não encontrado.' });
    } catch (erro) {
      next(erro);
    }
  });
  return roteador;
}
