// Rascunhos de imagem pertencem ao administrador e expiram.
// Gerar uma previa nao autoriza sua publicacao.
import express from 'express';
import { administrador } from '../cargos.js';
import { lerPublicada } from '../miniaturas/consulta.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { autorizarAcessoBanco } from '../auth/autorizacao.js';
import { contaEstaBloqueada } from '../auth/sessao.js';
import { createSupabaseAdmin, createSupabaseClient } from '../config/conexao.js';
import {
  modeloIncluidoNoProjeto,
  obterPreviaModeloEmMemoria,
  previaEhJpeg,
} from '../previaModelo.js';

export async function imagemMotocicletaArmazenada(
  db: ReturnType<typeof createSupabaseClient>,
  modeloLocal: string,
  ano: number | null = null,
  motoId: number | null = null,
) {
  const publicada = await lerPublicada(db, modeloLocal, ano, motoId);
  if (publicada) return publicada;
  const emMemoria = await obterPreviaModeloEmMemoria(db, modeloLocal);
  if (emMemoria)
    return {
      bytes: emMemoria,
      mime: previaEhJpeg(emMemoria) ? 'image/jpeg' : 'image/png',
      origin: 'generated',
    };
  const nomeArquivo = modeloIncluidoNoProjeto(modeloLocal)
    ? /nxr/i.test(modeloLocal)
      ? 'trilha-160.webp'
      : /fazer/i.test(modeloLocal)
        ? 'urbana-250.webp'
        : 'urbana-160.webp'
    : null;
  if (nomeArquivo)
    return {
      bytes: await readFile(
        fileURLToPath(new URL(`../../client/public/assets/models/${nomeArquivo}`, import.meta.url)),
      ),
      mime: 'image/webp',
      origin: 'catalog',
    };
  return null;
}

export async function clienteMiniaturas(req: express.Request, res: express.Response) {
  const autorizacaoPortador = /^Bearer (.+)$/i.exec(req.header('Authorization') ?? '');
  if (!autorizacaoPortador) return autorizarAcessoBanco(req, res);
  const cliente = createSupabaseClient();
  const {
    data: { user: usuario },
    error: erro,
  } = await cliente.auth.getUser(autorizacaoPortador[1]);
  if (erro || !usuario) {
    res.status(401).json({ message: 'Sessão inválida.' });
    return null;
  }
  if (await contaEstaBloqueada(usuario.id)) {
    res.status(401).json({ message: 'Esta conta está bloqueada. Fale com um administrador.' });
    return null;
  }
  const db = createSupabaseAdmin();
  if (!db) {
    res.status(503).json({ message: 'Servidor de miniaturas nao configurado.' });
    return null;
  }
  const { data: perfil } = await db
    .from('funcionario')
    .select('id_funcionario,cargo,perfil_acesso,situacao')
    .eq('auth_user_id', usuario.id)
    .maybeSingle();
  const { data: perfilCliente } = await db
    .from('cliente')
    .select('id_cliente')
    .eq('auth_user_id', usuario.id)
    .is('excluido_em', null)
    .maybeSingle();
  const funcionarioAtivo = !!perfil && !/bloquead|inativ|desligad/i.test(perfil.situacao || '');
  if (!funcionarioAtivo && !perfilCliente) {
    res.status(403).json({ message: 'Conta sem acesso ao catalogo.' });
    return null;
  }
  res.locals.miniaturaUsuario = usuario.id;
  res.locals.miniaturaCliente = perfilCliente?.id_cliente || null;
  res.locals.miniaturaFuncionario = funcionarioAtivo ? perfil.id_funcionario : null;
  res.locals.miniaturaAdministrador = funcionarioAtivo && administrador(perfil);
  return db;
}

export async function modeloVerificado(
  req: express.Request,
  res: express.Response,
  db: ReturnType<typeof createSupabaseClient>,
) {
  const validado = z
    .string()
    .trim()
    .min(2)
    .max(100)
    .refine((valorAtual) => !/[\r\n<>]/.test(valorAtual))
    .safeParse(req.query.model);
  if (!validado.success) {
    res.status(400).json({ message: 'Informe um modelo válido.' });
    return null;
  }
  const { data: dados, error: erro } = await db
    .from('moto')
    .select('id_moto')
    .eq('modelo', validado.data)
    .limit(1);
  if (erro) throw erro;
  if (!dados?.length) {
    res.status(404).json({ message: 'Modelo não cadastrado no projeto.' });
    return null;
  }
  return validado.data;
}
