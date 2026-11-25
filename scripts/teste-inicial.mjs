const verificacoes = [
  { name: 'Servidor', url: 'http://localhost:3001/health', method: 'GET', expected: 200 },
  { name: 'Frontend', url: 'http://localhost:5173/', method: 'GET', expected: 200 },
  {
    name: 'Proxy do login',
    url: 'http://localhost:5173/api/auth/login',
    method: 'POST',
    expected: 400,
    body: '{}',
  },
];

let falhou = false;
for (const verificar of verificacoes) {
  try {
    const response = await fetch(verificar.url, {
      method: verificar.method,
      headers: verificar.body ? { 'Content-Type': 'application/json' } : undefined,
      body: verificar.body,
      signal: AbortSignal.timeout(5_000),
    });
    const tipoConteudo = response.headers.get('content-type') || '';
    const valido =
      response.status === verificar.expected &&
      (verificar.name !== 'Proxy do login' || tipoConteudo.includes('application/json'));
    console.log(`${valido ? 'OK' : 'FALHOU'}: ${verificar.name} (HTTP ${response.status})`);
    if (!valido) falhou = true;
  } catch {
    falhou = true;
    console.log(
      `FALHOU: ${verificar.name} não respondeu. Mantenha npm run dev aberto no mesmo Codespaces.`,
    );
  }
}

if (falhou) process.exitCode = 1;
