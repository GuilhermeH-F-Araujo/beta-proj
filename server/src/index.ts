import { createApp } from './app.js';
import { createSupabaseAdmin, PORT, SUPABASE_SECRET_KEY } from './config/conexao.js';
import { iniciarCentralMiniaturas } from './miniaturas/fila.js';
import { geracaoConfigurada } from './miniaturas/provedor.js';
import { iniciarEventosCatalogo } from './catalogoEventos.js';

const app = createApp();
app.listen(PORT, () => {
  if (!SUPABASE_SECRET_KEY) {
    console.warn(
      '[config] SUPABASE_SECRET_KEY ausente. Acrescente SUPABASE_SECRET_KEY=sb_secret_... em server/.env e reinicie o servidor; a listagem de OS ficará indisponível até lá. Rode npm run check:env na raiz para conferir sem exibir a chave.',
    );
  }
  console.log(`Servidor de autenticação ativo na porta ${PORT}.`);
  if (SUPABASE_SECRET_KEY) {
    iniciarCentralMiniaturas(createSupabaseAdmin);
    const banco = createSupabaseAdmin();
    if (banco) iniciarEventosCatalogo(banco);
  }
  if (!geracaoConfigurada() && process.env.MINIATURAS_PAUSAR_GERACAO !== 'true')
    console.warn(
      '[motorcycle-image] Configure o provedor de IA em server/.env; a fila aguardará as credenciais.',
    );
});
