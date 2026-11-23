import { createSupabaseAdmin } from '../config/conexao.js';
import { iniciarCentralMiniaturas } from './fila.js';
// Processo dedicado opcional. Nao abre porta HTTP e recupera tarefas persistidas.
const parar = iniciarCentralMiniaturas(createSupabaseAdmin);
const manterAtivo = setInterval(() => {}, 60_000);
function encerrar() {
  parar();
  clearInterval(manterAtivo);
  process.exitCode = 0;
}
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
