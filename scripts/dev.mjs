import { spawn, spawnSync } from 'node:child_process';

const sistemaEhWindows = process.platform === 'win32';
const npmCli = process.env.npm_execpath;
const usarCliNpm = !!npmCli && /npm-cli\.js$/i.test(npmCli);
const npm = usarCliNpm ? process.execPath : sistemaEhWindows ? 'npm.cmd' : 'npm';
const argumentosNpm = usarCliNpm ? [npmCli] : [];
const usarShellNpm = sistemaEhWindows && !usarCliNpm;

// Verifica se as dependencias podem ser importadas.
// Caso estejam ausentes ou incompletas, restaura pelo package-lock.json.
for (const [rotulo, prefixo, modulos] of [
  [
    'API',
    'server',
    ['zod', 'tsx', '@supabase/supabase-js', 'express', 'dotenv', 'sharp', 'cheerio'],
  ],
  ['Web', 'client', ['vite', '@vitejs/plugin-react', 'react']],
]) {
  const verificarDependencias = () => {
    const resultado = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await Promise.all(${JSON.stringify(modulos)}.map(nome => import(nome)))`,
      ],
      {
        cwd: prefixo,
        stdio: 'ignore',
      },
    );

    return !resultado.error && resultado.status === 0;
  };

  if (verificarDependencias()) continue;

  console.log(`${rotulo}: dependências ausentes ou incompletas. Restaurando com npm ci...`);

  const instalado = spawnSync(
    npm,
    [...argumentosNpm, '--prefix', prefixo, 'ci', '--no-audit', '--no-fund'],
    {
      stdio: 'inherit',
      shell: usarShellNpm,
    },
  );

  if (instalado.error) {
    console.error(`${rotulo}: erro ao executar npm ci: ${instalado.error.message}`);
    process.exit(1);
  }

  if (instalado.status !== 0 || !verificarDependencias()) {
    console.error(
      `${rotulo}: não foi possível restaurar as dependências. ` +
        `Confira a conexão e execute npm --prefix ${prefixo} ci.`,
    );
    process.exit(1);
  }

  console.log(`${rotulo}: dependências restauradas.`);
}

// Confere a configuracao local antes de iniciar os servicos.
const verificar = spawnSync(process.execPath, ['server/scripts/verificar-ambiente.mjs'], {
  stdio: 'inherit',
});

if (verificar.error) {
  console.error(`Não foi possível verificar o ambiente: ${verificar.error.message}`);
  process.exit(1);
}

if (verificar.status !== 0) {
  process.exit(verificar.status ?? 1);
}

// Permite validar o preparo local sem abrir portas nem executar a fila.
if (process.argv.includes('--check')) process.exit(0);

const conteudo = [];
let encerrando = false;

function parar(codigo = 0) {
  if (encerrando) return;

  encerrando = true;
  process.exitCode = codigo;

  for (const filho of conteudo) {
    if (!filho.pid) continue;

    try {
      if (sistemaEhWindows) {
        // Encerra tambem os processos iniciados pelo npm.
        spawnSync('taskkill', ['/pid', String(filho.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-filho.pid, 'SIGTERM');
      }
    } catch {
      // O processo pode ja ter sido encerrado.
    }
  }
}

// Inicia a API e o painel.
for (const [rotulo, prefixo] of [
  ['API', 'server'],
  ['Web', 'client'],
]) {
  let filho;

  try {
    filho = spawn(npm, [...argumentosNpm, '--prefix', prefixo, 'run', 'dev'], {
      stdio: 'inherit',
      shell: usarShellNpm,
      detached: !sistemaEhWindows,
    });
  } catch (erro) {
    console.error(`${rotulo}: ${erro.message}`);
    parar(1);
    break;
  }

  conteudo.push(filho);

  filho.on('error', (erro) => {
    console.error(`${rotulo}: ${erro.message}`);
    parar(1);
  });

  filho.on('exit', (codigo, sinal) => {
    if (encerrando) return;

    console.error(
      `${rotulo} encerrou (${sinal ?? `código ${codigo}`}). ` +
        'Os dois serviços precisam estar ativos.',
    );

    parar(codigo || 1);
  });
}

process.on('SIGINT', () => parar());
process.on('SIGTERM', () => parar());

const pausar = (milissegundos) => new Promise((resolver) => setTimeout(resolver, milissegundos));

async function pronto(url, inicializacao, situacao) {
  try {
    const response = await fetch(url, {
      ...inicializacao,
      signal: AbortSignal.timeout(1_000),
    });

    return (
      response.status === situacao &&
      (response.headers.get('content-type') ?? '').includes('application/json')
    );
  } catch {
    return false;
  }
}

// Aguarda a API e verifica se o painel encaminha as chamadas corretamente.
for (let tentativa = 0; tentativa < 30 && !encerrando; tentativa++) {
  const api = await pronto('http://localhost:3001/health', {}, 200);

  if (encerrando) break;

  // Valide o proxy sem enviar um login propositalmente inválido. O POST /login
  // retornava 400 corretamente, mas poluía o console como se fosse falha real.
  const proxy = api && (await pronto('http://localhost:5173/health', {}, 200));

  if (encerrando) break;

  if (proxy) {
    console.log('API e site prontos; proxy do login validado. ' + 'Abra http://localhost:5173');
    break;
  }

  if (tentativa === 29) {
    console.error(
      'O login pelo proxy não respondeu em JSON. ' +
        'Confira os erros acima e as portas 3001/5173.',
    );
    parar(1);
  } else {
    await pausar(500);
  }
}
