// Sugestões públicas: o catálogo norte-americano não cobre todas as marcas do Brasil.
// A digitação permanece livre e estas opções locais garantem o uso sem a API externa.
export const marcasMotocicletaPrincipais = [
  'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'BMW', 'Royal Enfield',
  'Harley-Davidson', 'Dafra', 'Shineray', 'Haojue', 'Triumph',
  'Ducati', 'KTM', 'Bajaj', 'Avelloz', 'Watts', 'Voltz', 'Aprilia',
  'Indian', 'Husqvarna', 'MV Agusta', 'Benelli', 'Zontes', 'CFMoto',
];

const endpoint = 'https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/motorcycle?format=json';
let cached: string[] | null = null;
let expires = 0;
let pending: Promise<string[]> | null = null;

export async function sugestoesMarcasMotocicleta(): Promise<string[]> {
  if (cached && Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw new Error(`NHTSA respondeu HTTP ${response.status}`);
      const data = await response.json() as { Results?: Array<{ MakeName?: unknown }> };
      if (!Array.isArray(data.Results)) throw new Error('Resposta de marcas inválida');
      const seen = new Set(marcasMotocicletaPrincipais.map(name => name.toLocaleLowerCase('pt-BR')));
      const extra: string[] = [];
      for (const row of data.Results) {
        if (typeof row.MakeName !== 'string') continue;
        const name = row.MakeName.trim().replace(/\s+/g, ' ');
        const key = name.toLocaleLowerCase('pt-BR');
        if (name.length < 2 || name.length > 45 || seen.has(key)) continue;
        seen.add(key);
        extra.push(name === name.toUpperCase() ? name.toLocaleLowerCase('pt-BR').replace(/(^|[\s-])\p{L}/gu, letter => letter.toLocaleUpperCase('pt-BR')) : name);
      }
      cached = [...marcasMotocicletaPrincipais, ...extra.sort((a, b) => a.localeCompare(b, 'pt-BR'))];
      expires = Date.now() + 24 * 60 * 60 * 1000;
      return cached;
    } catch {
      cached = marcasMotocicletaPrincipais;
      expires = Date.now() + 5 * 60 * 1000;
      return cached;
    } finally { pending = null; }
  })();
  return pending;
}
