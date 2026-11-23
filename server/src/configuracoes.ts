import type { SupabaseClient } from '@supabase/supabase-js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { registrarAtividade } from './services/logs.js';
type Autorizar = (req: Request, res: Response) => Promise<SupabaseClient | null>;
const acoesLog: Record<string, string> = {
  status: 'Status alterado',
  edicao: 'Informações atualizadas',
  exclusao: 'Registro removido',
  exclusão: 'Registro removido',
  arquivar: 'Cliente arquivado',
  cliente_arquivado: 'Cliente arquivado',
  cliente_criado: 'Cliente adicionado',
  cliente_atualizado: 'Cadastro de cliente atualizado',
  funcionario_cadastrado: 'Pessoa adicionada à equipe',
  funcionario_alterado: 'Cadastro da equipe atualizado',
  ordem_criada: 'Ordem de serviço criada',
  motocicleta_criada: 'Motocicleta adicionada',
  motocicleta_atualizada: 'Cadastro da motocicleta atualizado',
  agendamento_criado: 'Agendamento criado',
  agendamento_atualizado: 'Agendamento atualizado',
  agendamento_removido: 'Agendamento removido',
  catalogo_servicos_atualizado: 'Catálogo de serviços atualizado',
  solicitacao_administrador_aprovado: 'Acesso administrativo aprovado',
  solicitacao_administrador_recusado: 'Acesso administrativo recusado',
  nivel_administrador: 'Acesso de administrador definido',
  nivel_superadministrador: 'Acesso de superadministrador definido',
  nivel_recusado: 'Solicitação de acesso recusada',
  senha_confirmada: 'Identidade confirmada',
  senha_confirmacao_incorreta: 'Confirmação de identidade recusada',
  identidade_confirmada: 'Identidade confirmada',
  confirmacao_identidade_recusada: 'Confirmação de identidade recusada',
  autenticador_google_ativado: 'Autenticador ativado',
  backup_banco_configurado: 'Agendamento do backup atualizado',
  backup_banco_iniciado: 'Backup do banco iniciado',
  senha_alterada: 'Senha de acesso alterada',
  administrador_solicitado: 'Acesso administrativo solicitado',
  pagamento_confirmado: 'Pagamento confirmado',
  pagamento_desfeito: 'Confirmação de pagamento desfeita',
};
const rotuloAcao = (evento: string) =>
  acoesLog[evento] ||
  evento.replaceAll('_', ' ').replace(/^./, (letra) => letra.toLocaleUpperCase('pt-BR'));
const dinheiro = (valor: unknown) =>
  typeof valor === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
    : '';

const retencoesBackup = [15, 30, 90] as const;
const frequenciasBackup = ['diario', 'semanal', 'mensal'] as const;
const dadosOficina = z
  .object({
    nome: z.string().max(120),
    cnpj: z.string().max(24),
    telefone: z.string().max(30),
    email: z.string().max(180),
    cep: z.string().max(12),
    numero: z.string().max(30).optional(),
    complemento: z.string().max(100).optional(),
    endereco: z.string().max(180),
    bairro: z.string().max(100),
    cidade: z.string().max(100),
    estado: z.string().max(2),
    semana: z.string().max(80),
    sabado: z.string().max(80),
  })
  .strict();
const repositorioBackup = () => process.env.GITHUB_BACKUP_REPOSITORY?.trim() || '';
const tokenBackup = () => process.env.GITHUB_BACKUP_TOKEN?.trim() || '';

async function requisitarGithub(caminho: string, metodo = 'GET', corpo?: unknown) {
  const repositorio = repositorioBackup();
  const token = tokenBackup();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repositorio) || !token)
    throw new Error('BACKUP_GITHUB_NAO_CONFIGURADO');
  const resposta = await fetch(`https://api.github.com/repos/${repositorio}${caminho}`, {
    method: metodo,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const conteudo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 404) return { notFound: true };
    console.error('[settings/backup/github]', resposta.status);
    throw new Error('BACKUP_GITHUB_INDISPONIVEL');
  }
  return conteudo as Record<string, unknown>;
}

