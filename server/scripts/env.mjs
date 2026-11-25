// Aceita os nomes anteriores para manter o ambiente ja configurado no Render.
const nomesAnteriores = {
  URL_SUPABASE: 'SUPABASE_URL',
  CHAVE_PUBLICA_SUPABASE: 'SUPABASE_PUBLISHABLE_KEY',
  CHAVE_PRIVADA_SUPABASE: 'SUPABASE_SECRET_KEY',
  URL_CLIENTE: 'CLIENT_URL',
  MINIATURAS_PROVEDOR: 'MODEL_IMAGE_PROVIDER',
  MINIATURAS_CONTAS_JSON: 'MODEL_IMAGE_ACCOUNTS_JSON',
  MINIATURAS_MODELO: 'MODEL_IMAGE_AI_MODEL',
  MINIATURAS_LIMITE_DIARIO: 'MODEL_IMAGE_DAILY_LIMIT',
  CLOUDFLARE_ID_CONTA: 'CLOUDFLARE_ACCOUNT_ID',
  CLOUDFLARE_TOKEN_API: 'CLOUDFLARE_API_TOKEN',
  OPENAI_CHAVE_API: 'OPENAI_API_KEY',
};

export function getEnv(entrada = process.env) {
  const ambiente = { ...entrada };
  for (const [nome, anterior] of Object.entries(nomesAnteriores)) {
    // Um nome vazio (ex.: CLOUDFLARE_ID_CONTA=) nao pode apagar o outro preenchido.
    const atual = typeof entrada[nome] === 'string' ? entrada[nome].trim() : entrada[nome];
    const alternativo =
      typeof entrada[anterior] === 'string' ? entrada[anterior].trim() : entrada[anterior];
    ambiente[nome] = atual
      ? entrada[nome]
      : alternativo
        ? entrada[anterior]
        : (atual ?? alternativo);
  }
  if (!ambiente.CHAVE_PRIVADA_SUPABASE)
    ambiente.CHAVE_PRIVADA_SUPABASE = entrada.SUPABASE_SERVICE_ROLE_KEY;
  // Os dois formatos apontam para o mesmo valor, inclusive em ambientes existentes.
  for (const [nome, anterior] of Object.entries(nomesAnteriores)) {
    ambiente[anterior] = ambiente[nome];
  }
  return ambiente;
}
