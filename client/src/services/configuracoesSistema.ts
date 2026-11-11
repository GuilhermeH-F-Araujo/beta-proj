import { enfileirarPreferenciaConta } from './sincronizacaoConta';
import { request } from "./apiAutenticacao";
export type DiagnosticoSistema = {
  checkedAt: string;
  version: string;
  checks: { id: string; ok: boolean; ms: number }[];
};
export type AtividadeSistema = {
  id: string;
  kind: string;
  targetId: number;
  title: string;
  detail: string;
  at: string;
  actor: string;
  actorRole?:string|null;
  ip?:string|null;
};
export const buscarDiagnosticoSistema = () =>
  request<DiagnosticoSistema>("/api/admin/settings/diagnostics", {
    method: "GET",
  });
export const buscarAtividadesSistema = (days:number,kind:string,range?:{from:string;to:string}|null) => {
 const query=new URLSearchParams({days:String(days),kind});if(range){query.set('dateFrom',range.from);query.set('dateTo',range.to)}
 return request<{items:AtividadeSistema[];limit:number}>(`/api/admin/settings/activity?${query}`,{method:'GET'});
};
export const chaveInatividade = (id: string) =>
  `estacao-seguranca-${id}-inatividade`;
const memoriaInatividade=new Map<string,number>();
export function invalidarInatividadeConta(id:string){memoriaInatividade.delete(id);}
export function receberInatividadeConta(id:string,minutos:number){const value=[0,10,20,30,60].includes(minutos)?minutos:30;memoriaInatividade.set(id,value);try{localStorage.setItem(chaveInatividade(id),String(value))}catch{}window.dispatchEvent(new Event("session-preferences-change"));}
export function minutosInatividade(id: string) {
  if(memoriaInatividade.has(id))return memoriaInatividade.get(id)!;
  try {
    const n = Number(localStorage.getItem(chaveInatividade(id)) ?? 30);
    return [0, 10, 20, 30, 60].includes(n) ? n : 30;
  } catch {
    return 30;
  }
}

export function salvarInatividadeConta(id:string,minutos:number){receberInatividadeConta(id,minutos);enfileirarPreferenciaConta('seguranca',{inatividade:minutos});}
