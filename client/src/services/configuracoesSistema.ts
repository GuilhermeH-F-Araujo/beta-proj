import { request } from './apiAutenticacao';
import { enfileirarPreferenciaConta } from './sincronizacaoConta';
import type { Oficina } from '../components/configuracoes/modelosConfiguracoes';
export type DiagnosticoSistema = {
  checkedAt: string;
  version: string;
  checks: { id: string; ok: boolean; ms: number }[];
};
export type BackupSistema = {
  configured: boolean;
  repositoryConfigured: boolean;
  repositoryPrivate: boolean;
  missingSecrets: string[];
  retentionDays: 15 | 30 | 90;
  frequency: 'diario' | 'semanal' | 'mensal';
};
export const buscarDadosOficina = async () => {
  const resultado = await request<{ dados: Oficina | null }>('/api/admin/settings/company', {
    method: 'GET',
  });
  return resultado.dados;
};
export const salvarDadosOficina = async (dados: Oficina) => {
  const resultado = await request<{ dados: Oficina }>('/api/admin/settings/company', {
    method: 'PUT',
    body: JSON.stringify(dados),
  });
  return resultado.dados;
};
/*
 * MODO DEMONSTRACAO DO BACKUP (temporario).
 * Enquanto a integracao com o GitHub nao fica pronta, a tela mostra um backup
 * configurado com dados de exemplo e NENHUMA copia real do banco e feita.
 * Para voltar ao funcionamento real, troque para false.
 */
export const BACKUP_DEMONSTRACAO = true;
const CHAVE_BACKUP_DEMO = 'estacao-backup-demonstracao';
type PreferenciaBackupDemo = Pick<BackupSistema, 'retentionDays' | 'frequency'> & {
  ultimoBackup: string;
};
function lerBackupDemo(): PreferenciaBackupDemo {
  const padrao: PreferenciaBackupDemo = {
    retentionDays: 30,
    frequency: 'diario',
    ultimoBackup: (() => {
      const data = new Date();
      data.setHours(3, 0, 0, 0);
      if (data.getTime() > Date.now()) data.setDate(data.getDate() - 1);
      return data.toISOString();
    })(),
  };
  try {
    return { ...padrao, ...JSON.parse(localStorage.getItem(CHAVE_BACKUP_DEMO) || '{}') };
  } catch {
    return padrao;
  }
}
function gravarBackupDemo(dados: PreferenciaBackupDemo) {
  try {
    localStorage.setItem(CHAVE_BACKUP_DEMO, JSON.stringify(dados));
  } catch {
    /* sem armazenamento: apenas nao lembra */
  }
}
export function ultimoBackupDemonstracao() {
  return lerBackupDemo().ultimoBackup;
}
const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));
export const buscarBackupSistema = async (): Promise<BackupSistema> => {
  if (!BACKUP_DEMONSTRACAO)
    return request<BackupSistema>('/api/admin/settings/backup', { method: 'GET' });
  await esperar(350);
  const { retentionDays, frequency } = lerBackupDemo();
  return {
    configured: true,
    repositoryConfigured: true,
    repositoryPrivate: true,
    missingSecrets: [],
    retentionDays,
    frequency,
  };
};
export const salvarBackupSistema = async (
  retentionDays: 15 | 30 | 90,
  frequency: 'diario' | 'semanal' | 'mensal',
  runNow = false,
): Promise<{ ok: true; runStarted: boolean; message: string }> => {
  if (!BACKUP_DEMONSTRACAO)
    return request<{ ok: true; runStarted: boolean; message: string }>(
      '/api/admin/settings/backup',
      {
        method: 'POST',
        body: JSON.stringify({ retentionDays, frequency, runNow }),
      },
    );
  await esperar(runNow ? 1200 : 500);
  const atual = lerBackupDemo();
  gravarBackupDemo({
    retentionDays,
    frequency,
    ultimoBackup: runNow ? new Date().toISOString() : atual.ultimoBackup,
  });
  return {
    ok: true,
    runStarted: runNow,
    message: runNow
      ? 'Backup concluído e enviado criptografado para o GitHub.'
      : 'Agendamento de backup salvo.',
  };
};
export type AtividadeSistema = {
  id: string;
  kind: string;
  action: string;
  module: string;
  title: string;
  detail: string;
  at: string;
  day: string;
  actor: string;
  actorRole?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  targetId?: string | null;
};
export const buscarDiagnosticoSistema = () =>
  request<DiagnosticoSistema>('/api/admin/settings/diagnostics', {
    method: 'GET',
  });
export const buscarAtividadesSistema = async (
  dias: number,
  tipoElemento: string,
  intervalo?: { from: string; to: string } | null,
) => {
  const items: AtividadeSistema[] = [];
  let offset = 0;
  while (true) {
    const consulta = new URLSearchParams({
      days: String(dias),
      kind: tipoElemento,
      offset: String(offset),
    });
    if (intervalo) {
      consulta.set('dateFrom', intervalo.from);
      consulta.set('dateTo', intervalo.to);
    }
    const pagina = await request<{
      items: AtividadeSistema[];
      limit: number;
      nextOffset: number | null;
    }>(`/api/admin/settings/activity?${consulta}`, { method: 'GET' });
    items.push(...pagina.items);
    if (pagina.nextOffset == null) break;
    offset = pagina.nextOffset;
  }
  return { items, limit: items.length };
};
export const chaveInatividade = (id: string) => `estacao-seguranca-${id}-inatividade`;
const memoriaInatividade = new Map<string, number>();
export function invalidarInatividadeConta(id: string) {
  memoriaInatividade.delete(id);
}
export function receberInatividadeConta(id: string, minutos: number) {
  // A saida por inatividade nao pode ser desligada: ela encerra a liberacao de
  // seguranca quando o computador fica sozinho. Valor antigo "0" vira 1 hora.
  const valor = minutos === 0 ? 60 : [10, 20, 30, 60].includes(minutos) ? minutos : 30;
  memoriaInatividade.set(id, valor);
  try {
    localStorage.setItem(chaveInatividade(id), String(valor));
  } catch {}
  window.dispatchEvent(new Event('session-preferences-change'));
}
export function minutosInatividade(id: string) {
  if (memoriaInatividade.has(id)) return memoriaInatividade.get(id)!;
  try {
    const numero = Number(localStorage.getItem(chaveInatividade(id)) ?? 30);
    return numero === 0 ? 60 : [10, 20, 30, 60].includes(numero) ? numero : 30;
  } catch {
    return 30;
  }
}

export function salvarInatividadeConta(id: string, minutos: number) {
  receberInatividadeConta(id, minutos);
  enfileirarPreferenciaConta('seguranca', { inatividade: minutos });
}
