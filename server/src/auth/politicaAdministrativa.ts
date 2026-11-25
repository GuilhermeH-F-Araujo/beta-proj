export type NivelAdministrativo = 'administrador' | 'superadministrador' | 'dono';
export const pesosAdministrativos: Record<NivelAdministrativo, number> = {
  administrador: 1,
  superadministrador: 2,
  dono: 3,
};

export function podeGerenciarAdministrador(autor: NivelAdministrativo, alvo: NivelAdministrativo) {
  return (
    (autor === 'dono' && alvo !== 'dono') ||
    pesosAdministrativos[autor] > pesosAdministrativos[alvo]
  );
}

type DadosAcao = { position?: string; cargo?: string; status?: string };

// O Express casa rotas sem diferenciar maiusculas e aceita barras extras; as regras
// de seguranca precisam comparar a mesma forma, senao "/api/Employees/1/access"
// passaria pela rota sem pedir a confirmacao de senha.
export function rotaNormalizada(caminho: string) {
  const semConsulta = caminho.split('?')[0].split('#')[0];
  let decodificada = semConsulta;
  try {
    decodificada = decodeURIComponent(semConsulta);
  } catch {
    /* Uma sequencia invalida segue como veio e nao casa com rotas protegidas. */
  }
  return decodificada
    .toLowerCase()
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');
}
/*
 * Politica em camadas, no modelo usado por GitHub (sudo mode), Google e Stripe:
 * - 'nenhuma': operacao do dia a dia (OS, catalogo, status, fotos). Fica registrada nos logs.
 * - 'sensivel': uma confirmacao abre uma janela de confianca que se renova enquanto a
 *   pessoa trabalha (30 min sem acao protegida, no maximo 4 h). Login recente tambem vale.
 * - 'critica': mexe em quem pode entrar ou em configuracoes de seguranca. Exige uma
 *   confirmacao feita nos ultimos 15 minutos. Sao acoes raras, entao nao atrapalham.
 */
export type NivelConfirmacao = 'nenhuma' | 'sensivel' | 'critica';
export const minutosJanelaCritica = 15;
export function nivelConfirmacao(
  metodo: string,
  caminho: string,
  corpo?: unknown,
): NivelConfirmacao {
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return 'nenhuma';
  const rota = rotaNormalizada(caminho);
  const dados = corpo as DadosAcao | undefined;
  const critica =
    /^\/api\/admin\/security\/employee-requests\/[^/]+$/.test(rota) ||
    /^\/api\/admin\/security\/admins(?:\/|$)/.test(rota) ||
    /^\/api\/employees\/\d+\/(access|password)$/.test(rota) ||
    (metodo === 'PATCH' &&
      /^\/api\/employees\/\d+$/.test(rota) &&
      dados?.cargo === 'Administrador') ||
    (rota === '/api/admin/users' && dados?.position === 'Administrador') ||
    // Cadastrar um fator exige confirmação recente de senha. A validação do
    // código é o próprio segundo fator; não deve depender do prazo da senha.
    /^\/api\/admin\/security\/mfa\/enroll$/.test(rota) ||
    rota === '/api/admin/settings/backup' ||
    /^\/api\/admin\/settings\/(?:roles|cargos)(?:\/|$)/.test(rota) ||
    rota === '/api/admin/preferences/seguranca' ||
    rota === '/api/admin/roles';
  if (critica) return 'critica';
  // Excluir registros principais, dinheiro e criar acessos: protegidos pela janela.
  const sensivel =
    (metodo === 'DELETE' && /^\/api\/(?:clients|motorcycles|orders)\/[^/]+$/.test(rota)) ||
    (metodo === 'POST' && rota === '/api/employees') ||
    /\/payments?(?:\/|$)/.test(rota) ||
    /^\/api\/admin\/miniaturas\/publicacoes\/[^/]+\/restaurar$/.test(rota);
  return sensivel ? 'sensivel' : 'nenhuma';
}
export function exigeConfirmacao(metodo: string, caminho: string, corpo?: unknown) {
  return nivelConfirmacao(metodo, caminho, corpo) !== 'nenhuma';
}
export function contextoConfirmacao(caminho: string, metodo: string) {
  if (/^\/api\/admin\/security\/employee-requests\/[^/]+$/.test(caminho))
    return {
      titulo: 'Aprovar cadastro de funcionário',
      descricao:
        'Confirme sua senha e o código do Google Authenticator para aprovar ou recusar este cadastro.',
      requireAuthenticator: true,
    };
  if (metodo === 'POST' && caminho === '/api/employees')
    return {
      titulo: 'Adicionar funcionário',
      descricao: 'Confirme sua identidade antes de cadastrar uma pessoa e criar um novo acesso.',
    };
  if (caminho === '/api/admin/settings/backup')
    return {
      titulo: 'Gerenciar backups do banco',
      descricao:
        'Confirme sua senha ou o Google Authenticator antes de alterar ou iniciar um backup.',
    };
  if (/\/security\/admins(?:\/|$)/.test(caminho))
    return {
      titulo: 'Gerenciar acesso administrativo',
      descricao: 'Confirme sua identidade para aprovar ou alterar um acesso administrativo.',
    };
  if (/\/password$/.test(caminho))
    return {
      titulo: 'Redefinir senha de acesso',
      descricao: 'Confirme sua identidade antes de alterar a senha de outra pessoa.',
    };
  if (/\/access$/.test(caminho))
    return {
      titulo: 'Alterar acesso à oficina',
      descricao: 'Esta alteração pode bloquear ou liberar a entrada de uma pessoa no sistema.',
    };
  if (/\/employees|\/admin\/users/.test(caminho))
    return {
      titulo: 'Alterar acesso da equipe',
      descricao: 'Esta operação altera um cadastro administrativo ou concede novas permissões.',
    };
  if (/\/payments?(?:\/|$)/.test(caminho))
    return {
      titulo: 'Atualizar pagamento',
      descricao: 'Confirme sua identidade para alterar o registro financeiro desta ordem.',
    };
  if (metodo === 'DELETE')
    return {
      titulo: 'Confirmar remoção',
      descricao: 'Esta operação remove ou arquiva um registro da oficina.',
    };
  return {
    titulo: 'Confirme sua identidade',
    descricao: 'Confirme sua identidade antes de continuar esta alteração.',
  };
}
