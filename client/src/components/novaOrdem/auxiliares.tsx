export const fotoEspacos = [
  'Frente',
  'Lado esquerdo',
  'Traseira',
  'Lado direito',
];

export const digitos = (valor: string) => valor.replace(/\D/g, '');

export const reduzir = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function localDadosHorario() {
  const dadosLocal = new Date();
  const preencher = (valor: number) => String(valor).padStart(2, '0');
  return `${dadosLocal.getFullYear()}-${preencher(dadosLocal.getMonth() + 1)}-${preencher(dadosLocal.getDate())}T${preencher(dadosLocal.getHours())}:${preencher(dadosLocal.getMinutes())}`;
}

export function mascaraCpf(valor: string) {
  return digitos(valor)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function mascaraTelefone(valor: string) {
  const dadosAtual = digitos(valor).slice(0, 11);
  return dadosAtual.length > 6
    ? `(${dadosAtual.slice(0, 2)}) ${dadosAtual.slice(2, dadosAtual.length > 10 ? 7 : 6)}-${dadosAtual.slice(dadosAtual.length > 10 ? 7 : 6)}`
    : dadosAtual.length > 2
      ? `(${dadosAtual.slice(0, 2)}) ${dadosAtual.slice(2)}`
      : dadosAtual;
}

export async function imagemDados(arquivo: File): Promise<string> {
  if (!arquivo.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (arquivo.size > 10_000_000) throw new Error('Cada foto deve ter até 10 MB.');
  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    const telaDesenho = document.createElement('canvas');
    const proporcao = Math.min(1, 1100 / Math.max(imagem.naturalWidth, imagem.naturalHeight));
    telaDesenho.width = Math.round(imagem.naturalWidth * proporcao);
    telaDesenho.height = Math.round(imagem.naturalHeight * proporcao);
    const contexto = telaDesenho.getContext('2d');
    if (!contexto || !telaDesenho.width || !telaDesenho.height)
      throw new Error('Não foi possível ler esta imagem.');
    contexto.drawImage(imagem, 0, 0, telaDesenho.width, telaDesenho.height);
    for (const qualidade of [0.78, 0.68, 0.56]) {
      const valor = telaDesenho.toDataURL('image/jpeg', qualidade);
      if (valor.length <= 735_000) return valor;
    }
    throw new Error('Esta imagem ficou grande demais. Escolha outra foto.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
