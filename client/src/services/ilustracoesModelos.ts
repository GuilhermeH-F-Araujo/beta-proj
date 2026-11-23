// Ilustracoes locais disponiveis; modelos diferentes usam a geracao propria.
export function ilustracaoModelo(
  modelo: string | undefined,
): { src: string; category: string } | null {
  if (!modelo || modelo.includes('não encontrada')) return null;
  const normalizado = modelo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\bnxr\s*160\b/.test(normalizado)) {
    return { src: '/assets/models/trilha-160.webp', category: 'trail' };
  }
  if (/\bfazer\s*250\b/.test(normalizado)) {
    return { src: '/assets/models/urbana-250.webp', category: 'urbana' };
  }
  if (/\bcg\s*160\b/.test(normalizado)) {
    return { src: '/assets/models/urbana-160.webp', category: 'urbana' };
  }
  return null;
}
