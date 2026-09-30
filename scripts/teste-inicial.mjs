const checks = [
  { name: 'Servidor', url: 'http://localhost:3001/health', method: 'GET', expected: 200 },
  { name: 'Frontend', url: 'http://localhost:5173/', method: 'GET', expected: 200 },
  { name: 'Proxy do login', url: 'http://localhost:5173/api/auth/login', method: 'POST', expected: 400, body: '{}' },
];

let failed = false;
for (const check of checks) {
  try {
    const response = await fetch(check.url, {
      method: check.method,
      headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
      body: check.body,
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = response.headers.get('content-type') || '';
    const valid = response.status === check.expected &&
      (check.name !== 'Proxy do login' || contentType.includes('application/json'));
    console.log(`${valid ? 'OK' : 'FALHOU'}: ${check.name} (HTTP ${response.status})`);
    if (!valid) failed = true;
  } catch {
    failed = true;
    console.log(`FALHOU: ${check.name} não respondeu. Mantenha npm run dev aberto no mesmo Codespaces.`);
  }
}

if (failed) process.exitCode = 1;
