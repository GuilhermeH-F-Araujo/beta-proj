import express from 'express';
import { z } from 'zod';
import { createSupabaseAdmin } from '../config/conexao.js';

export const REPOSITORIO_FOTOS_ADMINISTRADORES = 'admin-avatars';

export const caminhoFotoAdministrador = (idUsuario: string) => `admins/${idUsuario}/avatar.jpg`;

export const REPOSITORIO_FOTOS_CLIENTES = 'cliente-fotos';

export async function clienteDaOrdem(db: ReturnType<typeof createSupabaseAdmin>, id: number) {
  if (!db) throw new Error('Conexão de banco indisponível.');
  const { data: ordem, error: ordemErro } = await db
    .from('ordem_servico')
    .select('id_moto')
    .eq('id_os', id)
    .maybeSingle();
  if (ordemErro) throw ordemErro;
  if (!ordem) return null;
  const { data: moto, error: motoErro } = await db
    .from('moto')
    .select('id_cliente')
    .eq('id_moto', ordem.id_moto)
    .maybeSingle();
  if (motoErro) throw motoErro;
  if (!moto) return null;
  const { data: cliente, error: clienteErro } = await db
    .from('cliente')
    .select('id_cliente,foto')
    .eq('id_cliente', moto.id_cliente)
    .maybeSingle();
  if (clienteErro) throw clienteErro;
  return cliente;
}

export function idOrdemDaFoto(req: express.Request, res: express.Response) {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ message: 'Número da OS inválido.' });
    return null;
  }
  return id.data;
}
