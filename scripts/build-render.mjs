import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const path of ['server/src/index.ts', 'server/tsconfig.json', 'server/package-lock.json', 'client/src/main.tsx', 'client/package-lock.json']) {
  if (!existsSync(new URL('../' + path, import.meta.url))) {
    console.error('Arquivo obrigatório ausente: ' + path + '. Envie o projeto completo ao GitHub e use a raiz do projeto como Root Directory no Render.');
    process.exit(1);
  }
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const args of [
  ['--prefix', 'server', 'ci', '--include=dev'],
  ['--prefix', 'client', 'ci', '--include=dev'],
  ['run', 'build'],
]) {
  const result = spawnSync(npm, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
