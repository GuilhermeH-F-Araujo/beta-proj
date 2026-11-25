export const REGISTROS_POR_CONSULTA = 500;
export const IDS_POR_CONSULTA = 200;

type PaginaConsulta<Registro> = {
  data: Registro[] | null;
  error: unknown;
};

// O Supabase pode limitar o retorno. Continua a consulta ate a ultima pagina.
export async function consultarTodasPaginas<Registro>(
  consultarPagina: (inicio: number, fim: number) => PromiseLike<PaginaConsulta<Registro>>,
): Promise<Registro[]> {
  const registros: Registro[] = [];
  for (let inicio = 0; ; inicio += REGISTROS_POR_CONSULTA) {
    const fim = inicio + REGISTROS_POR_CONSULTA - 1;
    const { data: pagina, error: erro } = await consultarPagina(inicio, fim);
    if (erro) throw erro;
    registros.push(...(pagina ?? []));
    if (!pagina || pagina.length < REGISTROS_POR_CONSULTA) return registros;
  }
}
