// Cliente sem dependencia de React para os percursos cliente e mecanico.
export type MiniaturaPublicada = {
  status: 'publicada' | 'indisponivel';
  catalogoId: string | null;
  revisao: number;
  imagem: string | null;
  atualizadoEm: string | null;
};
export type CreditoMiniatura = {
  titulo: string;
  url: string;
  autor?: string;
  licenca?: string;
  licencaUrl?: string;
};
export function criarClienteMiniaturas(urlApi: string, obterToken: () => Promise<string | null>) {
  const base = urlApi.replace(/\/$/, '');
  async function consultarApi<T>(caminho: string, signal?: AbortSignal): Promise<T> {
    const token = await obterToken();
    if (!token) throw new Error('Entre na sua conta para consultar a miniatura.');
    const resposta = await fetch(`${base}${caminho}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (!resposta.ok) throw new Error(`Miniatura indisponivel (HTTP ${resposta.status}).`);
    return resposta.json();
  }
  return {
    async consultar(
      entrada: {
        modelo: string;
        ano?: number;
        variante?: string;
        motoId?: number;
        tamanho?: 'tabela' | 'card' | 'original';
      },
      signal?: AbortSignal,
    ): Promise<MiniaturaPublicada> {
      const parametros = new URLSearchParams();
      for (const [nome, valor] of Object.entries(entrada)) {
        if (valor !== undefined) parametros.set(nome, String(valor));
      }
      return consultarApi(`/api/miniaturas/publicada?${parametros}`, signal);
    },
    consultarCreditos(signal?: AbortSignal) {
      return consultarApi<{ fontes: CreditoMiniatura[] }>('/api/miniaturas/creditos', signal);
    },
  };
}
