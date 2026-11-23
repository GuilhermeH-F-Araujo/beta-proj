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
export const buscarBackupSistema = () =>
  request<BackupSistema>('/api/admin/settings/backup', { method: 'GET' });
export const salvarBackupSistema = (
  retentionDays: 15 | 30 | 90,
  frequency: 'diario' | 'semanal' | 'mensal',
  runNow = false,
) =>
  request<{ ok: true; runStarted: boolean; message: string }>('/api/admin/settings/backup', {
    method: 'POST',
    body: JSON.stringify({ retentionDays, frequency, runNow }),
  });
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
  const valor = [0, 10, 20, 30, 60].includes(minutos) ? minutos : 30;
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
    return [0, 10, 20, 30, 60].includes(numero) ? numero : 30;
  } catch {
    return 30;
  }
}

export function salvarInatividadeConta(id: string, minutos: number) {
  receberInatividadeConta(id, minutos);
  enfileirarPreferenciaConta('seguranca', { inatividade: minutos });
}
