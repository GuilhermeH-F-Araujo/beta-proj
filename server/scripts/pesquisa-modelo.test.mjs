import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatarNomeModeloMoto,verificarModeloMotocicleta,sugestoesCatalogo} from '../src/pesquisaModelo.ts';

test('formata sem trocar silenciosamente marca, modelo ou cilindrada',()=>{
  assert.equal(formatarNomeModeloMoto('  hONDa   crf1100l   africa   TWIN  '),'Honda CRF1100L Africa Twin');
  assert.equal(formatarNomeModeloMoto('africa twin trx 250'),'Africa Twin TRX 250');
  assert.equal(formatarNomeModeloMoto('yamaha faizer 250'),'Yamaha Faizer 250');
  assert.equal(formatarNomeModeloMoto('pop100'),'Pop 100');
  assert.equal(formatarNomeModeloMoto('honda cg160'),'Honda CG 160');
});
test('página de lista ou menção no resumo não confirma uma moto diferente',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>Response.json({query:{search:[
      {title:'Lista de motocicletas Yamaha',snippet:'Africa Twin TRX 250 ==Referências=='},
      {title:'Honda Africa Twin',snippet:'Motocicleta Honda de uso misto.'},
    ]}});
    const result=await verificarModeloMotocicleta('africa twin trx 250',['Honda Africa Twin','Yamaha Fazer 250']);
    assert.equal(result.research,null);
    assert(!result.suggestions.some(item=>item.name==='Honda Africa Twin'));
    assert(!result.suggestions.some(item=>item.name.includes('Lista')));
    const exact=await verificarModeloMotocicleta('Honda Africa Twin');
    assert.equal(exact.research?.title,'Honda Africa Twin');
    assert.equal(exact.research?.matched,true);
    assert(!exact.suggestions.some(item=>item.name==='Twin'));
  } finally {globalThis.fetch=original;}
});
test('catálogo oferece grafias próximas sem propor cilindrada diferente',()=>{
  const names=sugestoesCatalogo('yamaha faizer 250',['Yamaha Fazer 250','Yamaha Fazer 150','Honda CG 160']);
  assert.equal(names[0]?.name,'Yamaha Fazer 250');
  assert(!names.some(item=>item.name.includes('150')));
});
test('versões da mesma família aparecem sem sugerir outra Honda',()=>{
  const names=sugestoesCatalogo('Honda Africa Twin',['Honda Africa Twin CRF1000L','Honda Africa Twin CRF1100L Adventure Sports','Honda CG 160','Kawasaki Africa Twin']);
  assert.deepEqual(names.map(item=>item.name),['Honda Africa Twin CRF1000L','Honda Africa Twin CRF1100L Adventure Sports']);
});
