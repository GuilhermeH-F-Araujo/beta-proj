import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getCachedModelPreview, getCandidatePreview, isBundledModel, modelImageProvider, isModelImageConfigured } from '../src/previaModelo.ts';
import { enfileirarModelo } from '../src/filaMiniaturas.ts';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet:true });
const orderFlag=process.argv.find(arg=>arg.startsWith('--order='));
const orderId=orderFlag ? Number(orderFlag.slice('--order='.length)) : null;
const {SUPABASE_URL,SUPABASE_SECRET_KEY}=process.env;
if(!isModelImageConfigured()) { console.error('Configure a conta de IA no server/.env.');process.exit(1); }
if(!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no server/.env.');process.exit(1); }
console.log(`Provedor: ${modelImageProvider()}; credenciais configuradas. Novas imagens exigem revisão.`);
if(!orderFlag) {console.log('Para consultar uma OS: npm --prefix server run doctor:image -- --order=55');process.exit(0);}
if(!Number.isSafeInteger(orderId) || orderId<1) {console.error('Use --order=NUMERO_DA_OS.');process.exit(1);}
const db=createClient(SUPABASE_URL,SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:order,error:orderError}=await db.from('ordem_servico').select('id_moto').eq('id_os',orderId).maybeSingle();
if(orderError || !order) {console.error(`OS #${orderId} não encontrada: ${orderError?.message || 'sem registro'}`);process.exit(1);}
const {data:moto,error:motoError}=await db.from('moto').select('modelo').eq('id_moto',order.id_moto).maybeSingle();
if(motoError || !moto?.modelo) {console.error('Modelo não encontrado.');process.exit(1);}
const model=moto.modelo;
if(await getCachedModelPreview(db,model)) console.log(`${model}: miniatura aprovada disponível.`);
else if(isBundledModel(model)) console.log(`${model}: miniatura incluída no catálogo.`);
else {
  const job=await enfileirarModelo(db,model);
  console.log(`${model}: ${job.status}${await getCandidatePreview(db,model) ? ' (prévia pendente de revisão)' : ''}. Abra a OS para revisar.`);
}
