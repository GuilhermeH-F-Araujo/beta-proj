import assert from 'node:assert/strict';
import { test } from 'node:test';
import { approveModelPreview, getCachedModelPreview, getCandidatePreview, generateModelCandidate, modelPreviewPath, generatedPreviewPath, saveCandidatePreview, MODEL_PREVIEW_BUCKET, FREE_MODEL_PREVIEW_BUCKET, approvedPreviewPath } from '../src/previaModelo.ts';

const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(120)]);
function storageMock() {
  const files=new Map();
  return { files, db:{ storage:{
    from:bucket=>({
      async list(_, {search}) { return { data:[...files.keys()].filter(k=>k.startsWith(`${bucket}/approved/${search}`)).map(k=>({name:k.split('/').at(-1),updated_at:'2026-09-28'})),error:null }; },
      async download(path) { const bytes=files.get(`${bucket}/${path}`); return { data:bytes ? new Blob([bytes]) : null,error:bytes ? null : {message:'not found'} }; },
      async upload(path,bytes) { files.set(`${bucket}/${path}`,Buffer.from(bytes));return {error:null}; },
      async remove(paths) { for(const p of paths) files.delete(`${bucket}/${p}`);return {error:null}; },
    }), async getBucket() { return {data:{id:'bucket'},error:null}; },
  } } };
}
test('imagem automática antiga não entra no cache compartilhado; candidata exige aprovação',async()=>{
  const {db,files}=storageMock();
  const model='Honda CRF1100L Africa Twin';
  assert.equal(modelPreviewPath(' HONDA  Africa Twin '),modelPreviewPath('honda africa twin'));
  assert.notEqual(modelPreviewPath(model),generatedPreviewPath(model));
  files.set(`${MODEL_PREVIEW_BUCKET}/${modelPreviewPath(model)}`,jpeg);
  files.set(`${FREE_MODEL_PREVIEW_BUCKET}/${generatedPreviewPath(model).replace(/png$/,'jpg')}`,jpeg);
  assert.equal(await getCachedModelPreview(db,model),null);
  await saveCandidatePreview(db,model,jpeg);
  assert.deepEqual(await getCandidatePreview(db,model),jpeg);
  assert.equal(await getCachedModelPreview(db,model),null);
  await approveModelPreview(db,model,jpeg);
  assert.deepEqual(await getCachedModelPreview(db,model),jpeg);
  assert(files.has(`moto-modelos-revisados/${approvedPreviewPath(model,'image/jpeg')}`));
});
test('cota da primeira conta tenta a segunda sem publicar automaticamente',async()=>{
  const before={provider:process.env.MODEL_IMAGE_PROVIDER,accounts:process.env.MODEL_IMAGE_ACCOUNTS_JSON};
  const oldFetch=globalThis.fetch;const {db}=storageMock();const called=[];
  try {
    process.env.MODEL_IMAGE_PROVIDER='cloudflare';
    process.env.MODEL_IMAGE_ACCOUNTS_JSON=JSON.stringify([{name:'a',accountId:'quota-first',apiToken:'a'},{name:'b',accountId:'ready-second',apiToken:'b'}]);
    globalThis.fetch=async (url,request)=>{
      called.push(url);
      assert.match(url,/flux-1-schnell$/);
      const input=JSON.parse(request.body);
      assert.deepEqual(Object.keys(input).sort(),['prompt','steps']);
      assert.equal(input.steps,4);
      return url.includes('quota-first') ? new Response(JSON.stringify({success:false,errors:[{code:3036,message:'Daily quota'}]}),{status:429}) : Response.json({success:true,result:{image:jpeg.toString('base64')}});
    };
    assert.deepEqual(await generateModelCandidate('Honda CRF1100L Africa Twin',{notes:'',research:'Honda Africa Twin trail bicilíndrica'}),jpeg);
    assert.equal(called.length,2);
    assert.equal(await getCachedModelPreview(db,'Honda CRF1100L Africa Twin'),null);
  } finally {globalThis.fetch=oldFetch;for(const [key,value] of Object.entries(before)){const name=key==='provider'?'MODEL_IMAGE_PROVIDER':'MODEL_IMAGE_ACCOUNTS_JSON';if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
test('quatro fotos são anexadas como entradas separadas ao FLUX.2',async()=>{
  const previous={provider:process.env.MODEL_IMAGE_PROVIDER,accounts:process.env.MODEL_IMAGE_ACCOUNTS_JSON};
  const oldFetch=globalThis.fetch;
  try {
    process.env.MODEL_IMAGE_PROVIDER='cloudflare';
    process.env.MODEL_IMAGE_ACCOUNTS_JSON=JSON.stringify([{name:'referências',accountId:'four-reference-test',apiToken:'test'}]);
    globalThis.fetch=async(url,init)=>{
      assert.match(url,/flux-2-klein-4b$/);
      assert(init.body instanceof FormData);
      assert(!('Content-Type' in init.headers));
      for(let i=0;i<4;i++)assert(init.body.get(`input_image_${i}`) instanceof Blob);
      assert.equal(init.body.get('input_image_4'),null);
      assert.match(init.body.get('prompt'),/Honda Africa Twin/);
      return Response.json({success:true,result:{image:jpeg.toString('base64')}});
    };
    const references=Array.from({length:4},()=>({bytes:jpeg,mime:'image/jpeg'}));
    assert.deepEqual(await generateModelCandidate('Honda Africa Twin',{notes:'',references}),jpeg);
  } finally {
    globalThis.fetch=oldFetch;
    for(const [key,value] of Object.entries(previous)){const name=key==='provider'?'MODEL_IMAGE_PROVIDER':'MODEL_IMAGE_ACCOUNTS_JSON';if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
});