async function atualizarVariavelGithub(nome: string, valor: string) {
  const caminho = `/actions/variables/${nome}`;
  const atual = await requisitarGithub(caminho);
  const corpo = { name: nome, value: valor };
  if ('notFound' in atual) await requisitarGithub('/actions/variables', 'POST', corpo);
  else await requisitarGithub(caminho, 'PATCH', { value: valor });
}

async function lerConfiguracaoBackup() {
  if (!repositorioBackup() || !tokenBackup()) {
    return {
      configured: false,
      repositoryConfigured: false,
      repositoryPrivate: false,
      missingSecrets: ['SUPABASE_DB_URL', 'BACKUP_AGE_RECIPIENT'],
      retentionDays: 30,
      frequency: 'diario',
    };
  }
  const [repositorio, secrets, retencao, frequencia] = await Promise.all([
    requisitarGithub(''),
    requisitarGithub('/actions/secrets'),
    requisitarGithub('/actions/variables/BACKUP_RETENTION_DAYS'),
    requisitarGithub('/actions/variables/BACKUP_FREQUENCY'),
  ]);
  const nomesSegredos = new Set(
    Array.isArray(secrets.secrets)
      ? secrets.secrets.flatMap((item) =>
          typeof item === 'object' && item && 'name' in item && typeof item.name === 'string'
            ? [item.name]
            : [],
        )
      : [],
  );
  const missingSecrets = ['SUPABASE_DB_URL', 'BACKUP_AGE_RECIPIENT'].filter(
    (nome) => !nomesSegredos.has(nome),
  );
  const valorRetencao = Number(retencao.value);
  const valorFrequencia = String(frequencia.value || 'diario');
  return {
    configured: repositorio.private === true && missingSecrets.length === 0,
    repositoryConfigured: true,
    repositoryPrivate: repositorio.private === true,
    missingSecrets,
    retentionDays: retencoesBackup.includes(valorRetencao as (typeof retencoesBackup)[number])
      ? valorRetencao
      : 30,
    frequency: frequenciasBackup.includes(valorFrequencia as (typeof frequenciasBackup)[number])
      ? valorFrequencia
      : 'diario',
  };
}

