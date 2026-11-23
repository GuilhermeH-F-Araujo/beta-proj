// Sugestoes publicas: o catalogo norte-americano nao cobre todas as marcas do Brasil.
// A digitacao permanece livre e estas opcoes locais garantem o uso sem a API externa.
export const marcasMotocicletaPrincipais = [
  'Honda',
  'Yamaha',
  'Suzuki',
  'Kawasaki',
  'BMW',
  'Royal Enfield',
  'Harley-Davidson',
  'Dafra',
  'Shineray',
  'Haojue',
  'Triumph',
  'Ducati',
  'KTM',
  'Bajaj',
  'Avelloz',
  'Watts',
  'Voltz',
  'Aprilia',
  'Indian',
  'Husqvarna',
  'MV Agusta',
  'Benelli',
  'Zontes',
  'CFMoto',
];

const rota =
  'https://vpic.nhtsa.dot.gov/api/vehicles/GetMakesForVehicleType/motorcycle?format=json';
let emMemoria: string[] | null = null;
let expiraEm = 0;
let pendente: Promise<string[]> | null = null;

export async function sugestoesMarcasMotocicleta(): Promise<string[]> {
  if (emMemoria && Date.now() < expiraEm) return emMemoria;
  if (pendente) return pendente;
  pendente = (async () => {
    try {
      const response = await fetch(rota, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error(`NHTSA respondeu HTTP ${response.status}`);
      const dados = (await response.json()) as { Results?: Array<{ MakeName?: unknown }> };
      if (!Array.isArray(dados.Results)) throw new Error('Resposta de marcas inválida');
      const encontrados = new Set(
        marcasMotocicletaPrincipais.map((nome) => nome.toLocaleLowerCase('pt-BR')),
      );
      const adicional: string[] = [];
      for (const linha of dados.Results) {
        if (typeof linha.MakeName !== 'string') continue;
        const nome = linha.MakeName.trim().replace(/\s+/g, ' ');
        const chave = nome.toLocaleLowerCase('pt-BR');
        if (nome.length < 2 || nome.length > 45 || encontrados.has(chave)) continue;
        encontrados.add(chave);
        adicional.push(
          nome === nome.toUpperCase()
            ? nome
                .toLocaleLowerCase('pt-BR')
                .replace(/(^|[\s-])\p{L}/gu, (letra) => letra.toLocaleUpperCase('pt-BR'))
            : nome,
        );
      }
      emMemoria = [
        ...marcasMotocicletaPrincipais,
        ...adicional.sort((primeiroElemento, segundoElemento) =>
          primeiroElemento.localeCompare(segundoElemento, 'pt-BR'),
        ),
      ];
      expiraEm = Date.now() + 24 * 60 * 60 * 1000;
      return emMemoria;
    } catch {
      emMemoria = marcasMotocicletaPrincipais;
      expiraEm = Date.now() + 5 * 60 * 1000;
      return emMemoria;
    } finally {
      pendente = null;
    }
  })();
  return pendente;
}
