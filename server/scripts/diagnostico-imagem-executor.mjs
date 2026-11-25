import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const servidorDir = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pacotes = ['tsx', 'dotenv', '@supabase/supabase-js'];

if (
  pacotes.some(
    (nome) =>
      !existsSync(fileURLToPath(new URL(`../node_modules/${nome}/package.json`, import.meta.url))),
  )
) {
  console.log('Instalando as dependências do servidor para executar o diagnóstico...');
  const instalar = spawnSync(npm, ['ci', '--include=dev'], {
    cwd: servidorDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (instalar.error || instalar.status !== 0) {
    console.error(
      'Não foi possível instalar as dependências. Rode npm run install:all na raiz do projeto.',
    );
    process.exit(instalar.status || 1);
  }
}

const resultado = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'scripts/diagnostico-miniaturas.mjs', ...process.argv.slice(2)],
  {
    cwd: servidorDir,
    stdio: 'inherit',
  },
);
if (resultado.error)
  console.error('Não foi possível iniciar o diagnóstico:', resultado.error.message);
process.exit(resultado.status ?? 1);
