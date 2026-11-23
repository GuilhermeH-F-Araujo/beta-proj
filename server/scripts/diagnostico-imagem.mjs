import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  obterPreviaModeloEmMemoria,
  obterPreviaCandidata,
  modeloIncluidoNoProjeto,
  modeloImagemProvedor,
  imagemModeloConfigurada,
} from '../src/previaModelo.ts';
import { enfileirarModelo } from '../src/filaMiniaturas.ts';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const ordemFlag = process.argv.find((argumento) => argumento.startsWith('--order='));
const idOrdem = ordemFlag ? Number(ordemFlag.slice('--order='.length)) : null;
const { SUPABASE_URL: SUPABASE_URL, SUPABASE_SECRET_KEY: SUPABASE_SECRET_KEY } = process.env;
if (!imagemModeloConfigurada()) {
  console.error('Configure a conta de IA no server/.env.');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY no server/.env.');
  process.exit(1);
}
console.log(
  `Provedor: ${modeloImagemProvedor()}; credenciais configuradas. Novas imagens exigem revisão.`,
);
if (!ordemFlag) {
  console.log('Para consultar uma OS: npm --prefix server run doctor:image -- --order=55');
  process.exit(0);
}
if (!Number.isSafeInteger(idOrdem) || idOrdem < 1) {
  console.error('Use --order=NUMERO_DA_OS.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: ordem, error: ordemErro } = await db
  .from('ordem_servico')
  .select('id_moto')
  .eq('id_os', idOrdem)
  .maybeSingle();
if (ordemErro || !ordem) {
  console.error(`OS #${idOrdem} não encontrada: ${ordemErro?.message || 'sem registro'}`);
  process.exit(1);
}
const { data: moto, error: motoErro } = await db
  .from('moto')
  .select('modelo')
  .eq('id_moto', ordem.id_moto)
  .maybeSingle();
if (motoErro || !moto?.modelo) {
  console.error('Modelo não encontrado.');
  process.exit(1);
}
const modeloLocal = moto.modelo;
if (await obterPreviaModeloEmMemoria(db, modeloLocal))
  console.log(`${modeloLocal}: miniatura aprovada disponível.`);
else if (modeloIncluidoNoProjeto(modeloLocal))
  console.log(`${modeloLocal}: miniatura incluída no catálogo.`);
else {
  const tarefa = await enfileirarModelo(db, modeloLocal);
  console.log(
    `${modeloLocal}: ${tarefa.status}${(await obterPreviaCandidata(db, modeloLocal)) ? ' (prévia pendente de revisão)' : ''}. Abra a OS para revisar.`,
  );
}
