import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { permitir, type Acesso } from './cargos.js';
export const consultaPesquisaGeral = z.string().trim().min(2).max(100);
const normal = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function relevanciaPesquisa(consulta: string, texto: string) {
  const alvo = normal(texto),
    termos = normal(consulta).split(/\s+/).filter(Boolean);
  if (alvo.includes(normal(consulta))) return 100;
  const palavras = alvo.split(/[^a-z0-9]+/).filter(Boolean);
  const proximas = termos.every((termo) =>
    palavras.some((palavra) => {
      if (palavra.includes(termo)) return true;
      if (termo.length < 3 || Math.abs(termo.length - palavra.length) > 1) return false;
      let anterior = Array.from({ length: palavra.length + 1 }, (_, i) => i);
      for (let i = 1; i <= termo.length; i++) {
        const linha = [i];
        for (let j = 1; j <= palavra.length; j++)
          linha[j] = Math.min(
            linha[j - 1] + 1,
            anterior[j] + 1,
            anterior[j - 1] + (termo[i - 1] === palavra[j - 1] ? 0 : 1),
          );
        anterior = linha;
      }
      return anterior[palavra.length] <= 1;
    }),
  );
  return proximas ? 60 : 0;
}
type Item = {
  id: string;
  titulo: string;
  detalhe: string;
  tipo: string;
  rota: string;
  relevancia: number;
};
export async function pesquisarGeral(db: SupabaseClient, acesso: Acesso, consulta: string) {
  const textoSeguro = consulta.replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
  if (textoSeguro.length < 2) return { itens: [], incompleta: false };
  const tarefas: Promise<Item[]>[] = [];
  const cadastros = [
    {
      modulo: 'clientes',
      tabela: 'cliente',
      id: 'id_cliente',
      colunas: ['nome', 'telefone', 'email', 'cpf'],
      titulo: 'nome',
      tipo: 'Cliente',
      rota: '/clientes',
      perfil: true,
    },
    {
      modulo: 'motocicletas',
      tabela: 'moto',
      id: 'id_moto',
      colunas: ['modelo', 'placa', 'cor'],
      titulo: 'modelo',
      tipo: 'Motocicleta',
      rota: '/motocicletas',
      perfil: false,
    },
    {
      modulo: 'funcionarios',
      tabela: 'funcionario',
      id: 'id_funcionario',
      colunas: ['nome', 'cargo', 'telefone', 'email'],
      titulo: 'nome',
      tipo: 'Funcionário',
      rota: '/funcionarios',
      perfil: true,
    },
    {
      modulo: 'ordens',
      tabela: 'ordem_servico',
      id: 'id_os',
      colunas: ['problema_relatado', 'status', 'observacoes'],
      titulo: 'problema_relatado',
      tipo: 'Ordem de serviço',
      rota: '/ordens-de-servico',
      perfil: true,
    },
  ];
  for (const cadastro of cadastros) {
    if (!permitir(acesso, cadastro.modulo, 'visualizar')) continue;
    tarefas.push(
      (async () => {
        const ler = async (aproximada: boolean) => {
          const termo = aproximada ? textoSeguro.slice(0, 1) : textoSeguro;
          const filtros = cadastro.colunas.map((coluna) => `${coluna}.ilike.%${termo}%`);
          if (/^\d+$/.test(textoSeguro) && Number(textoSeguro) <= 2147483647)
            filtros.push(`${cadastro.id}.eq.${textoSeguro}`);
          let query = db
            .from(cadastro.tabela)
            .select([cadastro.id, ...cadastro.colunas].join(','))
            .or(filtros.join(','))
            .order(cadastro.id, { ascending: false })
            .limit(aproximada ? 40 : 20);
          if (cadastro.tabela === 'cliente') query = query.is('excluido_em', null);
          const resultado = await query;
          if (resultado.error) throw resultado.error;
          return (resultado.data || []) as unknown as Record<string, unknown>[];
        };
        const exatos = await ler(false);
        const linhas =
          exatos.length < 5 && textoSeguro.length >= 3 ? [...exatos, ...(await ler(true))] : exatos;
        return [...new Map(linhas.map((linha) => [linha[cadastro.id], linha])).values()]
          .map((linha) => {
            const titulo =
              cadastro.tabela === 'ordem_servico'
                ? `OS #${linha[cadastro.id]}`
                : String(linha[cadastro.titulo] || cadastro.tipo);
            const detalhe = cadastro.colunas
              .map((coluna) => linha[coluna])
              .filter(Boolean)
              .join(' · ')
              .slice(0, 180);
            return {
              id: `${cadastro.modulo}-${linha[cadastro.id]}`,
              titulo,
              detalhe,
              tipo: cadastro.tipo,
              rota: cadastro.perfil
                ? `${cadastro.rota}/${encodeURIComponent(String(linha[cadastro.id]))}`
                : `${cadastro.rota}?search=${encodeURIComponent(String(linha.placa || linha.modelo || ''))}`,
              relevancia: relevanciaPesquisa(textoSeguro, `${linha[cadastro.id]} ${detalhe}`),
            };
          })
          .filter((item) => item.relevancia > 0)
          .slice(0, 6);
      })(),
    );
  }
  if (permitir(acesso, 'servicos', 'visualizar'))
    tarefas.push(
      (async () => {
        const { data, error } = await db
          .from('servicos')
          .select('id,nome,descricao,preco')
          .eq('ativo', true)
          .limit(1000);
        if (error) throw error;
        return (data ?? [])
          .map((linha) => {
            const titulo = String(linha.nome);
            const detalhe = [linha.descricao, linha.preco != null ? `R$ ${linha.preco}` : '']
              .filter(Boolean)
              .join(' · ')
              .slice(0, 180);
            return {
              id: `servico-${linha.id}`,
              titulo,
              detalhe,
              tipo: 'Serviço',
              rota: `/servicos?search=${encodeURIComponent(titulo)}`,
              relevancia: relevanciaPesquisa(textoSeguro, `${titulo} ${detalhe}`),
            };
          })
          .filter((item) => item.relevancia > 0)
          .sort((a, b) => b.relevancia - a.relevancia)
          .slice(0, 6);
      })(),
    );
  if (permitir(acesso, 'agendamentos', 'visualizar'))
    tarefas.push(
      (async () => {
        const { data: registros, error } = await db
          .from('agendamento')
          .select('id_agendamento,id_cliente,id_moto,data_hora,servico_solicitado,status')
          .order('data_hora', { ascending: false })
          .limit(1000);
        if (error) throw error;
        const linhas = registros ?? [];
        const clientesIds = [...new Set(linhas.map((linha) => linha.id_cliente))];
        const motosIds = [...new Set(linhas.map((linha) => linha.id_moto))];
        const [clientes, motos] = await Promise.all([
          clientesIds.length
            ? db.from('cliente').select('id_cliente,nome,telefone').in('id_cliente', clientesIds)
            : Promise.resolve({ data: [], error: null }),
          motosIds.length
            ? db.from('moto').select('id_moto,modelo,placa').in('id_moto', motosIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (clientes.error || motos.error) throw clientes.error || motos.error;
        const clientePorId = new Map((clientes.data ?? []).map((item) => [item.id_cliente, item]));
        const motoPorId = new Map((motos.data ?? []).map((item) => [item.id_moto, item]));
        return linhas
          .map((linha) => {
            const cliente = clientePorId.get(linha.id_cliente);
            const moto = motoPorId.get(linha.id_moto);
            const titulo = String(cliente?.nome ?? 'Agendamento');
            const detalhe = [
              cliente?.telefone,
              moto?.modelo,
              moto?.placa,
              linha.servico_solicitado,
              linha.data_hora,
              linha.status,
            ]
              .filter(Boolean)
              .join(' · ')
              .slice(0, 180);
            return {
              id: `agendamento-${linha.id_agendamento}`,
              titulo,
              detalhe,
              tipo: 'Agendamento',
              rota: `/agendamentos?search=${encodeURIComponent(titulo)}`,
              relevancia: relevanciaPesquisa(textoSeguro, `${titulo} ${detalhe}`),
            };
          })
          .filter((item) => item.relevancia > 0)
          .sort((a, b) => b.relevancia - a.relevancia)
          .slice(0, 6);
      })(),
    );
  const resultados = await Promise.allSettled(tarefas);
  if (resultados.length && resultados.every((item) => item.status === 'rejected'))
    throw new Error('Pesquisa indisponível.');
  return {
    itens: resultados
      .flatMap((item) => (item.status === 'fulfilled' ? item.value : []))
      .sort((a, b) => b.relevancia - a.relevancia)
      .slice(0, 20),
    incompleta: resultados.some((item) => item.status === 'rejected'),
  };
}
export function rotasPesquisaGeral(
  autorizar: (req: Request, res: Response) => Promise<SupabaseClient | null>,
) {
  const router = Router();
  router.get('/', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const consulta = consultaPesquisaGeral.safeParse(req.query.q);
    if (!consulta.success)
      return res.status(400).json({ message: 'Digite entre 2 e 100 caracteres.' });
    try {
      return res.json(await pesquisarGeral(db, res.locals.acesso, consulta.data));
    } catch {
      return res
        .status(503)
        .json({ message: 'Não foi possível pesquisar agora. Tente novamente.' });
    }
  });
  return router;
}
