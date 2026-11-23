import { getEnv } from '../../scripts/env.mjs';
import {
  aprovadoPreviaCaminho,
  modeloIncluidoNoProjeto,
  REPOSITORIO_PREVIAS_APROVADAS,
} from '../previaModelo.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { ACERVO, chaveCatalogo, nomeCompleto, type Referencia } from './identidade.js';
import {
  criarVariantes,
  imagemParaModelo,
  prepararReferencia,
  verificarImagem,
} from './imagens.js';
import { baixarReferenciaPublica, pesquisarReferencias, type Pesquisa } from './pesquisa.js';
import {
  ErroGeracao,
  geracaoConfigurada,
  gerarImagem,
  montarInstrucao,
  proximaLiberacaoCota,
} from './provedor.js';
import { conferirErro, criarPedido, pedidoCompleto, publicacaoAtual } from './repositorio.js';

export async function processarProximo(db: SupabaseClient) {
  if (!geracaoConfigurada() || proximaLiberacaoCota() > Date.now()) return false;
  const executor = randomUUID();
  const { data, error } = await db.rpc('reservar_pedido_miniatura', {
    p_executor: executor,
    p_limite: Math.min(500, Math.max(1, Number(getEnv().MINIATURAS_LIMITE_DIARIO) || 30)),
  });
  conferirErro(error);
  if (!data?.[0]) return false;
  const tarefa = await pedidoCompleto(db, data[0].id);
  if (!tarefa) return false;
  const atualizar = async (alteracoes: object) => {
    const resultado = await db
      .from('miniatura_pedidos')
      .update({ ...alteracoes, atualizado_em: new Date().toISOString() })
      .eq('id', tarefa.id)
      .eq('executor', executor)
      .eq('status', 'processando')
      .select('id');
    conferirErro(resultado.error);
    if (!resultado.data?.length)
      throw new Error('Reserva expirada; o resultado nao foi publicado.');
  };
  try {
    const catalogo = tarefa.catalogo;
    const modelo = nomeCompleto({
      modelo: catalogo.modelo,
      ano: catalogo.ano,
      variante: catalogo.variante,
      motoId: catalogo.moto_id,
    });
    const pesquisa: Pesquisa =
      (tarefa.pesquisa &&
      (tarefa.referencias.length ||
        (tarefa.pesquisa.fontes?.length &&
          Date.now() - Date.parse(tarefa.pesquisa.feita_em) < 3600_000))
        ? tarefa.pesquisa
        : null) ||
      (tarefa.referencias.length
        ? { consulta: modelo, fontes: [], avisos: [], feita_em: new Date().toISOString() }
        : await pesquisarReferencias(modelo, catalogo.ano));
    await atualizar({ pesquisa });
    const referencias: Buffer[] = [];
    for (const referencia of tarefa.referencias as Referencia[]) {
      const { data: foto, error: erro } = await db.storage
        .from(ACERVO)
        .download(referencia.caminho);
      conferirErro(erro);
      if (foto) referencias.push(await imagemParaModelo(Buffer.from(await foto.arrayBuffer())));
    }
    if (!referencias.length && catalogo.publicada) {
      const publicada = await publicacaoAtual(db, catalogo);
      if (publicada) {
        const { data: aprovada } = await db.storage.from(ACERVO).download(publicada.caminho);
        if (aprovada)
          referencias.push(await imagemParaModelo(Buffer.from(await aprovada.arrayBuffer())));
      }
    }
    if (!referencias.length) {
      const novasReferencias: Referencia[] = [];
      for (const fonte of pesquisa.fontes
        .filter((fonte) => fonte.imagem && fonte.correspondencia !== 'familia')
        .slice(0, 4)) {
        try {
          const bytes = await prepararReferencia(await baixarReferenciaPublica(fonte.imagem!));
          const caminho = `referencias/${tarefa.id}/${randomUUID()}.jpg`;
          conferirErro(
            (
              await db.storage
                .from(ACERVO)
                .upload(caminho, bytes, { contentType: 'image/jpeg', upsert: false })
            ).error,
          );
          novasReferencias.push({
            caminho,
            nome: fonte.titulo.slice(0, 160),
            origem: 'web',
            url: fonte.url,
            licenca: fonte.licenca,
          });
          referencias.push(await imagemParaModelo(bytes));
          pesquisa.usadas = [
            ...(pesquisa.usadas || []).filter((usada) => usada.imagem !== fonte.imagem),
            fonte,
          ];
          if (referencias.length >= 2) break;
        } catch {
          /* Uma fonte indisponivel nao invalida as demais. */
        }
      }
      if (novasReferencias.length) await atualizar({ referencias: novasReferencias });
    }
    await atualizar({ pesquisa });
    const fontesConfirmadas = pesquisa.fontes.filter(
      (fonte) => fonte.correspondencia !== 'familia',
    );
    if (!referencias.length && !fontesConfirmadas.length) {
      await atualizar({
        status: 'informacao',
        tentativas: Math.max(0, tarefa.tentativas - 1),
        erro: 'Nao consegui confirmar esse modelo nas fontes consultadas. Confira marca, nome ou ano. Uma foto pode ajudar, mas nao e obrigatoria para modelos confirmados.',
        executor: null,
      });
      return true;
    }
    const fotoComparacao = referencias[0];
    pesquisa.semFoto = !referencias.length;
    pesquisa.etapa = 'gerando';
    await atualizar({ pesquisa });
    // A candidata anterior orienta a correcao; nao substitui as referencias originais.
    if (tarefa.candidato && tarefa.correcao && referencias.length < 4) {
      const { data: anterior } = await db.storage.from(ACERVO).download(tarefa.candidato);
      if (anterior)
        referencias.push(await imagemParaModelo(Buffer.from(await anterior.arrayBuffer())));
    }
    const instrucao = montarInstrucao({
      modelo,
      modo: tarefa.modo,
      observacoes: tarefa.observacoes,
      pesquisa: pesquisa.fontes
        .filter((fonte) => fonte.correspondencia !== 'familia')
        .map((fonte) => `${fonte.titulo}: ${fonte.resumo}`)
        .join('\n'),
      correcao: tarefa.correcao,
    });
    const bytes = await gerarImagem(instrucao, referencias, tarefa.tentativas);
    pesquisa.etapa = 'conferindo';
    await atualizar({ pesquisa });
    const verificacao = await verificarImagem(bytes, modelo, fotoComparacao);
    if (pesquisa.semFoto)
      verificacao.problemas.push(
        'Gerada com identificacao textual da fonte, sem foto de comparacao. Confira os detalhes do modelo.',
      );
    const variantes = await criarVariantes(bytes);
    const caminho = `candidatas/${tarefa.id}/${randomUUID()}`;
    for (const [nome, arquivo] of Object.entries(variantes)) {
      const extensao = nome === 'original' ? 'png' : 'webp';
      conferirErro(
        (
          await db.storage.from(ACERVO).upload(`${caminho}/${nome}.${extensao}`, arquivo, {
            contentType: `image/${extensao}`,
            upsert: false,
          })
        ).error,
      );
    }
    const corrigir =
      verificacao.automatica &&
      (verificacao.direcao !== 'direita' ||
        !verificacao.inteira ||
        verificacao.problemas.some(
          (problema) => !/indisponivel|confira|conferencia|sem foto de comparacao/i.test(problema),
        ));
    if (corrigir && tarefa.tentativas < 6) {
      await atualizar({
        status: 'pendente',
        candidato: `${caminho}/original.png`,
        verificacao,
        correcao:
          `Correcao automatica: frente obrigatoriamente para a direita, moto inteira. ${verificacao.problemas.join('. ')}`.slice(
            0,
            800,
          ),
        erro: null,
        executor: null,
        tentar_em: new Date().toISOString(),
      });
      return true;
    }
    pesquisa.etapa = 'concluida';
    await atualizar({
      pesquisa,
      status: 'revisao',
      candidato: `${caminho}/original.png`,
      verificacao,
      erro: null,
      executor: null,
    });
  } catch (erro) {
    const temporario =
      erro instanceof ErroGeracao && ['TEMPORARIO', 'LIMITE'].includes(erro.codigo);
    const cota = erro instanceof ErroGeracao && erro.codigo === 'COTA';
    await atualizar({
      status: cota || (temporario && tarefa.tentativas < 6) ? 'pendente' : 'falhou',
      ...(cota ? { tentativas: Math.max(0, tarefa.tentativas - 1) } : {}),
      erro: erro instanceof Error ? erro.message : 'Falha ao preparar miniatura.',
      falhas: tarefa.falhas + 1,
      executor: null,
      tentar_em: new Date(cota ? proximaLiberacaoCota() : Date.now() + 5 * 60_000).toISOString(),
    });
    console.warn('[miniaturas/fila]', {
      pedido: tarefa.id,
      codigo: erro instanceof ErroGeracao ? erro.codigo : 'PROCESSAMENTO',
    });
  }
  return true;
}
export async function prepararModelosSemMiniatura(db: SupabaseClient) {
  const { data, error } = await db.from('moto').select('modelo').limit(500);
  conferirErro(error);
  const { data: catalogos, error: erroCatalogos } = await db
    .from('miniatura_catalogo')
    .select('chave')
    .limit(10000);
  conferirErro(erroCatalogos);
  const existentes = new Set((catalogos || []).map((item) => item.chave));
  const { data: arquivos, error: erroArquivos } = await db.storage
    .from(REPOSITORIO_PREVIAS_APROVADAS)
    .list('approved', { limit: 1000 });
  conferirErro(erroArquivos);
  const aprovadas = new Set((arquivos || []).map((item) => `approved/${item.name}`));
  for (const modelo of new Set((data || []).map((moto) => moto.modelo as string).filter(Boolean))) {
    const identidade = { modelo, ano: null, variante: '', motoId: null };
    if (
      existentes.has(chaveCatalogo(identidade)) ||
      modeloIncluidoNoProjeto(modelo) ||
      aprovadas.has(aprovadoPreviaCaminho(modelo, 'image/jpeg')) ||
      aprovadas.has(aprovadoPreviaCaminho(modelo, 'image/png'))
    )
      continue;
    const pedido = await criarPedido(db, identidade, null);
    conferirErro(
      (await db.from('miniatura_pedidos').update({ status: 'pendente' }).eq('id', pedido.id)).error,
    );
  }
}
export function iniciarCentralMiniaturas(criarBanco: () => SupabaseClient | null) {
  let ocupado = false;
  const ciclo = async () => {
    if (ocupado) return;
    const db = criarBanco();
    if (!db) return;
    ocupado = true;
    try {
      await processarProximo(db);
    } catch (erro) {
      console.warn(
        '[miniaturas/fila]',
        erro instanceof Error ? erro.message : 'Banco indisponivel',
      );
    } finally {
      ocupado = false;
    }
  };
  const examinar = async () => {
    const db = criarBanco();
    if (!db || process.env.MINIATURAS_PREPARAR_CADASTRADAS === 'false') return;
    try {
      await prepararModelosSemMiniatura(db);
    } catch {
      console.warn('[miniaturas/fila] Nao foi possivel preparar os modelos cadastrados.');
    }
  };
  const intervalo = setInterval(() => void ciclo(), 8_000);
  intervalo.unref();
  const varredura = setInterval(() => void examinar(), 3600_000);
  varredura.unref();
  const inicial = setTimeout(() => {
    void examinar().then(ciclo);
  }, 2000);
  inicial.unref();
  void ciclo();
  return () => {
    clearInterval(intervalo);
    clearInterval(varredura);
    clearTimeout(inicial);
  };
}
