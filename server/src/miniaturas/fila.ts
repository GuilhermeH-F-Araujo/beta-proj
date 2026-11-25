import { getEnv } from '../../scripts/env.mjs';
import {
  aprovadoPreviaCaminho,
  modeloIncluidoNoProjeto,
  REPOSITORIO_PREVIAS_APROVADAS,
} from '../ia/previaModelo.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import {
  ACERVO,
  chaveCatalogo,
  escolherFundoChave,
  nomeCompleto,
  type Referencia,
} from './identidade.js';
import {
  criarVariantes,
  ErroRecorteMiniatura,
  espelharMiniatura,
  gerarMiniaturaComIa,
  imagemParaModelo,
  prepararReferencia,
  verificarImagem,
  separarPinturaMiniatura,
} from './imagens.js';
import {
  baixarFotoDaFonte,
  pesquisarReferencias,
  prioridadeFonte,
  type Pesquisa,
} from './pesquisa.js';
import {
  ErroGeracao,
  geracaoConfigurada,
  montarInstrucao,
  montarInstrucaoCompacta,
  proximaLiberacaoCota,
} from './provedor.js';
import { criarProgressoMiniatura } from './progresso.js';
import { limparNomeModelo } from './variacoesModelo.js';
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
  const progresso = criarProgressoMiniatura(tarefa.pesquisa?.progresso, tarefa.tentativas);
  let pesquisaEmUso: Pesquisa = tarefa.pesquisa
    ? structuredClone(tarefa.pesquisa)
    : {
        consulta: tarefa.catalogo.modelo,
        fontes: [],
        avisos: [],
        feita_em: new Date().toISOString(),
      };
  const registrarEtapa = async (etapa: string, descricao: string, detalhes = '', final = false) => {
    pesquisaEmUso.progresso = progresso.registrar(etapa, descricao, detalhes, final);
    await atualizar({ pesquisa: structuredClone(pesquisaEmUso) });
  };
  try {
    const catalogo = tarefa.catalogo;
    // O nome limpo (sem marca repetida ou ano dentro do nome) orienta busca, prompt e conferencia;
    // a chave do catalogo continua a que o usuario cadastrou.
    const nomeCadastrado = limparNomeModelo(
      [catalogo.modelo, catalogo.variante].filter(Boolean).join(' '),
      catalogo.ano,
    );
    const modelo = nomeCompleto({
      modelo: nomeCadastrado.modelo,
      ano: nomeCadastrado.ano,
      variante: '',
      motoId: catalogo.moto_id,
    });
    await registrarEtapa(
      'pesquisa',
      'Preparando pesquisa e identificação',
      tarefa.referencias.length
        ? 'Ampliando a pesquisa e comparando com as referências enviadas.'
        : 'Consultando fontes públicas e dados do modelo.',
    );
    const pesquisa: Pesquisa = structuredClone(
      await pesquisarReferencias(modelo, nomeCadastrado.ano, true),
    );
    // Uma consulta temporariamente vazia nao apaga fontes ja identificadas.
    pesquisa.fontes = [
      ...new Map(
        [...(tarefa.pesquisa?.fontes || []), ...pesquisa.fontes].map((fonte) => [
          fonte.imagem || fonte.url,
          fonte,
        ]),
      ).values(),
    ];
    // A uniao com fontes antigas nao pode desfazer a ordem de qualidade das referencias.
    pesquisa.fontes.sort(
      (a, b) => prioridadeFonte(b, nomeCadastrado.ano) - prioridadeFonte(a, nomeCadastrado.ano),
    );
    pesquisa.usadas = tarefa.pesquisa?.usadas || [];
    pesquisa.progresso = pesquisaEmUso.progresso;
    pesquisaEmUso = pesquisa;
    await registrarEtapa(
      'referencias',
      'Preparando fotos de referência',
      `${pesquisa.fontes.length} fontes encontradas; ${tarefa.referencias.length} fotos enviadas.`,
    );
    const referencias: Buffer[] = [];
    const automaticasAnteriores = new Set<string>(
      (tarefa.pesquisa?.usadas || []).map((fonte: { url: string }) => fonte.url),
    );
    const referenciasMantidas = (tarefa.referencias as Referencia[]).filter(
      (ref) =>
        tarefa.modo === 'preservar' ||
        tarefa.tentativas <= 1 ||
        !ref.url ||
        !automaticasAnteriores.has(ref.url),
    );
    referencias.push(...(await baixarReferenciasEnviadas(db, referenciasMantidas, catalogo)));
    if (tarefa.modo !== 'preservar' && referencias.length < LIMITE_REFERENCIAS) {
      const novasReferencias = await baixarReferenciasWeb({
        db,
        tarefaId: tarefa.id,
        pesquisa,
        referencias,
        mantidas: referenciasMantidas,
        automaticasAnteriores,
        registrarEtapa,
      });
      if (novasReferencias.length) await atualizar({ referencias: novasReferencias });
    }
    await atualizar({ pesquisa });
    const fontesConfirmadas = pesquisa.fontes.filter(
      (fonte) => fonte.correspondencia !== 'familia',
    );
    const fotoComparacao = referencias[0];
    pesquisa.semFoto = !referencias.length;
    pesquisa.identidadeNaoConfirmada = !referencias.length && !fontesConfirmadas.length;
    // Uma foto da familia orienta a silhueta, mas nao comprova o ano ou a edicao.
    const referenciaFamilia =
      !fotoComparacao &&
      tarefa.modo !== 'preservar' &&
      (await adicionarReferenciaFamilia(pesquisa, referencias));
    // Sem nenhuma foto (nem da familia) e sem fonte confirmada, a IA so inventaria.
    // Uma foto da familia ja permite gerar uma aproximacao para conferencia.
    if (!referencias.length && !fontesConfirmadas.length) {
      await atualizar({ pesquisa, status: 'informacao', erro: 'Não encontramos referências confiáveis deste modelo. Envie uma foto da motocicleta inteira, preferencialmente de lado com o farol à direita.', executor: null, tentativas: Math.max(0, tarefa.tentativas - 1) });
      return true;
    }
    pesquisa.etapa = 'gerando';
    await registrarEtapa(
      'geracao',
      'Gerando e preparando a miniatura',
      [
        `${referencias.length} referências preparadas.`,
        `Modo: ${tarefa.modo}.`,
        tarefa.correcao ? `Correção solicitada: ${tarefa.correcao}` : '',
        tarefa.observacoes ? `Observações solicitadas: ${tarefa.observacoes}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    // Uma candidata divergente nao deve ensinar ao gerador a peca errada.
    if (
      tarefa.candidato &&
      tarefa.correcao &&
      referencias.length < 4 &&
      !(fotoComparacao && tarefa.verificacao?.fidelidade === 'divergente')
    ) {
      const { data: previaAnterior } = await db.storage.from(ACERVO).download(tarefa.candidato.replace('original.png', 'previa.png'));
      const anterior = previaAnterior || (await db.storage.from(ACERVO).download(tarefa.candidato)).data;
      if (anterior)
        referencias.push(await imagemParaModelo(Buffer.from(await anterior.arrayBuffer())));
    }
    const fundoChave = escolherFundoChave(tarefa.tentativas, tarefa.observacoes);
    const instrucao = montarInstrucao({
      fundoChave,
      referenciaFamilia,
      modelo,
      modo: tarefa.modo,
      identidadeNaoConfirmada: pesquisa.identidadeNaoConfirmada,
      observacoes: tarefa.observacoes,
      pesquisa: pesquisa.fontes
        .filter((fonte) => fonte.correspondencia !== 'familia')
        .map((fonte) => `${fonte.titulo}: ${fonte.resumo}`)
        .join('\n'),
      correcao: tarefa.correcao,
    });
    // Fotos brancas nao comprovam os vazios internos nem distinguem pintura branca.
    const recortada = await gerarMiniaturaComIa(
      instrucao,
      referencias,
      tarefa.tentativas,
      fundoChave,
      undefined,
      montarInstrucaoCompacta({ modelo, modo: tarefa.modo, fundoChave }),
    );
    const pintura = await separarPinturaMiniatura(recortada);
    let bytes = pintura.imagem;
    pesquisa.etapa = 'conferindo';
    await registrarEtapa(
      'conferencia',
      'Conferindo enquadramento e detalhes',
      'Fundo removido, base neutra e máscara dos painéis pintáveis preparadas, preservando peças e vãos internos.',
    );
    const verificacao = await verificarImagem(bytes, modelo, fotoComparacao);
    if (pesquisa.identidadeNaoConfirmada)
      verificacao.problemas.push(
        'Prévia estimada sem fonte confirmada. Compare com uma foto ou ficha do modelo, ano e edição antes de aprovar.',
      );
    else if (pesquisa.semFoto)
      verificacao.problemas.push(
        'Gerada com identificacao textual da fonte, sem foto de comparacao. Confira os detalhes do modelo.',
      );
    await registrarEtapa(
      'arquivos',
      'Preparando e salvando arquivos',
      verificacao.automatica
        ? `Conferência automática: direção ${verificacao.direcao}; moto inteira ${verificacao.inteira ? 'sim' : 'não'}. ${verificacao.problemas.join(' ')}`
        : 'Conferência automática indisponível. Resultado requer revisão.',
    );
    let { mascara, recorte } = pintura;
    if (deveEspelhar(verificacao, tarefa.tentativas)) {
      [bytes, mascara, recorte] = await Promise.all([bytes, mascara, recorte].map(espelharMiniatura));
      verificacao.direcao = 'direita';
      verificacao.problemas.push(
        'A IA insistiu na frente para a esquerda; a imagem foi espelhada automaticamente para o farol ficar à direita. Confira se o escapamento e a corrente estão do lado certo antes de aprovar.',
      );
      await registrarEtapa('espelhamento', 'Ajustando a direção', 'Imagem espelhada para o farol ficar à direita.');
    }
    // A base neutra e completa e publicada em todos os tamanhos; qualquer tela sem
    // a mascara ainda mostra a moto inteira. O recorte vazado fica como arquivo extra.
    const variantes = { ...(await criarVariantes(bytes)), pintura: mascara, previa: bytes, recorte };
    const caminho = await salvarCandidata(db, tarefa.id, variantes);
    const corrigir =
      verificacao.automatica &&
      (verificacao.fidelidade === 'divergente' ||
        (verificacao.fidelidade === 'inconclusiva' &&
          verificacao.pontuacaoFidelidade !== undefined) ||
        verificacao.direcao !== 'direita' ||
        verificacao.vistaLateral === false ||
        !verificacao.inteira ||
        verificacao.problemas.some(
          (problema) =>
            !/indisponivel|confira|conferencia|sem foto de comparacao|sem fonte confirmada/i.test(
              problema,
            ),
        ));
    if (corrigir && tarefa.tentativas < TENTATIVAS_AUTOMATICAS) {
      await registrarEtapa(
        'correcao',
        'Nova tentativa agendada para corrigir divergências',
        verificacao.problemas.join('. '),
        true,
      );
      await atualizar({
        status: 'pendente',
        candidato: `${caminho}/original.png`,
        verificacao,
        correcao:
          `Correcao automatica: preserve as partes corretas da referencia, mantenha a moto inteira em perfil lateral ortografico, sem vista em tres quartos, com o farol para a direita e corrija estas divergencias. ${verificacao.problemas.join('. ')}`.slice(
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
    await registrarEtapa(
      'revisao',
      'Miniatura pronta para conferência',
      'Candidata salva. Nenhuma publicação foi feita automaticamente.',
      true,
    );
    await atualizar({
      pesquisa,
      status: 'revisao',
      candidato: `${caminho}/original.png`,
      verificacao: { ...verificacao, fundoTransparente: true, pinturaPersonalizavel: true },
      erro: null,
      executor: null,
    });
  } catch (erro) {
    await registrarFalhaGeracao(erro, tarefa, atualizar, registrarEtapa);
  }
  return true;
}
const TENTATIVAS_AUTOMATICAS = 6;
const ESPERA_NOVA_TENTATIVA_MS = 5 * 60_000;
const CORRECAO_RECORTE =
  'Use o fundo chave uniforme, sem chao ou sombra. Moto inteira de lado, farol a direita. Separe somente tanque e pintura variavel da versao em ciano reservado #00B8FF; conserve cores e acabamentos originais de rodas, motor, escapamento, suspensao, paralamas padrao, banco e adesivos.';
// Decide o proximo estado do pedido: recusa real pede foto; cota espera a renovacao sem
// gastar tentativa; falhas temporarias voltam para a fila ate o limite automatico.
async function registrarFalhaGeracao(
  erro: unknown,
  tarefa: { id: string; tentativas: number; falhas: number },
  atualizar: (alteracoes: object) => Promise<void>,
  registrarEtapa: RegistrarEtapa,
) {
  const codigo = erro instanceof ErroGeracao ? erro.codigo : null;
  const mensagem = erro instanceof Error ? erro.message : 'Falha ao preparar miniatura.';
  if (codigo === 'MODERACAO') {
    await registrarEtapa(
      'moderacao',
      'Pedido salvo; referência necessária',
      'O provedor recusou a geração. Adicione uma foto para tentar novamente.',
      true,
    );
    await atualizar({
      status: 'informacao',
      tentativas: Math.max(0, tarefa.tentativas - 1),
      erro: 'A Cloudflare recusou esta geração. O pedido foi salvo. Adicione uma foto da moto inteira, com o farol voltado para a direita, e tente de novo.',
      executor: null,
    });
    return;
  }
  const cota = codigo === 'COTA';
  const temporario = ['TEMPORARIO', 'LIMITE', 'FILTRO'].includes(codigo ?? '');
  const recorte = erro instanceof ErroRecorteMiniatura;
  const repetir = cota || ((temporario || recorte) && tarefa.tentativas < TENTATIVAS_AUTOMATICAS);
  await registrarEtapa(
    cota ? 'cota' : temporario ? 'aguardando' : 'erro',
    cota ? 'Aguardando renovação de cota' : temporario ? 'Nova tentativa agendada' : 'Processamento interrompido',
    mensagem,
    true,
  );
  await atualizar({
    status: repetir ? 'pendente' : 'falhou',
    ...(cota ? { tentativas: Math.max(0, tarefa.tentativas - 1) } : {}),
    erro: mensagem,
    ...(recorte ? { correcao: CORRECAO_RECORTE } : {}),
    falhas: tarefa.falhas + 1,
    executor: null,
    tentar_em: new Date(cota ? proximaLiberacaoCota() : Date.now() + ESPERA_NOVA_TENTATIVA_MS).toISOString(),
  });
  console.warn('[miniaturas/fila]', { pedido: tarefa.id, codigo: codigo ?? 'PROCESSAMENTO' });
}
const LIMITE_REFERENCIAS = 4;
const FONTES_WEB_POR_TENTATIVA = 24;
const ARQUIVOS_PNG = new Set(['original', 'pintura', 'previa', 'recorte']);
type RegistrarEtapa = (etapa: string, descricao: string, detalhes?: string, final?: boolean) => Promise<void>;

// Fotos enviadas pelo administrador; sem nenhuma, a miniatura ja aprovada serve de base.
async function baixarReferenciasEnviadas(
  db: SupabaseClient,
  mantidas: Referencia[],
  catalogo: { publicada?: string | null },
) {
  const referencias: Buffer[] = [];
  for (const referencia of mantidas) {
    const { data: foto, error: erro } = await db.storage.from(ACERVO).download(referencia.caminho);
    conferirErro(erro);
    if (foto) referencias.push(await imagemParaModelo(Buffer.from(await foto.arrayBuffer())));
  }
  if (referencias.length || !catalogo.publicada) return referencias;
  const publicada = await publicacaoAtual(db, catalogo);
  if (!publicada) return referencias;
  const { data: aprovada } = await db.storage.from(ACERVO).download(publicada.caminho);
  if (aprovada) referencias.push(await imagemParaModelo(Buffer.from(await aprovada.arrayBuffer())));
  return referencias;
}

// Baixa fotos exatas da pesquisa ate completar o limite, priorizando as ainda nao usadas.
// Altera `referencias` e `pesquisa.usadas`; devolve a lista que deve ser salva no pedido.
async function baixarReferenciasWeb(entrada: {
  db: SupabaseClient;
  tarefaId: string;
  pesquisa: Pesquisa;
  referencias: Buffer[];
  mantidas: Referencia[];
  automaticasAnteriores: Set<string>;
  registrarEtapa: RegistrarEtapa;
}) {
  const { db, tarefaId, pesquisa, referencias, automaticasAnteriores, registrarEtapa } = entrada;
  const novasReferencias: Referencia[] = [...entrada.mantidas];
  const urlsUsadas = new Set(novasReferencias.map((ref) => ref.url));
  const candidatas = pesquisa.fontes
    .filter((fonte) => fonte.imagem && fonte.correspondencia !== 'familia' && !urlsUsadas.has(fonte.url))
    .sort((a, b) => Number(automaticasAnteriores.has(a.url)) - Number(automaticasAnteriores.has(b.url)))
    .slice(0, FONTES_WEB_POR_TENTATIVA);
  for (const fonte of candidatas) {
    const origem = fonte.titulo + ' — ' + new URL(fonte.url).hostname;
    try {
      await registrarEtapa('busca', 'Buscando uma foto de referência', origem);
      const bytes = await prepararReferencia(await baixarFotoDaFonte(fonte));
      const caminho = `referencias/${tarefaId}/${randomUUID()}.jpg`;
      conferirErro(
        (await db.storage.from(ACERVO).upload(caminho, bytes, { contentType: 'image/jpeg', upsert: false }))
          .error,
      );
      novasReferencias.push({
        caminho,
        nome: fonte.titulo.slice(0, 160),
        origem: 'web',
        url: fonte.url,
        licenca: fonte.licenca,
      });
      referencias.push(await imagemParaModelo(bytes));
      await registrarEtapa('foto', 'Encontrei e preparei uma foto de referência', origem);
      pesquisa.usadas = [...(pesquisa.usadas || []).filter((usada) => usada.imagem !== fonte.imagem), fonte];
      if (referencias.length >= LIMITE_REFERENCIAS) break;
    } catch {
      /* Uma fonte indisponivel nao invalida as demais. */
    }
  }
  return novasReferencias;
}

// Uma foto da familia orienta a silhueta, mas nao comprova o ano ou a edicao.
async function adicionarReferenciaFamilia(pesquisa: Pesquisa, referencias: Buffer[]) {
  const familia = pesquisa.fontes
    .filter((item) => item.imagem && item.correspondencia === 'familia')
    .slice(0, 3);
  for (const fonte of familia) {
    try {
      const foto = await prepararReferencia(await baixarFotoDaFonte(fonte));
      referencias.push(await imagemParaModelo(foto));
      pesquisa.usadas = [...(pesquisa.usadas || []).filter((item) => item.imagem !== fonte.imagem), fonte];
      return true;
    } catch {
      // A proxima fonte pode fornecer a mesma vista.
    }
  }
  return false;
}

// Nomes e extensoes dos arquivos sao contrato com o Storage e com a publicacao.
async function salvarCandidata(db: SupabaseClient, tarefaId: string, variantes: Record<string, Buffer>) {
  const caminho = `candidatas/${tarefaId}/${randomUUID()}`;
  for (const [nome, arquivo] of Object.entries(variantes)) {
    const extensao = ARQUIVOS_PNG.has(nome) ? 'png' : 'webp';
    conferirErro(
      (
        await db.storage.from(ACERVO).upload(`${caminho}/${nome}.${extensao}`, arquivo, {
          contentType: `image/${extensao}`,
          upsert: false,
        })
      ).error,
    );
  }
  return caminho;
}

// O FLUX copia a direcao das fotos de referencia (teste real: Fat Boy e Panigale sairam
// com o farol a esquerda). Espelhar ja na primeira deteccao economiza creditos; o aviso
// pede para conferir o lado do escapamento antes de aprovar.
const TENTATIVAS_ANTES_DE_ESPELHAR = 1;
function deveEspelhar(verificacao: { automatica: boolean; direcao: string }, tentativas: number) {
  return verificacao.automatica && verificacao.direcao === 'esquerda' && tentativas >= TENTATIVAS_ANTES_DE_ESPELHAR;
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
