// Ilustrações locais disponíveis; modelos diferentes usam a geração própria.
export function ilustracaoModelo(model: string | undefined): { src: string; category: string } | null {
  if (!model || model.includes('não encontrada')) return null;
  const normalized = model.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\bnxr\s*160\b/.test(normalized)) {
    return { src: '/assets/models/trilha-160.webp', category: 'trail' };
  }
  if (/\bfazer\s*250\b/.test(normalized)) {
    return { src: '/assets/models/urbana-250.webp', category: 'urbana' };
  }
  if (/\bcg\s*160\b/.test(normalized)) {
    return { src: '/assets/models/urbana-160.webp', category: 'urbana' };
  }
  return null;
}
