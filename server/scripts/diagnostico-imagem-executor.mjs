import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverDir = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packages = ['tsx', 'dotenv', '@supabase/supabase-js'];

if (packages.some(name => !existsSync(fileURLToPath(new URL(`../node_modules/${name}/package.json`, import.meta.url))))) {
  console.log('Instalando as dependências do servidor para executar o diagnóstico...');
  const install = spawnSync(npm, ['ci', '--include=dev'], { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' });
  if (install.error || install.status !== 0) {
    console.error('Não foi possível instalar as dependências. Rode npm run install:all na raiz do projeto.');
    process.exit(install.status || 1);
  }
}

const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/diagnostico-imagem.mjs', ...process.argv.slice(2)], {
  cwd: serverDir, stdio: 'inherit',
});
if (result.error) console.error('Não foi possível iniciar o diagnóstico:', result.error.message);
process.exit(result.status ?? 1);
