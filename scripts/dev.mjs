import { spawn, spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Instalações interrompidas podem deixar o pacote presente, mas sem arquivos internos
// (por exemplo zod/v4/classic/external.js). Verificamos a importação real antes
// de abrir o Vite e a API; npm ci reconstitui node_modules pelo lockfile.
for (const [label, prefix, modules] of [
  ['API', 'server', ['zod', 'tsx', '@supabase/supabase-js', 'express', 'dotenv']],
  ['Web', 'client', ['vite', '@vitejs/plugin-react', 'react']],
]) {
  const verify = () => spawnSync(process.execPath,
    ['--input-type=module', '-e', `await Promise.all(${JSON.stringify(modules)}.map(name => import(name)))`],
    { cwd: prefix, stdio: 'ignore' }).status === 0;
  if (verify()) continue;
  console.log(`${label}: dependências ausentes ou incompletas. Restaurando com npm ci...`);
  const installed = spawnSync(npm, ['--prefix', prefix, 'ci', '--no-audit', '--no-fund'], { stdio: 'inherit' });
  if (installed.status !== 0 || !verify()) {
    console.error(`${label}: não foi possível restaurar as dependências. Confira a conexão e execute npm --prefix ${prefix} ci.`);
    process.exit(1);
  }
  console.log(`${label}: dependências restauradas.`);
}

const check = spawnSync(process.execPath, ['server/scripts/verificar-ambiente.mjs'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);

const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch { /* O processo já foi encerrado. */ }
  }
  process.exitCode = code;
}

for (const [label, prefix] of [['API', 'server'], ['Web', 'client']]) {
  const child = spawn(npm, ['--prefix', prefix, 'run', 'dev'], {
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  children.push(child);
  child.on('error', error => { console.error(`${label}: ${error.message}`); stop(1); });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${label} encerrou (${signal ?? `código ${code}`}). Os dois serviços precisam estar ativos.`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(url, init, status) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(1_000) });
    return response.status === status && (response.headers.get('content-type') ?? '').includes('application/json');
  } catch { return false; }
}

for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
  const api = await ready('http://localhost:3001/health', {}, 200);
  const proxy = api && await ready('http://localhost:5173/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }, 400);
  if (proxy) {
    console.log('API e site prontos; proxy do login validado. Abra o endereço do painel exibido na configuração acima.');
    break;
  }
  if (attempt === 29) {
    console.error('O login pelo proxy não respondeu em JSON. Confira os erros acima e as portas 3001/5173.');
    stop(1);
  } else await pause(500);
}
