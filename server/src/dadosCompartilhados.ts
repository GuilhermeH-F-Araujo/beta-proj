// A revisao recebida deve corresponder ao registro salvo.
// Uma alteracao concorrente retorna conflito para impedir sobrescrita silenciosa.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { permitir } from './cargos.js';
import { avisarCatalogoAtualizado, conectarEventosCatalogo } from './catalogoEventos.js';
const texto = (maximo: number) => z.string().max(maximo);
const id = texto(100).min(1);
const categoria = z
  .object({
    id,
    nome: texto(150).min(1),
    descricao: texto(1000),
    cor: z.string().regex(/^#[a-f\d]{6}$/i),
    icone: texto(500),
  })
  .strict();
const servico = z
  .object({
    id,
    nome: texto(150).min(1),
    categoriaId: id,
    descricao: texto(3000),
    preco: z.number().finite().nonnegative(),
    custo: z.number().finite().nonnegative(),
    duracao: texto(100),
    ativo: z.boolean(),
    icone: texto(500),
    adicional: texto(3000),
  })
  .strict();
export const schemasCompartilhados = {
  catalogo: z
    .object({
      categorias: z.array(categoria).max(1000),
      servicos: z.array(servico).max(10000),
    })
    .strict(),
};
type RegistroCompartilhado = { id: string | number; categoriaId?: string };
type ColecoesCatalogo = {
  servicos: RegistroCompartilhado[];
  categorias: RegistroCompartilhado[];
};
type AcaoAlterada = 'criar' | 'editar' | 'excluir';

function separarColecoes(dados: unknown): RegistroCompartilhado[][] {
  // A rota valida o formato com Zod antes de comparar os registros.
  const catalogo = dados as Partial<ColecoesCatalogo> | null;
  return [catalogo?.servicos ?? [], catalogo?.categorias ?? []];
}

export function acoesAlteradas(antes: unknown, depois: unknown) {
  const acoes = new Set<AcaoAlterada>();
  const colecoesAnteriores = separarColecoes(antes);
  const colecoesAtuais = separarColecoes(depois);

  for (let indice = 0; indice < colecoesAtuais.length; indice++) {
    const registrosAnteriores = new Map(
      colecoesAnteriores[indice].map((registro) => [registro.id, registro]),
    );
    for (const registro of colecoesAtuais[indice]) {
      const anterior = registrosAnteriores.get(registro.id);
      if (!anterior) acoes.add('criar');
      else if (JSON.stringify(anterior) !== JSON.stringify(registro)) acoes.add('editar');
      registrosAnteriores.delete(registro.id);
    }
    if (registrosAnteriores.size) acoes.add('excluir');
  }
  return [...acoes];
}

export function dadosUnicos(dados: unknown, chave: string) {
  const colecoes = separarColecoes(dados);
  const possuiIdsRepetidos = colecoes.some(
    (registros) => new Set(registros.map((registro) => registro.id)).size !== registros.length,
  );
  if (possuiIdsRepetidos) return false;
  if (chave !== 'catalogo') return true;

  const [servicos, categorias] = colecoes;
  const idsCategorias = new Set(categorias.map((categoria) => categoria.id));
  return servicos.every((servico) => idsCategorias.has(servico.categoriaId ?? ''));
}

export function rotasDadosCompartilhados(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const roteador = Router();
  roteador.get('/:chave/stream', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (String(req.params.chave) !== 'catalogo') {
      res.status(404).json({ message: 'Cadastro não encontrado.' });
      return;
    }
    conectarEventosCatalogo(res);
  });
  roteador.get('/:chave', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const chaveLocal = String(req.params.chave);
    if (chaveLocal !== 'catalogo') {
      res.status(404).json({ message: 'Cadastro não encontrado.' });
      return;
    }
    const [categorias, servicos, versao] = await Promise.all([
      db.from('categorias_servico').select('id,nome,descricao,cor,icone').order('id'),
      db
        .from('servicos')
        .select('id,nome,categoria_id,descricao,preco,custo,duracao,ativo,icone,adicional')
        .order('id'),
      db.from('servicos_catalogo_versao').select('versao').eq('id', true).maybeSingle(),
    ]);
    const erro = categorias.error || servicos.error || versao.error;
    if (erro) {
      res.status(503).json({
        message:
          'Não foi possível carregar os dados compartilhados. Confira a implantação do banco.',
      });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      dados: {
        categorias: (categorias.data ?? []).map((item) => ({ ...item })),
        servicos: (servicos.data ?? []).map((item) => ({
          id: item.id,
          nome: item.nome,
          categoriaId: item.categoria_id,
          descricao: item.descricao,
          preco: Number(item.preco),
          custo: Number(item.custo),
          duracao: item.duracao,
          ativo: item.ativo,
          icone: item.icone,
          adicional: item.adicional,
        })),
      },
      versao: versao.data?.versao ?? 0,
    });
  });
  roteador.put('/:chave', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const chaveLocal = String(req.params.chave);
    if (chaveLocal !== 'catalogo') {
      res.status(404).json({ message: 'Cadastro não encontrado.' });
      return;
    }
    const entrada = z
      .object({ versao: z.number().int().nonnegative(), dados: z.unknown() })
      .strict()
      .safeParse(req.body);
    const validado = entrada.success
      ? schemasCompartilhados[chaveLocal as keyof typeof schemasCompartilhados].safeParse(
          entrada.data.dados,
        )
      : null;
    if (!entrada.success || !validado?.success || !dadosUnicos(validado.data, chaveLocal)) {
      res.status(400).json({ message: 'Confira os dados antes de salvar.' });
      return;
    }
    const [categoriasAtuais, servicosAtuais, versaoAtual] = await Promise.all([
      db.from('categorias_servico').select('id,nome,descricao,cor,icone'),
      db
        .from('servicos')
        .select('id,nome,categoria_id,descricao,preco,custo,duracao,ativo,icone,adicional'),
      db.from('servicos_catalogo_versao').select('versao').eq('id', true).maybeSingle(),
    ]);
    const erroConsulta = categoriasAtuais.error || servicosAtuais.error || versaoAtual.error;
    if (erroConsulta) {
      res.status(503).json({
        message: 'Não foi possível acessar o cadastro compartilhado.',
      });
      return;
    }
    const dadosAntes = {
      categorias: categoriasAtuais.data ?? [],
      servicos: (servicosAtuais.data ?? []).map((item) => ({
        id: item.id,
        nome: item.nome,
        categoriaId: item.categoria_id,
        descricao: item.descricao,
        preco: Number(item.preco),
        custo: Number(item.custo),
        duracao: item.duracao,
        ativo: item.ativo,
        icone: item.icone,
        adicional: item.adicional,
      })),
    };
    if ((versaoAtual.data?.versao ?? 0) !== entrada.data.versao) {
      res.status(409).json({
        message:
          'Outra pessoa atualizou este cadastro. Os dados foram atualizados; confira seu rascunho e salve novamente.',
      });
      return;
    }
    // A tela exige permissao de edicao para qualquer alteracao nas categorias.
    const mudouCategorias =
      acoesAlteradas(
        { categorias: dadosAntes.categorias },
        { categorias: validado.data.categorias },
      ).length > 0;
    const modulo = 'servicos';
    if (
      (mudouCategorias && !permitir(res.locals.acesso, modulo, 'editar')) ||
      acoesAlteradas({ servicos: dadosAntes.servicos }, { servicos: validado.data.servicos }).some(
        (acao) => !permitir(res.locals.acesso, modulo, acao),
      )
    ) {
      res.status(403).json({ message: 'Seu acesso não permite esta alteração.' });
      return;
    }
    const dadosCatalogo = validado.data as z.infer<typeof schemasCompartilhados.catalogo>;
    const resultado = await db.rpc('substituir_catalogo_servicos', {
      p_versao: entrada.data.versao,
      p_categorias: dadosCatalogo.categorias,
      p_servicos: dadosCatalogo.servicos.map((item) => ({
        id: item.id,
        nome: item.nome,
        categoria_id: item.categoriaId,
        descricao: item.descricao,
        preco: item.preco,
        custo: item.custo,
        duracao: item.duracao,
        ativo: item.ativo,
        icone: item.icone,
        adicional: item.adicional,
      })),
      p_actor: res.locals.adminUserId,
    });
    if (resultado.error || typeof resultado.data !== 'number') {
      const conflito = resultado.error?.code === '40001';
      res.status(conflito ? 409 : resultado.error?.code === '23505' ? 409 : 503).json({
        message:
          conflito || resultado.error?.code === '23505'
            ? 'Outra pessoa atualizou este cadastro. Confira e tente salvar novamente.'
            : 'Não foi possível salvar. Seu rascunho foi preservado.',
      });
      return;
    }
    // Avisa as abas abertas mesmo se a assinatura Realtime do banco cair.
    avisarCatalogoAtualizado();
    res.json({ dados: validado.data, versao: resultado.data });
  });
  return roteador;
}
