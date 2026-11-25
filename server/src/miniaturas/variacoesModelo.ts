import { normalizarModelo } from './identidade.js';

// Marcas comuns no Brasil. Sem a marca, "CG 160" ainda identifica o modelo nas legendas.
const MARCAS = [
  'harley davidson',
  'harley-davidson',
  'royal enfield',
  'mv agusta',
  'honda',
  'yamaha',
  'suzuki',
  'kawasaki',
  'bmw',
  'ducati',
  'triumph',
  'harley',
  'ktm',
  'dafra',
  'shineray',
  'haojue',
  'kasinski',
  'traxx',
  'mottu',
  'voltz',
  'vespa',
  'piaggio',
  'kymco',
  'sym',
  'benelli',
  'cfmoto',
  'husqvarna',
  'aprilia',
  'indian',
  'jtz',
  'avelloz',
  'bajaj',
  'tvs',
  'hero',
  'zontes',
  'gasgas',
  'moto guzzi',
  'bimota',
  'norton',
  'buell',
  'can-am',
  'energica',
  'zero',
];
// Palavras de acabamento: ajudam a achar a familia quando a versao exata nao tem foto.
const ACABAMENTOS = new Set([
  'fan',
  'titan',
  'start',
  'cargo',
  'es',
  'esd',
  'ex',
  'ks',
  'flex',
  'flexone',
  'abs',
  'cbs',
  'dlx',
  'sport',
  'special',
  'edition',
  'adventure',
  'rally',
  'rallye',
  'connected',
  'factor',
  'ed',
  'std',
  'pro',
  'plus',
  'limited',
  // Acabamentos de motos premium: a foto da versao base mostra a mesma silhueta.
  's',
  'r',
  'sp',
  'evo',
  'tricolore',
  'superleggera',
  'speciale',
  'corse',
  'lusso',
  'exclusive',
  'premium',
  'cvo',
  'dark',
  'black',
  'triple',
  'option',
  '719',
  'pikes',
  'peak',
  'explorer',
  'touring',
  'trophy',
]);
const ANO_NO_NOME = /\b(19[5-9]\d|20\d{2})\b/;

// Limpa o que o usuario digita antes da busca: marca repetida ("Suzuki Suzuki"),
// ano dentro do nome ("Ninja 400 2022") e sufixo "cc" ("300cc").
export function limparNomeModelo(modelo: string, anoInformado: number | null = null) {
  const palavras = modelo.trim().replace(/\s+/g, ' ').split(' ');
  const semRepeticao = palavras.filter(
    (palavra, i) => i === 0 || normalizarModelo(palavra) !== normalizarModelo(palavras[i - 1]),
  );
  let nome = semRepeticao.join(' ').replace(/\b(\d{2,4})\s?cc\b/gi, '$1');
  let ano = anoInformado;
  const encontrado = nome.match(ANO_NO_NOME);
  const anoMaximo = new Date().getFullYear() + 2;
  if (encontrado && Number(encontrado[1]) <= anoMaximo && nome.replace(encontrado[0], '').trim().split(' ').length >= 2) {
    ano ??= Number(encontrado[1]);
    nome = nome.replace(encontrado[0], ' ').replace(/\s+/g, ' ').trim();
  }
  return { modelo: nome, ano };
}

export type VariacaoModelo = { consulta: string; familia: boolean };

function semMarca(modelo: string) {
  const normalizado = normalizarModelo(modelo);
  const marca = MARCAS.find((nome) => normalizado.startsWith(`${nome} `));
  return marca ? modelo.trim().slice(marca.length).trim() : null;
}
function colarCodigo(modelo: string) {
  return modelo.replace(/\b([a-z]{1,4}) (\d{2,4})\b/gi, '$1$2');
}
function nucleoSemAcabamento(modelo: string) {
  const palavras = modelo.trim().split(/\s+/);
  while (palavras.length > 2 && ACABAMENTOS.has(normalizarModelo(palavras.at(-1)!)))
    palavras.pop();
  return palavras.join(' ');
}
function semCilindrada(modelo: string) {
  return modelo.replace(/\s+\d{2,4}(?:cc)?\s*$/i, '').trim();
}
function temIdentificacao(valor: string) {
  const partes = normalizarModelo(valor).match(/[a-z]+|\d+/g) || [];
  return partes.length >= 2 || partes.some((parte) => /\d/.test(parte) && /[a-z]/.test(parte));
}

// Gera consultas alternativas para ampliar a busca sem confundir modelos diferentes:
// as exatas so mudam a escrita; as de familia removem acabamento ou cilindrada.
export function variacoesModelo(modelo: string): VariacaoModelo[] {
  const base = modelo.trim();
  const nucleo = nucleoSemAcabamento(base);
  const candidatas: VariacaoModelo[] = [
    { consulta: colarCodigo(base), familia: false },
    { consulta: semMarca(base) ?? '', familia: false },
    { consulta: nucleo, familia: nucleo !== base },
    { consulta: semMarca(nucleo) ?? '', familia: nucleo !== base },
    { consulta: semCilindrada(nucleo), familia: true },
  ];
  const vistas = new Set([normalizarModelo(base)]);
  return candidatas.filter(({ consulta }) => {
    const chave = normalizarModelo(consulta);
    if (!consulta || vistas.has(chave) || !temIdentificacao(consulta)) return false;
    vistas.add(chave);
    return true;
  });
}
