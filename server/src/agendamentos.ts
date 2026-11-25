import type { SupabaseClient } from '@supabase/supabase-js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { permitir, type Acesso } from './cargos.js';

const id = z.number().int().positive();
const entradaAgendamento = z
  .object({
    clienteId: id,
    motoId: id,
    mecanicoId: id,
    servico: z.string().trim().min(1).max(150),
    status: z.enum(['Confirmado', 'Pendente', 'Concluído', 'Cancelado']),
    data: z.iso.date(),
    hora: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    duracao: z.string().trim().min(1).max(100),
    observacoes: z.string().max(3000),
  })
  .strict();

type LinhaAgendamento = {
  id_agendamento: number;
  id_cliente: number;
  id_moto: number;
  id_mecanico: number | null;
  data_hora: string;
  servico_solicitado: string;
  status: string;
  observacoes: string | null;
  duracao: string | null;
};
type Cliente = { id_cliente: number; nome: string; telefone: string | null };
type Moto = {
  id_moto: number;
  id_cliente: number;
  modelo: string;
  placa: string | null;
  foto?: string | null;
};
type Funcionario = { id_funcionario: number; nome: string };

const situacoesBanco = {
  Confirmado: 'confirmado',
  Pendente: 'solicitado',
  Concluído: 'concluido',
  Cancelado: 'cancelado',
} as const;
const situacoesPainel = {
  confirmado: 'Confirmado',
  solicitado: 'Pendente',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
} as const;
const normalizar = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

async function relacionamentos(
  db: SupabaseClient,
  clienteId: number,
  motoId: number,
  mecanicoId: number,
) {
  const [cliente, moto, mecanico, funcionario] = await Promise.all([
    db
      .from('cliente')
      .select('id_cliente')
      .eq('id_cliente', clienteId)
      .is('excluido_em', null)
      .maybeSingle(),
    db.from('moto').select('id_moto,id_cliente,ativa').eq('id_moto', motoId).maybeSingle(),
    db.from('mecanico').select('id_funcionario').eq('id_funcionario', mecanicoId).maybeSingle(),
    db
      .from('funcionario')
      .select('id_funcionario,cargo,situacao')
      .eq('id_funcionario', mecanicoId)
      .maybeSingle(),
  ]);
  if (cliente.error || moto.error || mecanico.error || funcionario.error)
    throw cliente.error || moto.error || mecanico.error || funcionario.error;
  if (
    !cliente.data ||
    !moto.data ||
    moto.data.id_cliente !== clienteId ||
    moto.data.ativa !== true ||
    !mecanico.data ||
    !funcionario.data ||
    funcionario.data.situacao !== 'ativo' ||
    normalizar(funcionario.data.cargo ?? '') !== 'mecanico'
  )
    return false;
  return true;
}

