import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  symlinkSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const raiz = fileURLToPath(new URL('../../', import.meta.url));

test('comandos npm apontam para arquivos existentes no pacote', () => {
  for (const pasta of ['', 'server', 'client']) {
    const base = join(raiz, pasta);
    const pacote = JSON.parse(readFileSync(join(base, 'package.json'), 'utf8'));
    for (const [nome, comando] of Object.entries(pacote.scripts || {})) {
      const caminhos =
        comando.match(
          /(?<![\w./-])(?:\.\/)?(?:(?:client|server)\/)?(?:scripts|src|dist)\/[\w./-]+\.(?:mjs|mts|ts|js)\b/g,
        ) || [];
      for (const caminho of caminhos) {
        if (caminho.startsWith('dist/')) continue;
        assert.ok(
          existsSync(join(base, caminho)),
          `${pasta || 'raiz'}: ${nome} aponta para ${caminho}, que nao existe`,
        );
      }
    }
  }
  const launcher = readFileSync(join(raiz, 'scripts/dev.mjs'), 'utf8');
  const verificador = launcher.match(/\['(server\/scripts\/[^']+\.mjs)'\]/)?.[1];
  assert.ok(verificador, 'O comando dev precisa chamar o verificador de ambiente');
  assert.ok(existsSync(join(raiz, verificador)), `Verificador ausente: ${verificador}`);
});

test('npm dev valida dependencias e ambiente em pasta com espacos sem iniciar servicos', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'estacao inicializacao '));
  try {
    for (const arquivo of [
      'scripts/dev.mjs',
      'server/scripts/verificar-ambiente.mjs',
      'server/scripts/env.mjs',
      'server/scripts/url-cliente.mjs',
    ]) {
      const destino = join(pasta, arquivo);
      mkdirSync(dirname(destino), { recursive: true });
      copyFileSync(join(raiz, arquivo), destino);
    }
    mkdirSync(join(pasta, 'client'), { recursive: true });
    for (const projeto of ['server', 'client'])
      symlinkSync(
        join(raiz, projeto, 'node_modules'),
        join(pasta, projeto, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    writeFileSync(
      join(pasta, 'server', '.env'),
      'SUPABASE_URL=https://exemplo.supabase.co\nSUPABASE_PUBLISHABLE_KEY=sb_publishable_teste\nSUPABASE_SECRET_KEY=sb_secret_teste\nCLIENT_URL=http://localhost:5173\n',
    );
    const resultado = spawnSync(process.execPath, ['scripts/dev.mjs', '--check'], {
      cwd: pasta,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(resultado.status, 0, resultado.stderr || resultado.error?.message);
    assert.match(resultado.stdout, /Configuração local encontrada/);
    assert.doesNotMatch(
      resultado.stdout + resultado.stderr,
      /sb_secret_teste|sb_publishable_teste|MODULE_NOT_FOUND/,
    );
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
