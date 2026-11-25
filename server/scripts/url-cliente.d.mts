export function resolverUrlCliente(ambiente?: NodeJS.ProcessEnv): string;
export function origensClienteConfiaveis(ambiente?: NodeJS.ProcessEnv): Set<string>;
export function alteracaoPainelConfiavel(
  origem: string | undefined,
  origemNavegacao: string | undefined,
  ambiente?: NodeJS.ProcessEnv,
): boolean;
