export const API_MINIATURAS = (
  (import.meta.env?.VITE_URL_API ?? import.meta.env?.VITE_API_URL) ||
  ''
).replace(/\/$/, '');
export type CatalogoMiniatura = {
  id: string;
  modelo: string;
  ano: number | null;
  variante: string;
  moto_id: number | null;
  revisao: number;
  publicada: string | null;
};
export type PedidoMiniatura = {
  id: string;
  status: string;
  modo: 'referencia' | 'preservar';
  observacoes: string;
  tentativas: number;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
  correcao: string;
  catalogo: CatalogoMiniatura;
  referencias: { caminho: string; nome: string; origem: string; imagem?: string }[];
  candidato?: string | null;
  imagem?: string | null;
  atual?: string | null;
  verificacao?: { direcao: string; inteira: boolean; problemas: string[]; automatica: boolean };
  pesquisa?: {
    etapa?: string;
    semFoto?: boolean;
    fontes: { titulo: string; url: string; resumo: string; imagem?: string; licenca?: string }[];
    avisos: string[];
  };
  historico?: { id: string; criado_em: string }[];
};
export type ConfiguracaoMiniaturas = {
  geracao: boolean;
  pesquisaAmpliada: boolean;
  retomaEm?: string | null;
  limite: number;
  consumo: number;
  publicacoes: number;
};
export async function requisitarMiniaturas<T>(
  caminho: string,
  metodo = 'GET',
  corpo?: unknown,
  token?: string,
): Promise<T> {
  const arquivo = corpo instanceof Blob;
  const response = await fetch(`${API_MINIATURAS}${caminho}`, {
    method: metodo,
    credentials: token ? 'omit' : 'include',
    cache: 'no-store',
    headers: {
      ...(corpo ? { 'Content-Type': arquivo ? corpo.type : 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? (arquivo ? corpo : JSON.stringify(corpo)) : undefined,
  });
  const dados = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(dados?.message || `Nao foi possivel concluir (HTTP ${response.status}).`);
  return dados as T;
}
export const listarMiniaturas = () =>
  requisitarMiniaturas<{ pedidos: PedidoMiniatura[]; configuracao: ConfiguracaoMiniaturas }>(
    '/api/admin/miniaturas',
  );
export const buscarPedidoMiniatura = (id: string) =>
  requisitarMiniaturas<PedidoMiniatura>(`/api/admin/miniaturas/${id}`);
export async function prepararFotoMiniatura(arquivo: File): Promise<Blob> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type) ||
    arquivo.size > 10 * 1024 * 1024
  )
    throw new Error('Selecione JPEG, PNG ou WebP de ate 10 MB.');
  const bitmap = await createImageBitmap(arquivo);
  try {
    if (bitmap.width < 320 || bitmap.height < 240)
      throw new Error('A foto precisa ter pelo menos 320 x 240 pixels.');
    const fator = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * fator);
    canvas.height = Math.round(bitmap.height * fator);
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Nao foi possivel preparar a foto.');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Foto invalida.'))),
        'image/jpeg',
        0.92,
      ),
    );
  } finally {
    bitmap.close();
  }
}
export const nomesSituacao: Record<string, string> = {
  rascunho: 'Rascunho',
  pendente: 'Na fila',
  processando: 'Em processamento',
  revisao: 'Pronta para revisar',
  informacao: 'Precisa de referencia',
  falhou: 'Precisa de atencao',
  aprovada: 'Aprovada',
  descartada: 'Descartada',
};
