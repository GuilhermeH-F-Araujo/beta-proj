import test from 'node:test';
import assert from 'node:assert/strict';

const info = (nome) => ({
  title: `File:${nome}`,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/aa/${encodeURIComponent(nome)}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/${encodeURIComponent(nome)}/960px.jpg`,
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:x',
      width: 3000,
      height: 2000,
      extmetadata: {
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        Artist: { value: 'Fotografo' },
        ImageDescription: { value: 'motorcycle' },
        DateTimeOriginal: { value: '2022:05:01' },
      },
    },
  ],
});

test('Wikidata: foto principal, arquivos que "retratam" o modelo e categoria oficial entram como referencia', async () => {
  const anterior = globalThis.fetch;
  const chamadas = [];
  globalThis.fetch = async (url, opcoes) => {
    const u = new URL(String(url));
    chamadas.push(u);
    assert.match(opcoes?.headers?.['User-Agent'] || '', /EstacaoMotosMiniaturas/);
    const p = Object.fromEntries(u.searchParams);
    if (u.hostname === 'www.wikidata.org' && p.action === 'wbsearchentities')
      return Response.json({ search: [{ id: 'Q1', label: 'BMW R 1250 GS', description: 'motorcycle model' }] });
    if (u.hostname === 'www.wikidata.org' && p.action === 'wbgetentities')
      return Response.json({
        entities: {
          Q1: {
            labels: { en: { value: 'BMW R 1250 GS' } },
            claims: {
              P18: [{ mainsnak: { datavalue: { value: 'Principal sem nome.jpg' } } }],
              P373: [{ mainsnak: { datavalue: { value: 'BMW R 1250 GS' } } }],
            },
          },
        },
      });
    if (u.hostname === 'commons.wikimedia.org' && p.gsrsearch === 'haswbstatement:P180=Q1')
      return Response.json({ query: { pages: [info('IMG_2041.jpg')] } });
    if (u.hostname === 'commons.wikimedia.org' && p.gcmtitle === 'Category:BMW R 1250 GS' && p.gcmtype === 'file')
      return Response.json({ query: { pages: [info('Passeio no domingo.jpg')] } });
    if (u.hostname === 'commons.wikimedia.org' && p.titles?.includes('Principal sem nome'))
      return Response.json({ query: { pages: [info('Principal sem nome.jpg')] } });
    return Response.json({ query: { pages: [] } });
  };
  try {
    const { pesquisarReferencias } = await import('../src/miniaturas/pesquisa.ts');
    const pesquisa = await pesquisarReferencias('BMW R 1250 GS', null, true);
    const titulos = pesquisa.fontes.filter((f) => f.imagem).map((f) => f.titulo);
    assert.ok(titulos.includes('IMG 2041.jpg'), 'arquivo marcado como P180');
    assert.ok(titulos.includes('Passeio no domingo.jpg'), 'arquivo da categoria oficial');
    assert.ok(titulos.includes('Principal sem nome.jpg'), 'foto principal P18');
    assert.ok(pesquisa.fontes.filter((f) => f.imagem).every((f) => f.correspondencia === 'exata'));
  } finally {
    globalThis.fetch = anterior;
  }
});

test('foto de outro modelo da mesma marca fica de fora, mesmo na categoria certa', async () => {
  const { citaOutroModelo } = await import('../src/miniaturas/buscaFotos.ts');
  assert.equal(citaOutroModelo('BMW S 1000 RR', 'BMW M1000R with M1000RR-in-the-left.jpg'), true);
  assert.equal(citaOutroModelo('BMW S 1000 RR', 'BMW S1000 RR Studio.JPG'), false);
  assert.equal(citaOutroModelo('BMW S 1000 RR', 'BMW S 1000 RR, left view.jpg'), false);
  assert.equal(citaOutroModelo('Honda CG 160 Fan', 'Honda CG160 Fan 2027'), false);
  assert.equal(citaOutroModelo('Triumph Tiger 900', 'Triumph Tiger 900 GT Pro 2027.jpg'), false);
  assert.equal(citaOutroModelo('Ducati Monster', 'Ducati Monster 696 LeftSide.jpg'), false);
  assert.equal(citaOutroModelo('Yamaha MT-09', 'Yamaha MT-07 2021.jpg'), true);
});
