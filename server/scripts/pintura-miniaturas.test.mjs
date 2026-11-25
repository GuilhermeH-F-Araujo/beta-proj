import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  separarPinturaMiniatura,
  validarMascaraPintura,
  recortarMiniatura,
  espelharMiniatura,
  ehMarcadorPintura,
} from '../src/miniaturas/imagens.ts';
import { variacoesModelo, limparNomeModelo } from '../src/miniaturas/variacoesModelo.ts';
import { impedimentoPublicacaoMiniatura } from '../src/shared/validacaoMiniatura.ts';
import {
  montarInstrucao,
  montarInstrucaoCompacta,
  limparCredencial,
} from '../src/miniaturas/provedor.ts';
async function fixture(background = '#00000000') {
  return sharp({ create: { width: 200, height: 120, channels: 4, background } })
    .composite([
      {
        input: { create: { width: 150, height: 80, channels: 4, background: '#222222' } },
        left: 25,
        top: 20,
      },
      {
        input: { create: { width: 50, height: 25, channels: 4, background: '#00b8ff' } },
        left: 80,
        top: 30,
      },
      {
        input: { create: { width: 20, height: 20, channels: 4, background: '#174aab' } },
        left: 30,
        top: 30,
      },
      {
        input: { create: { width: 20, height: 20, channels: 4, background: '#c8912c' } },
        left: 135,
        top: 65,
      },
      {
        input: { create: { width: 20, height: 20, channels: 4, background: '#aaaaaa' } },
        left: 50,
        top: 65,
      },
    ])
    .png()
    .toBuffer();
}
const pixel = (data, x, y) => Array.from(data.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 4));
test('base neutra e mascara isolam paineis preservando metal, borracha e alfa', async () => {
  const { imagem, mascara, recorte } = await separarPinturaMiniatura(await fixture());
  const base = await sharp(imagem).raw().toBuffer();
  const mapa = await sharp(mascara).raw().toBuffer();
  assert.equal(pixel(base, 90, 40)[0], pixel(base, 90, 40)[1]);
  assert.equal(pixel(base, 90, 40)[1], pixel(base, 90, 40)[2]);
  assert.equal(pixel(mapa, 90, 40)[3], 255);
  assert.deepEqual(pixel(base, 55, 70), [170, 170, 170, 255]);
  assert.equal(pixel(mapa, 55, 70)[3], 0);
  assert.deepEqual(pixel(base, 30, 80), [34, 34, 34, 255]);
  assert.equal(pixel(mapa, 30, 80)[3], 0);
  assert.equal(pixel(base, 0, 0)[3], 0);
  assert.equal(pixel(mapa, 0, 0)[3], 0);
  assert.deepEqual(pixel(base, 35, 35), [23, 74, 171, 255]);
  assert.equal(pixel(mapa, 35, 35)[3], 0);
  assert.deepEqual(pixel(base, 140, 70), [200, 145, 44, 255]);
  assert.equal(pixel(mapa, 140, 70)[3], 0);
  assert.equal(pixel(await sharp(recorte).raw().toBuffer(), 90, 40)[3], 0);
  await validarMascaraPintura(recorte, mascara);
  // A base neutra completa e o arquivo publicado: tambem precisa validar.
  await validarMascaraPintura(imagem, mascara);
});
test('pintura rejeita mascara ausente, chapada e que invade o fundo', async () => {
  const semPintura = await sharp({
    create: { width: 200, height: 120, channels: 4, background: '#222222' },
  })
    .png()
    .toBuffer();
  const tudoAzul = await sharp({
    create: { width: 200, height: 120, channels: 4, background: '#00b8ff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(separarPinturaMiniatura(semPintura), /paineis pintaveis/);
  await assert.rejects(separarPinturaMiniatura(tudoAzul), /paineis pintaveis/);
  const { imagem, mascara, recorte } = await separarPinturaMiniatura(await fixture());
  await assert.rejects(validarMascaraPintura(imagem, tudoAzul), /invade o fundo/);
  await assert.rejects(
    validarMascaraPintura(imagem, await sharp(mascara).resize(100, 60).toBuffer()),
    /nao corresponde/,
  );
});
test('vista em tres quartos e frente esquerda impedem publicacao', () => {
  assert.match(
    impedimentoPublicacaoMiniatura({
      automatica: true,
      direcao: 'direita',
      inteira: true,
      vistaLateral: false,
    }),
    /totalmente de lado/,
  );
  assert.match(
    impedimentoPublicacaoMiniatura({
      automatica: true,
      direcao: 'esquerda',
      inteira: true,
      vistaLateral: true,
    }),
    /esquerda/,
  );
  assert.equal(
    impedimentoPublicacaoMiniatura({
      automatica: true,
      direcao: 'direita',
      inteira: true,
      vistaLateral: true,
    }),
    null,
  );
  const prompt = montarInstrucao({
    modelo: 'Honda CG 160',
    modo: 'referencia',
    observacoes: '',
    pesquisa: '',
    correcao: '',
  });
  assert.match(prompt, /STRICT ORTHOGRAPHIC RIGHT-FACING SIDE PROFILE/);
  assert.match(prompt, /ONLY on variant paint/);
  assert.match(prompt, /ORIGINAL factory colors/);
});

for (const [fundo, cor] of [
  ['magenta', '#ff00ff'],
  ['verde', '#00ff00'],
])
  test(`mascara de pintura nao se perde no recorte ${fundo}`, async () => {
    const recortada = await recortarMiniatura(await fixture(cor), fundo);
    const { imagem, mascara } = await separarPinturaMiniatura(recortada);
    const base = await sharp(imagem).raw().toBuffer();
    const mapa = await sharp(mascara).raw().toBuffer();
    assert.equal(pixel(base, 0, 0)[3], 0);
    assert.equal(pixel(mapa, 90, 40)[3], 255);
    assert.equal(pixel(mapa, 35, 35)[3], 0);
    assert.deepEqual(pixel(base, 35, 35), [23, 74, 171, 255]);
    assert.deepEqual(pixel(base, 140, 70), [200, 145, 44, 255]);
  });

test('recorte tolera poucos pixels da moto encostando na borda', async () => {
  const gerada = await sharp({ create: { width: 400, height: 500, channels: 4, background: '#ff00ff' } })
    .composite([
      { input: { create: { width: 300, height: 160, channels: 4, background: '#333333' } }, left: 50, top: 170 },
      // Retrovisor encostando 4 pixels na borda superior.
      { input: { create: { width: 4, height: 30, channels: 4, background: '#333333' } }, left: 200, top: 0 },
    ])
    .png()
    .toBuffer();
  const recortada = await sharp(await recortarMiniatura(gerada, 'magenta')).raw().toBuffer({ resolveWithObject: true });
  const alfa = (x, y) => recortada.data[(y * recortada.info.width + x) * 4 + 3];
  assert.equal(alfa(0, 0), 0);
  assert.equal(alfa(200, 250), 255);
});
test('espelhamento de ultimo recurso inverte somente a horizontal', async () => {
  const base = await sharp({ create: { width: 4, height: 2, channels: 4, background: '#00000000' } })
    .composite([{ input: { create: { width: 1, height: 2, channels: 4, background: '#ff0000' } }, left: 0, top: 0 }])
    .png()
    .toBuffer();
  const { data } = await sharp(await espelharMiniatura(base)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3 * 4 + 3], 255);
  assert.equal(data[0 * 4 + 3], 0);
});
test('variacoes ampliam a busca sem trocar o modelo', () => {
  const consultas = variacoesModelo('Honda CG 160 Fan');
  const texto = consultas.map((item) => `${item.consulta}|${item.familia}`);
  assert.ok(texto.includes('Honda CG160 Fan|false'));
  assert.ok(texto.includes('CG 160 Fan|false'));
  assert.ok(texto.includes('Honda CG 160|true'));
  assert.ok(consultas.every((item) => !/yamaha/i.test(item.consulta)));
  assert.deepEqual(variacoesModelo('Biz'), []);
});
test('instrucao compacta e credenciais limpas mantem as regras essenciais', () => {
  const texto = montarInstrucaoCompacta({ modelo: 'Honda CG 160', modo: 'referencia', fundoChave: 'verde' });
  assert.match(texto, /RIGHT/);
  assert.match(texto, /Portrait 4:5/);
  assert.match(texto, /#00B8FF/);
  assert.match(texto, /#00FF00/);
  assert.equal(limparCredencial('  "abc123"\r\n'), 'abc123');
  assert.equal(limparCredencial('Bearer tok_1 '), 'tok_1');
});
test('instrucao completa preserva o treinamento anterior e acrescenta realismo', () => {
  const texto = montarInstrucao({ modelo: 'Yamaha Fazer 250', modo: 'referencia', observacoes: '', pesquisa: '', correcao: '' });
  assert.match(texto, /STRICT ORTHOGRAPHIC RIGHT-FACING SIDE PROFILE/);
  assert.match(texto, /MANDATORY PORTRAIT CANVAS/);
  assert.match(texto, /REALISM:/);
});

test('nome digitado e limpo antes da busca: marca repetida, ano no nome e cc', () => {
  assert.deepEqual(limparNomeModelo('Suzuki Suzuki Gsx-R 1000 R'), { modelo: 'Suzuki Gsx-R 1000 R', ano: null });
  assert.deepEqual(limparNomeModelo('Kawasaki Ninja 400 2022'), { modelo: 'Kawasaki Ninja 400', ano: 2022 });
  assert.deepEqual(limparNomeModelo('Kawasaki Ninja 400 2022', 2023), { modelo: 'Kawasaki Ninja 400', ano: 2023 });
  assert.deepEqual(limparNomeModelo('Honda XRE 300cc'), { modelo: 'Honda XRE 300', ano: null });
  assert.deepEqual(limparNomeModelo('Harley-Davidson Sportster 1200'), { modelo: 'Harley-Davidson Sportster 1200', ano: null });
});
test('motos premium geram variacoes da versao base', () => {
  const ducati = variacoesModelo('Ducati Panigale V4 S').map((item) => item.consulta);
  assert.ok(ducati.includes('Ducati Panigale V4'));
  assert.ok(ducati.includes('Panigale V4 S'));
  const bmw = variacoesModelo('BMW R 1250 GS Adventure').map((item) => item.consulta);
  assert.ok(bmw.includes('BMW R1250 GS Adventure') || bmw.includes('BMW R 1250 GS'));
  assert.ok(bmw.includes('BMW R 1250 GS'));
  const harley = variacoesModelo('Harley-Davidson Fat Boy 114').map((item) => item.consulta);
  assert.ok(harley.includes('Fat Boy 114'));
});

test('marcador reconhece o turquesa real do FLUX e ignora azul fixo', () => {
  // Pixels medidos nas geracoes reais (CG 160, Fazer, Biz) de 25/11/2026.
  for (const [r, g, b] of [[2, 234, 255], [115, 239, 251], [0, 184, 211], [32, 84, 105], [0, 184, 255]])
    assert.equal(ehMarcadorPintura(r, g, b), true, `${r},${g},${b}`);
  // Rodas/garfos azuis, magenta e verde do fundo, cinza metalico.
  for (const [r, g, b] of [[30, 83, 193], [23, 74, 171], [176, 16, 216], [0, 255, 0], [200, 200, 200], [20, 20, 22]])
    assert.equal(ehMarcadorPintura(r, g, b), false, `${r},${g},${b}`);
});
test('referencias: foto deitada e recente vem antes de close em pe ou geracao antiga', async () => {
  const { prioridadeFonte } = await import('../src/miniaturas/pesquisa.ts');
  const base = { url: 'u', resumo: '', imagem: 'i', correspondencia: 'exata' };
  const atual = { ...base, titulo: '2021 Triumph Tiger 900 GT', largura: 4000, altura: 2600, anoFoto: 2021 };
  const antiga = { ...base, titulo: 'Tiger 900 (T400)', largura: 3000, altura: 2000, anoFoto: 1996 };
  const close = { ...base, titulo: 'BMW S 1000 RR - 03', largura: 2000, altura: 3000 };
  const deitada = { ...base, titulo: 'BMW S 1000 RR - 01', largura: 3000, altura: 2000 };
  assert.ok(prioridadeFonte(atual) > prioridadeFonte(antiga));
  assert.ok(prioridadeFonte(deitada) > prioridadeFonte(close));
  // Com ano pedido, a foto mais proxima desse ano ganha.
  assert.ok(prioridadeFonte(antiga, 1997) > prioridadeFonte(atual, 1997));
});