async function carregarLista(db: SupabaseClient, idAgendamento?: number) {
  let consulta = db
    .from('agendamento')
    .select(
      'id_agendamento,id_cliente,id_moto,id_mecanico,data_hora,servico_solicitado,status,observacoes,duracao',
    );
  if (idAgendamento) consulta = consulta.eq('id_agendamento', idAgendamento);
  else {
    consulta = consulta
      .order('data_hora', { ascending: false })
      .order('id_agendamento', { ascending: false })
      .limit(5000);
  }
  const { data: linhas, error } = await consulta;
  if (error) throw error;
  const registros = (linhas ?? []) as LinhaAgendamento[];
  const clientesIds = [...new Set(registros.map((item) => item.id_cliente))];
  const motosIds = [...new Set(registros.map((item) => item.id_moto))];
  const mecanicosIds = [
    ...new Set(registros.flatMap((item) => (item.id_mecanico ? [item.id_mecanico] : []))),
  ];
  const [clientes, motos, mecanicos] = await Promise.all([
    clientesIds.length
      ? db.from('cliente').select('id_cliente,nome,telefone').in('id_cliente', clientesIds)
      : Promise.resolve({ data: [], error: null }),
    motosIds.length
      ? db.from('moto').select('id_moto,id_cliente,modelo,placa,foto').in('id_moto', motosIds)
      : Promise.resolve({ data: [], error: null }),
    mecanicosIds.length
      ? db.from('funcionario').select('id_funcionario,nome').in('id_funcionario', mecanicosIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientes.error || motos.error || mecanicos.error)
    throw clientes.error || motos.error || mecanicos.error;
  const clientesPorId = new Map(
    ((clientes.data ?? []) as Cliente[]).map((item) => [item.id_cliente, item]),
  );
  const motosPorId = new Map(((motos.data ?? []) as Moto[]).map((item) => [item.id_moto, item]));
  const mecanicosPorId = new Map(
    ((mecanicos.data ?? []) as Funcionario[]).map((item) => [item.id_funcionario, item]),
  );
  return registros.map((item) => {
    const dataHora = item.data_hora.replace(' ', 'T');
    const cliente = clientesPorId.get(item.id_cliente);
    const moto = motosPorId.get(item.id_moto);
    const mecanico = item.id_mecanico ? mecanicosPorId.get(item.id_mecanico) : null;
    return {
      id: item.id_agendamento,
      clienteId: item.id_cliente,
      cliente: cliente?.nome ?? 'Cliente removido',
      telefone: cliente?.telefone ?? '',
      motoId: item.id_moto,
      moto: moto?.modelo ?? 'Motocicleta removida',
      placa: moto?.placa ?? '',
      motoFoto: moto?.foto ?? null,
      mecanicoId: item.id_mecanico,
      mecanico: mecanico?.nome ?? '',
      servico: item.servico_solicitado,
      status: situacoesPainel[item.status as keyof typeof situacoesPainel] ?? 'Pendente',
      data: dataHora.slice(0, 10),
      hora: dataHora.slice(11, 16),
      duracao: item.duracao ?? '1 hora',
      observacoes: item.observacoes ?? '',
    };
  });
}

export function rotasAgendamentos(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const roteador = Router();
  roteador.use(async (req, res, next) => {
    try {
      const db = await autorizar(req, res);
      if (!db) return;
      res.locals.agendamentosDb = db;
      res.setHeader('Cache-Control', 'private, no-store');
      next();
    } catch (erro) {
      next(erro);
    }
  });
  const db = (res: Response) => res.locals.agendamentosDb as SupabaseClient;
  const acesso = (res: Response) => res.locals.acesso as Acesso;

  roteador.get('/', async (_req, res, next) => {
    if (!permitir(acesso(res), 'agendamentos', 'visualizar'))
      return res.status(403).json({ message: 'Seu cargo não permite visualizar agendamentos.' });
    try {
      return res.json({ itens: await carregarLista(db(res)) });
    } catch (erro) {
      next(erro);
    }
  });

  roteador.get('/opcoes', async (_req, res, next) => {
    if (!permitir(acesso(res), 'agendamentos', 'visualizar'))
      return res.status(403).json({ message: 'Seu cargo não permite carregar a agenda.' });
    try {
      const [clientes, motos, mecanicos] = await Promise.all([
        db(res)
          .from('cliente')
          .select('id_cliente,nome,telefone')
          .is('excluido_em', null)
          .order('nome')
          .limit(2000),
        db(res)
          .from('moto')
          .select('id_moto,id_cliente,modelo,placa')
          .eq('ativa', true)
          .limit(5000),
        db(res).from('mecanico').select('id_funcionario').limit(500),
      ]);
      if (clientes.error || motos.error || mecanicos.error)
        throw clientes.error || motos.error || mecanicos.error;
      const ids = (mecanicos.data ?? []).map((item) => item.id_funcionario);
      const funcionarios = ids.length
        ? await db(res)
            .from('funcionario')
            .select('id_funcionario,nome,cargo,situacao')
            .in('id_funcionario', ids)
            .eq('situacao', 'ativo')
            .order('nome')
        : { data: [], error: null };
      if (funcionarios.error) throw funcionarios.error;
      const motosPorCliente = new Map<number, Moto[]>();
      for (const item of (motos.data ?? []) as Moto[]) {
        const grupo = motosPorCliente.get(item.id_cliente) ?? [];
        grupo.push(item);
        motosPorCliente.set(item.id_cliente, grupo);
      }
      const mecanicosAtivos = (funcionarios.data ?? []).filter(
        (item) => normalizar(item.cargo ?? '') === 'mecanico',
      );
      return res.json({
        clientes: ((clientes.data ?? []) as Cliente[]).map((item) => ({
          id: item.id_cliente,
          nome: item.nome,
          telefone: item.telefone,
          motos: (motosPorCliente.get(item.id_cliente) ?? []).map((moto) => ({
            id: moto.id_moto,
            modelo: moto.modelo,
            placa: moto.placa,
          })),
        })),
        mecanicos: mecanicosAtivos.map((item) => ({ id: item.id_funcionario, nome: item.nome })),
      });
    } catch (erro) {
      next(erro);
    }
  });

  roteador.post('/', async (req, res, next) => {
    if (!permitir(acesso(res), 'agendamentos', 'criar'))
      return res.status(403).json({ message: 'Seu cargo não permite criar agendamentos.' });
    const entrada = entradaAgendamento.safeParse(req.body);
    if (!entrada.success)
      return res.status(400).json({ message: 'Confira os dados do agendamento.' });
    try {
      if (
        !(await relacionamentos(
          db(res),
          entrada.data.clienteId,
          entrada.data.motoId,
          entrada.data.mecanicoId,
        ))
      )
        return res.status(400).json({ message: 'Cliente, moto ou mecânico inválido.' });
      const { data, error } = await db(res).rpc('criar_agendamento_admin', {
        p_cliente: entrada.data.clienteId,
        p_moto: entrada.data.motoId,
        p_mecanico: entrada.data.mecanicoId,
        p_data_hora: `${entrada.data.data}T${entrada.data.hora}:00`,
        p_servico: entrada.data.servico,
        p_observacoes: entrada.data.observacoes,
        p_duracao: entrada.data.duracao,
        p_status: situacoesBanco[entrada.data.status],
        p_actor: res.locals.adminUserId,
      });
      if (error) {
        if (error.code === '23505')
          return res.status(409).json({ message: 'Já existe um agendamento ativo nesse horário.' });
        throw error;
      }
      const itens = await carregarLista(db(res), data);
      return res.status(201).json({ item: itens[0] });
    } catch (erro) {
      next(erro);
    }
  });

  roteador.patch('/:id', async (req, res, next) => {
    if (!permitir(acesso(res), 'agendamentos', 'editar'))
      return res.status(403).json({ message: 'Seu cargo não permite editar agendamentos.' });
    const idAgendamento = z.coerce.number().int().positive().safeParse(req.params.id);
    const entrada = entradaAgendamento.safeParse(req.body);
    if (!idAgendamento.success || !entrada.success)
      return res.status(400).json({ message: 'Confira os dados do agendamento.' });
    try {
      if (
        !(await relacionamentos(
          db(res),
          entrada.data.clienteId,
          entrada.data.motoId,
          entrada.data.mecanicoId,
        ))
      )
        return res.status(400).json({ message: 'Cliente, moto ou mecânico inválido.' });
      const { data, error } = await db(res).rpc('editar_agendamento_admin', {
        p_id: idAgendamento.data,
        p_cliente: entrada.data.clienteId,
        p_moto: entrada.data.motoId,
        p_mecanico: entrada.data.mecanicoId,
        p_data_hora: `${entrada.data.data}T${entrada.data.hora}:00`,
        p_servico: entrada.data.servico,
        p_observacoes: entrada.data.observacoes,
        p_duracao: entrada.data.duracao,
        p_status: situacoesBanco[entrada.data.status],
        p_actor: res.locals.adminUserId,
      });
      if (error) {
        if (error.code === '23505')
          return res.status(409).json({ message: 'Já existe um agendamento ativo nesse horário.' });
        if (error.code === 'P0002')
          return res.status(404).json({ message: 'Agendamento não encontrado.' });
        throw error;
      }
      const itens = await carregarLista(db(res), data);
      return res.json({ item: itens[0] });
    } catch (erro) {
      next(erro);
    }
  });

  roteador.delete('/:id', async (req, res, next) => {
    if (!permitir(acesso(res), 'agendamentos', 'excluir'))
      return res.status(403).json({ message: 'Seu cargo não permite excluir agendamentos.' });
    const idAgendamento = z.coerce.number().int().positive().safeParse(req.params.id);
    if (!idAgendamento.success) return res.status(400).json({ message: 'Agendamento inválido.' });
    try {
      const { data: removido, error } = await db(res).rpc('excluir_agendamento_admin', {
        p_id: idAgendamento.data,
        p_actor: res.locals.adminUserId,
      });
      if (error?.code === '23503')
        return res
          .status(409)
          .json({ message: 'Este agendamento está ligado a uma ordem de serviço.' });
      if (error) throw error;
      if (!removido) return res.status(404).json({ message: 'Agendamento não encontrado.' });
      return res.status(204).end();
    } catch (erro) {
      next(erro);
    }
  });
  return roteador;
}
