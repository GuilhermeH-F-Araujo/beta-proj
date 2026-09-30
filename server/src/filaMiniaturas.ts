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
  const { data: existing, error } = await db.from('motorcycle_thumbnail_jobs').select('id,status,next_retry_at').eq('model_key',key).maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.status === 'done' && !await getCachedModelPreview(db,model) && !isBundledModel(model)) {
      const { error: updateError } = await db.from('motorcycle_thumbnail_jobs').update({ status:'pending',next_retry_at:new Date().toISOString() }).eq('id',existing.id).eq('status','done');
      if (updateError) throw updateError;
      return { status:'pending',nextRetryAt:null };
    }
    return { status:existing.status as string,nextRetryAt:existing.next_retry_at as string | null };
  }
  const { error: insertError } = await db.from('motorcycle_thumbnail_jobs').insert({ model_key:key,model });
  if (insertError && insertError.code !== '23505') throw insertError;
  return { status:'pending',nextRetryAt:null };
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
      const { data,error }=await db.rpc('claim_motorcycle_thumbnail_job',{ p_worker:worker });
      if (error) throw error;
      const job=data?.[0];
      if (!job) return;
      let status:'done'|'retry'|'waiting_quota'|'needs_review'='done';
      let retryAt=new Date().toISOString();
      let message:string|null=null;
      try {
        if (!isBundledModel(job.model) && !await getCachedModelPreview(db,job.model)) {
          if (!await getCandidatePreview(db,job.model)) {
            const research=await pesquisarMotocicleta(job.model);
            const image=await generateModelCandidate(formatarNomeModeloMoto(job.model),{ notes:'',research:research?.matched ? `${research.title}: ${research.summary}` : '' });
            // Um administrador pode ter aprovado outra prévia enquanto a IA trabalhava.
            if (!await getCachedModelPreview(db,job.model)) await saveCandidatePreview(db,job.model,image);
          }
          status=await getCachedModelPreview(db,job.model) ? 'done' : 'needs_review';
        }
      } catch (failure) {
        const issue=failure instanceof ModelPreviewError ? failure : new ModelPreviewError('IMAGE_UNAVAILABLE',failure instanceof Error ? failure.message : 'Falha inesperada');
        message=`${issue.code}: ${issue.message}`;
        const quota=['IMAGE_AI_QUOTA','IMAGE_DAILY_LIMIT'].includes(issue.code);
        status=quota ? 'waiting_quota' : 'retry';
        const delay=quota ? Math.max(60_000,nextModelGenerationTime()-Date.now())
          : issue.code==='IMAGE_AI_NOT_CONFIGURED' ? 15*60_000
          : issue.code==='IMAGE_AI_INVALID_KEY' || issue.code==='IMAGE_AI_ACCESS' || issue.code==='IMAGE_AI_FAILURE' ? 60*60_000
          : Math.min(60*60_000,Math.max(60_000,2**Math.min(job.attempts,8)*30_000));
        retryAt=new Date(Date.now()+delay).toISOString();
        console.warn('[thumbnail-queue]',job.model,message);
      }
      const { data: finished,error: finishError }=await db.rpc('finish_motorcycle_thumbnail_job',{
        p_id:job.id,p_worker:worker,p_status:status,p_retry_at:retryAt,p_error:message,
      });
      if (finishError) throw finishError;
      if (!finished) console.warn('[thumbnail-queue] Job reclamado por outro worker:',job.id);
    } catch (error) {
      if ((error as {code?:string})?.code==='PGRST202') {
        schemaRetryAt=Date.now()+5*60_000;
        console.error('[thumbnail-queue] A migração SQL da fila não está disponível. Nova tentativa em 5 minutos.');
      } else console.error('[thumbnail-queue]',error instanceof Error ? error.message : error);
    }
    finally { busy=false; }
  };
  const scan=async () => {
    const db=createDb(); if (!db || Date.now()<schemaRetryAt) return;
    const { error }=await db.rpc('scan_motorcycle_thumbnail_jobs');
    if (error) {
      if (error.code==='PGRST202') schemaRetryAt=Date.now()+5*60_000;
      console.error('[thumbnail-queue/scan]',error.message);
    }
    void tick();
  };
  const fast=setInterval(() => void tick(),5_000);
  const slow=setInterval(() => void scan(),60*60_000);
  fast.unref();slow.unref();
  setTimeout(() => void scan(),2_000).unref();
  return () => { clearInterval(fast);clearInterval(slow); };
}
