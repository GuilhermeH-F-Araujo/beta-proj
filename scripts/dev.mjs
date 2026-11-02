import { spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

// Verifica se as dependências podem ser importadas.
// Caso estejam ausentes ou incompletas, restaura pelo package-lock.json.
for (const [label, prefix, modules] of [
  ['API', 'server', ['zod', 'tsx', '@supabase/supabase-js', 'express', 'dotenv']],
  ['Web', 'client', ['vite', '@vitejs/plugin-react', 'react']],
]) {
  const verify = () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await Promise.all(${JSON.stringify(modules)}.map(name => import(name)))`,
      ],
      {
        cwd: prefix,
        stdio: 'ignore',
      },
    );

    return !result.error && result.status === 0;
  };

  if (verify()) continue;

  console.log(
    `${label}: dependências ausentes ou incompletas. Restaurando com npm ci...`,
  );

  const installed = spawnSync(
    npm,
    ['--prefix', prefix, 'ci', '--no-audit', '--no-fund'],
    {
      stdio: 'inherit',
      shell: isWindows,
    },
  );

  if (installed.error) {
    console.error(
      `${label}: erro ao executar npm ci: ${installed.error.message}`,
    );
    process.exit(1);
  }

  if (installed.status !== 0 || !verify()) {
    console.error(
      `${label}: não foi possível restaurar as dependências. ` +
      `Confira a conexão e execute npm --prefix ${prefix} ci.`,
    );
    process.exit(1);
  }

  console.log(`${label}: dependências restauradas.`);
}

// Confere a configuração local antes de iniciar os serviços.
const check = spawnSync(
  process.execPath,
  ['server/scripts/verificar-ambiente.mjs'],
  {
    stdio: 'inherit',
  },
);

if (check.error) {
  console.error(
    `Não foi possível verificar o ambiente: ${check.error.message}`,
  );
  process.exit(1);
}

if (check.status !== 0) {
  process.exit(check.status ?? 1);
}

const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;

  stopping = true;
  process.exitCode = code;

  for (const child of children) {
    if (!child.pid) continue;

    try {
      if (isWindows) {
        // Encerra também os processos iniciados pelo npm.
        spawnSync(
          'taskkill',
          ['/pid', String(child.pid), '/T', '/F'],
          { stdio: 'ignore' },
        );
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      // O processo pode já ter sido encerrado.
    }
  }
}

// Inicia a API e o painel.
for (const [label, prefix] of [
  ['API', 'server'],
  ['Web', 'client'],
]) {
  let child;

  try {
    child = spawn(
      npm,
      ['--prefix', prefix, 'run', 'dev'],
      {
        stdio: 'inherit',
        shell: isWindows,
        detached: !isWindows,
      },
    );
  } catch (error) {
    console.error(`${label}: ${error.message}`);
    stop(1);
    break;
  }

  children.push(child);

  child.on('error', error => {
    console.error(`${label}: ${error.message}`);
    stop(1);
  });

  child.on('exit', (code, signal) => {
    if (stopping) return;

    console.error(
      `${label} encerrou (${signal ?? `código ${code}`}). ` +
      'Os dois serviços precisam estar ativos.',
    );

    stop(code || 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ready(url, init, status) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(1_000),
    });

    return (
      response.status === status &&
      (response.headers.get('content-type') ?? '').includes('application/json')
    );
  } catch {
    return false;
  }
}

// Aguarda a API e verifica se o painel encaminha as chamadas corretamente.
for (let attempt = 0; attempt < 30 && !stopping; attempt++) {
  const api = await ready(
    'http://localhost:3001/health',
    {},
    200,
  );

  if (stopping) break;

  const proxy = api && await ready(
    'http://localhost:5173/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
    400,
  );

  if (stopping) break;

  if (proxy) {
    console.log(
      'API e site prontos; proxy do login validado. ' +
      'Abra http://localhost:5173',
    );
    break;
  }

  if (attempt === 29) {
    console.error(
      'O login pelo proxy não respondeu em JSON. ' +
      'Confira os erros acima e as portas 3001/5173.',
    );
    stop(1);
  } else {
    await pause(500);
  }
}