export function rotasConfiguracoes(autorizar: Autorizar) {
  const roteador = Router();
  roteador.get('/company', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const { data, error } = await db
      .from('configuracao_oficina')
      .select('dados')
      .eq('id', true)
      .maybeSingle();
    if (error) return res.status(503).json({ message: 'Não foi possível carregar os dados da oficina.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ dados: data?.dados ?? null });
  });
  roteador.put('/company', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const entrada = dadosOficina.safeParse(req.body);
    if (!entrada.success)
      return res.status(400).json({ message: 'Confira os dados do perfil da oficina.' });
    const { data, error } = await db
      .from('configuracao_oficina')
      .upsert(
        {
          id: true,
          dados: entrada.data,
          atualizado_em: new Date().toISOString(),
          atualizado_por: res.locals.adminUserId,
        },
        { onConflict: 'id' },
      )
      .select('dados')
      .single();
    if (error) return res.status(503).json({ message: 'Não foi possível salvar os dados da oficina.' });
    return res.json({ dados: data.dados });
  });
  roteador.get('/diagnostics', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    try {
      const definicoes = [
        ['cadastros', 'cliente', 'id_cliente'],
        ['ordens', 'ordem_servico', 'id_os'],
        ['notificacoes', 'admin_notify', 'id,id_cliente'],
        ['logs', 'logs', 'id'],
      ] as const;
      const verificacoes = await Promise.all(
        definicoes.map(async ([id, tabela, colunas]) => {
          const inicio = Date.now();
          try {
            const { error: erro } = await db.from(tabela).select(colunas).limit(1);
            return { id, ok: !erro, ms: Date.now() - inicio };
          } catch {
            return { id, ok: false, ms: Date.now() - inicio };
          }
        }),
      );
      return res.json({
        checkedAt: new Date().toISOString(),
        checks: verificacoes,
        version: '1.0.0',
      });
    } catch {
      return res.status(503).json({ message: 'Não foi possível verificar os serviços.' });
    }
  });
  roteador.get('/activity', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    const dias = Number(req.query.days || 30);
    const tipoElemento = String(req.query.kind || 'all');
    const deslocamento = Number(req.query.offset || 0);
    if (
      ![7, 30, 90].includes(dias) ||
      !['all', 'os', 'clients'].includes(tipoElemento) ||
      !Number.isSafeInteger(deslocamento) ||
      deslocamento < 0 ||
      deslocamento > 100000
    )
      return res.status(400).json({ message: 'Escolha um período e uma categoria válidos.' });
    const origem = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : '';
    const destino = typeof req.query.dateTo === 'string' ? req.query.dateTo : '';
    const validoDados = (valor: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
      !Number.isNaN(Date.parse(valor + 'T12:00:00Z')) &&
      new Date(valor + 'T12:00:00Z').toISOString().slice(0, 10) === valor;
    if (
      (origem || destino) &&
      (!validoDados(origem) ||
        !validoDados(destino) ||
        origem > destino ||
        Date.parse(destino) - Date.parse(origem) > 366 * 86400000)
    )
      return res.status(400).json({ message: 'Escolha um intervalo válido de até um ano.' });
    try {
      const desde = origem
        ? origem + 'T00:00:00-03:00'
        : new Date(Date.now() - dias * 86400000).toISOString();
      const ate = destino
        ? new Date(Date.parse(destino + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) +
          'T00:00:00-03:00'
        : new Date().toISOString();
      const consulta = db
        .from('logs')
        .select(
          'id,categoria,entidade,entidade_id,id_os,id_cliente,nome,tipo,acao,motivo,evento,criado_em,dia,id_usuario,alvo,ator_nome,ator_cargo,alvo_nome,anterior,novo,texto,dados,resumo,ip,user_agent,request_id',
        )
        .neq('categoria', 'requisicao')
        .or('entidade.is.null,entidade.neq.requisicao_api')
        .or('entidade.is.null,entidade.neq.autenticacao')
        .gte('criado_em', desde)
        .lt('criado_em', ate)
        .order('criado_em', { ascending: false })
        .order('id', { ascending: false });
      if (tipoElemento === 'os') consulta.eq('entidade', 'ordem_servico');
      else if (tipoElemento === 'clients') consulta.eq('entidade', 'cliente');
      const { data: eventos, error } = await consulta.range(deslocamento, deslocamento + 499);
      if (error) throw error;
      const pessoas = [
        ...new Set(
          (eventos ?? [])
            .flatMap((item) => [item.id_usuario, item.alvo])
            .filter((id): id is string => typeof id === 'string' && !!id),
        ),
      ];
      const perfis = pessoas.length
        ? await db.from('funcionario').select('auth_user_id,nome,cargo').in('auth_user_id', pessoas)
        : { data: [], error: null };
      if (perfis.error) throw perfis.error;
      const nomes = new Map(
        (perfis.data || []).map((registroAtual) => [
          registroAtual.auth_user_id,
          registroAtual.nome,
        ]),
      );
      const cargos = new Map(
        (perfis.data || []).map((registroAtual) => [
          registroAtual.auth_user_id,
          registroAtual.cargo,
        ]),
      );
      const nomesAlvo = new Map(
        (perfis.data || []).map((registroAtual) => [
          registroAtual.auth_user_id,
          registroAtual.nome,
        ]),
      );
      const itens = (eventos ?? []).map((registro) => {
        const tipo = registro.tipo || registro.evento;
        const kind =
          registro.entidade === 'ordem_servico'
            ? 'os'
            : registro.entidade === 'cliente'
              ? 'clients'
              : registro.categoria;
        const modulos: Record<string, string> = {
          ordem_servico: 'Ordens de Serviço',
          cliente: 'Clientes',
          solicitacao_administrador: 'Segurança e acesso',
          funcionario: 'Funcionários',
          agendamento: 'Agendamentos',
          servicos: 'Serviços',
          motocicleta: 'Motocicletas',
          conta: 'Acesso à conta',
        };
        const module =
          modulos[registro.entidade || ''] ||
          (registro.categoria === 'seguranca' ? 'Segurança e acesso' : 'Sistema');
        const atorNome = registro.ator_nome || nomes.get(registro.id_usuario) || 'Sistema';
        const nomeAlvo =
          registro.alvo_nome ||
          (registro.alvo ? nomesAlvo.get(registro.alvo) : null) ||
          registro.nome ||
          registro.dados?.nome ||
          registro.dados?.modelo ||
          null;
        const acao = rotuloAcao(tipo);
        const title = registro.id_os
          ? `OS ${registro.id_os}: ${acao}`
          : registro.id_cliente
            ? `Cliente${nomeAlvo ? ` ${nomeAlvo}` : ''}: ${acao}`
            : nomeAlvo && ['seguranca', 'funcionario'].includes(registro.categoria)
              ? `${acao} · ${nomeAlvo}`
              : acao;
        const detail =
          registro.id_os && tipo === 'status'
            ? `De ${registro.anterior || 'sem status'} para ${registro.novo || 'novo status'}.${registro.texto ? ` ${registro.texto}` : ''}`
            : registro.id_os && tipo === 'edicao'
              ? 'As informações da ordem de serviço foram atualizadas.'
              : registro.id_os && tipo === 'exclusao'
                ? `OS removida. ${registro.dados?.ordem?.cliente ? `Cliente: ${registro.dados.ordem.cliente}.` : ''}${registro.dados?.motivo ? ` Motivo: ${registro.dados.motivo}` : ''}`
                : tipo === 'pagamento_confirmado' || tipo === 'pagamento_desfeito'
                  ? `${tipo === 'pagamento_confirmado' ? 'Pagamento confirmado' : 'Confirmação desfeita'}${dinheiro(registro.dados?.valor) ? `: ${dinheiro(registro.dados?.valor)}` : ''}${registro.dados?.forma ? ` · ${registro.dados.forma}` : ''}${registro.dados?.maquininha ? ` · ${registro.dados.maquininha}` : ''}`
                  : tipo === 'solicitacao_administrador_aprovado' ||
                      tipo === 'nivel_superadministrador'
                    ? `Acesso de ${nomeAlvo || 'um administrador'} aprovado.`
                    : tipo === 'solicitacao_administrador_recusado' || tipo === 'nivel_recusado'
                      ? `Solicitação de ${nomeAlvo || 'acesso administrativo'} recusada.`
                      : tipo === 'senha_confirmada'
                        ? 'A senha foi confirmada para uma ação protegida.'
                        : tipo === 'senha_confirmacao_incorreta'
                          ? 'A senha informada não foi confirmada.'
                          : registro.id_cliente && nomeAlvo
                            ? tipo === 'cliente_criado'
                              ? `Cadastro criado para ${nomeAlvo}.`
                              : tipo === 'arquivar' || tipo === 'cliente_arquivado'
                                ? `Cadastro de ${nomeAlvo} arquivado.${registro.motivo ? ` Motivo: ${registro.motivo}` : ''}`
                                : `Cadastro de ${nomeAlvo} atualizado.`
                            : tipo === 'motocicleta_atualizada'
                              ? `Cadastro de ${registro.dados?.modelo || 'motocicleta'} atualizado. Placa: ${registro.dados?.placa || 'não informada'}.`
                              : registro.entidade === 'motocicleta'
                                ? `${registro.dados?.modelo || 'Motocicleta'} adicionada à oficina. Placa: ${registro.dados?.placa || 'não informada'}.`
                                : tipo === 'catalogo_servicos_atualizado'
                                  ? `O catálogo foi atualizado com ${registro.dados?.quantidade_servicos ?? 'novos'} serviço(s).`
                                  : registro.texto ||
                                    registro.resumo ||
                                    `${acao} no módulo ${module}.`;
        return {
          id: String(registro.id),
          kind,
          action: acao,
          module,
          title,
          detail,
          at: registro.criado_em,
          day: registro.dia,
          actor: atorNome,
          actorRole: registro.ator_cargo || cargos.get(registro.id_usuario) || null,
          ip: registro.ip,
          userAgent: registro.user_agent,
          requestId: registro.request_id,
          targetId: registro.entidade_id,
        };
      });
      return res.json({
        items: itens,
        limit: 500,
        nextOffset: eventos?.length === 500 ? deslocamento + 500 : null,
      });
    } catch (erro) {
      console.error('[settings/activity]', erro);
      return res.status(503).json({
        message: 'Não foi possível consultar os registros. Tente novamente.',
      });
    }
  });
  roteador.get('/backup', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (res.locals.acesso?.nivel !== 'dono')
      return res.status(403).json({ message: 'Somente o dono pode gerenciar os backups.' });
    res.setHeader('Cache-Control', 'no-store');
    try {
      return res.json(await lerConfiguracaoBackup());
    } catch {
      return res.status(503).json({
        message: 'Não foi possível consultar a configuração de backup no GitHub.',
      });
    }
  });
  roteador.post('/backup', async (req, res) => {
    const db = await autorizar(req, res);
    if (!db) return;
    if (res.locals.acesso?.nivel !== 'dono')
      return res.status(403).json({ message: 'Somente o dono pode gerenciar os backups.' });
    const entrada = z
      .object({
        retentionDays: z.union([z.literal(15), z.literal(30), z.literal(90)]),
        frequency: z.enum(frequenciasBackup),
        runNow: z.boolean().default(false),
      })
      .strict()
      .safeParse(req.body);
    if (!entrada.success)
      return res.status(400).json({ message: 'Escolha uma frequência e retenção válidas.' });
    try {
      const estado = await lerConfiguracaoBackup();
      if (!estado.repositoryConfigured)
        return res.status(503).json({
          code: 'BACKUP_GITHUB_CONFIG_REQUIRED',
          message: 'Configure GITHUB_BACKUP_REPOSITORY e GITHUB_BACKUP_TOKEN no servidor.',
        });
      if (estado.repositoryPrivate === false && repositorioBackup() && tokenBackup())
        return res.status(400).json({
          message: 'O repositório do GitHub precisa ser privado para guardar os backups.',
        });
      if (estado.missingSecrets.length)
        return res.status(409).json({
          code: 'BACKUP_SECRETS_REQUIRED',
          message:
            'Adicione SUPABASE_DB_URL e BACKUP_AGE_RECIPIENT aos secrets do repositório privado.',
        });
      await Promise.all([
        atualizarVariavelGithub('BACKUP_RETENTION_DAYS', String(entrada.data.retentionDays)),
        atualizarVariavelGithub('BACKUP_FREQUENCY', entrada.data.frequency),
      ]);
      if (entrada.data.runNow) {
        await requisitarGithub('/actions/workflows/database-backup.yml/dispatches', 'POST', {
          ref: process.env.GITHUB_BACKUP_BRANCH?.trim() || 'main',
          inputs: { retention_days: String(entrada.data.retentionDays) },
        });
      }
      await registrarAtividade(
        db,
        {
          id_usuario: res.locals.adminUserId,
          evento: entrada.data.runNow ? 'backup_banco_iniciado' : 'backup_banco_configurado',
          categoria: 'seguranca',
          entidade: 'backup_banco',
          entidade_id: repositorioBackup(),
          acao: entrada.data.runNow ? 'backup_banco_iniciado' : 'backup_banco_configurado',
          resumo: entrada.data.runNow
            ? 'Backup do banco solicitado pelo painel.'
            : 'Agendamento e retenção do backup atualizados.',
          dados: {
            frequencia: entrada.data.frequency,
            retencao_dias: entrada.data.retentionDays,
            origem: 'GitHub Actions',
          },
        },
        req,
      );
      return res.json({
        ok: true,
        runStarted: entrada.data.runNow,
        retentionDays: entrada.data.retentionDays,
        frequency: entrada.data.frequency,
        message: entrada.data.runNow
          ? 'Backup solicitado. Acompanhe o andamento na aba GitHub Actions.'
          : 'Frequência e retenção salvas.',
      });
    } catch (erro) {
      const mensagem =
        erro instanceof Error && erro.message === 'BACKUP_GITHUB_NAO_CONFIGURADO'
          ? 'Configure GITHUB_BACKUP_REPOSITORY e GITHUB_BACKUP_TOKEN no servidor.'
          : 'Não foi possível atualizar o backup no GitHub. Confira o token e as permissões do repositório.';
      return res.status(503).json({ message: mensagem });
    }
  });
  return roteador;
}
