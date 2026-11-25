import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const arquivosObrigatorios = [
  'scripts/dev.mjs',
  'server/scripts/verificar-ambiente.mjs',
  'server/scripts/env.mjs',
  'server/scripts/url-cliente.mjs',
  'server/src/index.ts',
  'server/tsconfig.json',
  'server/package-lock.json',
  'client/src/main.tsx',
  'client/src/App.tsx',
  'client/src/pages/Entrar.tsx',
  'client/src/pages/EsqueciSenha.tsx',
  'client/src/pages/RedefinirSenha.tsx',
  'client/src/pages/OrdensServico.tsx',
  'client/src/pages/DetalhesOrdem.tsx',
  'client/src/pages/HistoricoMotocicleta.tsx',
  'client/src/pages/Clientes.tsx',
  'client/src/pages/MeuPerfil.tsx',
  'client/src/pages/Motocicletas.tsx',
  'client/src/pages/Funcionarios.tsx',
  'client/src/pages/Agendamentos.tsx',
  'client/src/pages/Servicos.tsx',
  'client/src/pages/PainelInicial.tsx',
  'client/src/components/RotaProtegida.tsx',
  'client/src/components/ModalNovaOrdem.tsx',
  'client/src/components/ModalNovoUsuario.tsx',
  'client/src/components/PainelNotificacoes.tsx',
  'client/src/components/ElementosFuncionario.tsx',
  'client/src/services/funcionarios.ts',
  'client/package-lock.json',
];
for (const caminho of arquivosObrigatorios) {
  if (!existsSync(new URL('../' + caminho, import.meta.url))) {
    console.error(
      'Arquivo obrigatório ausente: ' +
        caminho +
        '. O projeto foi enviado incompleto ou extraído na pasta errada. Envie todo o conteúdo do ZIP para a raiz do repositório e configure a raiz do projeto como Root Directory no Render.',
    );
    process.exit(1);
  }
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const argumentos of [
  ['--prefix', 'server', 'ci', '--include=dev'],
  ['--prefix', 'client', 'ci', '--include=dev'],
  ['run', 'build'],
]) {
  const resultado = spawnSync(npm, argumentos, {
    cwd: raiz,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (resultado.error) console.error(resultado.error.message);
  if (resultado.status !== 0) process.exit(resultado.status || 1);
}
