import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCachedModelPreview, getCandidatePreview, generateModelCandidate, saveCandidatePreview, isBundledModel, ModelPreviewError, nextModelGenerationTime } from './previaModelo.js';
import { formatarNomeModeloMoto, pesquisarMotocicleta } from './pesquisaModelo.js';

export function chaveModelo(model: string) {
  return model.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
}
export async function enfileirarModelo(db: SupabaseClient, model: string) {
  const key = chaveModelo(model);
  if (key.length < 2 || key.length > 100 || /[\r\n<>]/.test(model)) throw new Error('Modelo inválido.');
  const { data: existing, error } = await db.from('miniaturas_motos').select('id,status,tentar_em').eq('chave',key).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.status === 'concluido' && !await getCachedModelPreview(db,model) && !isBundledModel(model)) {
      const { error: updateError } = await db.from('miniaturas_motos').update({ status:'pendente',tentar_em:new Date().toISOString() }).eq('id',existing.id).eq('status','concluido');
      if (updateError) throw updateError;
      return { status:'pendente',nextRetryAt:null };
    }
    return { status:existing.status as string,nextRetryAt:existing.tentar_em as string | null };
  }
  const { error: insertError } = await db.from('miniaturas_motos').insert({ chave:key,modelo:model });
  if (insertError && insertError.code !== '23505') throw insertError;
  return { status:'pendente',nextRetryAt:null };
}

export function iniciarFilaMiniaturas(createDb: () => SupabaseClient | null) {
  let busy=false;
  let schemaRetryAt=0;
  const worker=randomUUID();
  const tick=async () => {
    if (busy || Date.now()<schemaRetryAt) return;
    const db=createDb();
    if (!db) return;
    busy=true;
    try {
      const { data,error }=await db.rpc('reservar_miniatura',{ p_executor:worker });
      if (error) throw error;
      const job=data?.[0];
      if (!job) return;
      let status:'concluido'|'tentar_novamente'|'aguardando_cota'|'aguardando_revisao'='concluido';
      let retryAt=new Date().toISOString();
      let message:string|null=null;
      try {
        if (!isBundledModel(job.modelo) && !await getCachedModelPreview(db,job.modelo)) {
          if (!await getCandidatePreview(db,job.modelo)) {
            const research=await pesquisarMotocicleta(job.modelo);
            const image=await generateModelCandidate(formatarNomeModeloMoto(job.modelo),{ notes:'',research:research?.matched ? `${research.title}: ${research.summary}` : '' });
            // Um administrador pode ter aprovado outra prévia enquanto a IA trabalhava.
            if (!await getCachedModelPreview(db,job.modelo)) await saveCandidatePreview(db,job.modelo,image);
          }
          status=await getCachedModelPreview(db,job.modelo) ? 'concluido' : 'aguardando_revisao';
        }
      } catch (failure) {
        const issue=failure instanceof ModelPreviewError ? failure : new ModelPreviewError('IMAGE_UNAVAILABLE',failure instanceof Error ? failure.message : 'Falha inesperada');
        message=`${issue.code}: ${issue.message}`;
        const quota=['IMAGE_AI_QUOTA','IMAGE_DAILY_LIMIT'].includes(issue.code);
        status=quota ? 'aguardando_cota' : 'tentar_novamente';
        const delay=quota ? Math.max(60_000,nextModelGenerationTime()-Date.now())
          : issue.code==='IMAGE_AI_NOT_CONFIGURED' ? 15*60_000
          : issue.code==='IMAGE_AI_INVALID_KEY' || issue.code==='IMAGE_AI_ACCESS' || issue.code==='IMAGE_AI_FAILURE' ? 60*60_000
          : Math.min(60*60_000,Math.max(60_000,2**Math.min(job.tentativas,8)*30_000));
        retryAt=new Date(Date.now()+delay).toISOString();
        console.warn('[fila-miniaturas]',job.modelo,message);
      }
      const { data: finished,error: finishError }=await db.rpc('finalizar_miniatura',{
        p_id:job.id,p_executor:worker,p_status:status,p_tentar_em:retryAt,p_erro:message,
      });
      if (finishError) throw finishError;
      if (!finished) console.warn('[fila-miniaturas] Trabalho reservado por outro processo:',job.id);
    } catch (error) {
      if ((error as {code?:string})?.code==='PGRST202') {
        schemaRetryAt=Date.now()+5*60_000;
        console.error('[fila-miniaturas] A migração SQL da fila não está disponível. Nova tentativa em 5 minutos.');
      } else console.error('[fila-miniaturas]',error instanceof Error ? error.message : error);
    }
    finally { busy=false; }
  };
  const scan=async () => {
    const db=createDb(); if (!db || Date.now()<schemaRetryAt) return;
    const { error }=await db.rpc('revisar_miniaturas');
    if (error) {
      if (error.code==='PGRST202') schemaRetryAt=Date.now()+5*60_000;
      console.error('[fila-miniaturas/scan]',error.message);
    }
    void tick();
  };
  const fast=setInterval(() => void tick(),5_000);
  const slow=setInterval(() => void scan(),60*60_000);
  fast.unref();slow.unref();
  setTimeout(() => void scan(),2_000).unref();
  return () => { clearInterval(fast);clearInterval(slow); };
}
