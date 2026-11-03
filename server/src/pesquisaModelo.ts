/** Pesquisa textual de apoio. Um título semelhante não prova que uma imagem esteja correta. */
export type PesquisaMotocicleta={ title:string; summary:string; url:string; matched:boolean; warning:string } | null;
export type SugestaoMotocicleta={ name:string; source:'catalog'|'wikipedia'; url?:string };
const articles=new Set(['de','da','do','das','dos']);
const brands=new Map(Object.entries({honda:'Honda',yamaha:'Yamaha',kawasaki:'Kawasaki',suzuki:'Suzuki',bmw:'BMW',ducati:'Ducati',triumph:'Triumph',harley:'Harley',royal:'Royal',enfield:'Enfield',ktm:'KTM',bajaj:'Bajaj',shineray:'Shineray',haojue:'Haojue',dafra:'Dafra'}));
const codes=new Set(['cg','nxr','crf','trx','xre','gs','cb','cbr','mt','fz','xt','yz','r','z','zx','xr','wr']);
export function formatarNomeModeloMoto(input:string) {
  return input.normalize('NFKC').replace(/[\u0000-\u001f<>]/g,' ').replace(/[_]+/g,' ').replace(/\b(pop|biz|bros|fan|titan|cg|xre|nxr|cb)(?=\d)/gi,'$1 ').replace(/\s*([/-])\s*/g,'$1').replace(/\s+/g,' ').trim().split(' ').map((word,index)=>{
    const lower=word.toLocaleLowerCase('pt-BR');
    if(brands.has(lower)) return brands.get(lower)!;
    if(codes.has(lower)) return lower.toUpperCase();
    if(index>0 && articles.has(lower)) return lower;
    if(/^[a-z]{1,4}[\s-]?\d/i.test(word)) return word.toUpperCase();
    return lower.replace(/(^|[-/])([a-zà-ÿ])/g,(_m,separator,letter)=>separator+letter.toLocaleUpperCase('pt-BR'));
  }).join(' ');
}
export function norm(value:string) {return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
const terms=(value:string)=>norm(value).split(' ').filter(Boolean);
function cleanSnippet(value:string) {
  return value.replace(/<[^>]*>/g,' ').replace(/&(?:quot|#34);/g,'"').replace(/&(?:amp|#38);/g,'&').replace(/&(?:lt|gt|nbsp);/g,' ').replace(/\[\d+\]/g,' ').split(/(?:==\s*refer[eê]ncias\s*==|==\s*references\s*==)/i)[0].replace(/\s+/g,' ').trim().slice(0,330);
}
function generic(title:string) {return /^(?:lista de|list of|category|categoria|comparison of|anexo)/i.test(norm(title));}
function titleMatches(model:string,title:string) {
  if(generic(title)) return false;
  const haystack=terms(title),requested=terms(model);
  return requested.length>0 && requested.every(term=>haystack.includes(term));
}
function similarity(query:string,title:string) {
  const requested=terms(query),candidate=terms(title);
  const matches=requested.filter(token=>candidate.includes(token)).length;
  const distinctive=requested.filter(token=>!brands.has(token));
  const requestedBrand=requested.find(token=>brands.has(token));
  const candidateBrands=candidate.filter(token=>brands.has(token));
  if(!matches || generic(title) || !distinctive.length || !distinctive.every(token=>candidate.includes(token)) ||
    (requestedBrand && candidateBrands.length>0 && !candidateBrands.includes(requestedBrand))) return 0;
  return matches/requested.length + (titleMatches(query,title)?2:0);
}
function editDistance(a:string,b:string) {
  if(Math.abs(a.length-b.length)>2) return 3;
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {const next=[i];for(let j=1;j<=b.length;j++) next[j]=Math.min(row[j]+1,next[j-1]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}
  return row[b.length];
}
export function sugestoesCatalogo(query:string,models:string[]):SugestaoMotocicleta[] {
  const search=terms(query);
  const requestedBrand=search.find(token=>brands.has(token));
  const family=search.filter(token=>!brands.has(token));
  if(!family.length)return [];
  return models.map(name=>{
    const candidate=terms(name);
    const candidateBrands=candidate.filter(token=>brands.has(token));
    if(requestedBrand && candidateBrands.length && !candidateBrands.includes(requestedBrand))return {name,score:0};
    if(!family.every(token=>candidate.some(part=>part===token ||
      (!/[0-9]/.test(token+part) && token.length>=4 && part.length>=4 && editDistance(token,part)<=2))))return {name,score:0};
    const score=search.reduce((sum,token)=>sum+(candidate.some(part=>part===token)?3:candidate.some(part=>part.startsWith(token)||token.startsWith(part))?2:candidate.some(part=>!/[0-9]/.test(token+part)&&editDistance(token,part)<=2)?1:0),0);
    const numbers=search.filter(token=>/\d/.test(token));
    return {name,score:numbers.some(number=>!candidate.includes(number))?0:score};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,5).map(({name})=>({name:formatarNomeModeloMoto(name),source:'catalog'}));
}
type SearchHit={title:string;snippet:string};
const cache=new Map<string,{expires:number;result:SearchHit[]}>();
async function wikiSearch(language:'pt'|'en',query:string):Promise<SearchHit[]> {
  const key=`${language}:${norm(query)}`;
  const cached=cache.get(key);
  if(cached && cached.expires>Date.now()) return cached.result;
  try {
    const params=new URLSearchParams({action:'query',list:'search',srsearch:query,srnamespace:'0',srlimit:'7',srprop:'snippet',format:'json',formatversion:'2'});
    const response=await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`,{headers:{'User-Agent':'EstacaoMotosPreview/1.0 (model-research)'},signal:AbortSignal.timeout(5_000)});
    if(!response.ok) return [];
    const payload=await response.json() as {query?:{search?:SearchHit[]}};
    const result=payload.query?.search??[];
    if(cache.size>=200) cache.delete(cache.keys().next().value!);
    cache.set(key,{expires:Date.now()+10*60_000,result});
    return result;
  } catch {return [];}
}
export async function verificarModeloMotocicleta(input:string,registered:string[]=[]):Promise<{formattedModel:string;research:PesquisaMotocicleta;suggestions:SugestaoMotocicleta[]}> {
  const formattedModel=formatarNomeModeloMoto(input);
  const requested=terms(formattedModel);
  if(formattedModel.length<3||formattedModel.length>100) return {formattedModel,research:null,suggestions:[]};
  const variants=requested.length>2 ? [requested.slice(0,2).join(' '),requested.slice(-2).join(' ')] : [];
  const queries=[...new Set([formattedModel,...variants].filter(Boolean))];
  const searches=await Promise.all(queries.flatMap(q=>['pt','en'].map(async language=>({language,results:await wikiSearch(language as 'pt'|'en',q)}))));
  const hits=searches.flatMap(({language,results})=>results.map(item=>({...item,language,score:similarity(formattedModel,item.title)}))).filter(item=>item.score>0).sort((a,b)=>b.score-a.score);
  const exact=hits.find(item=>titleMatches(formattedModel,item.title));
  const research:PesquisaMotocicleta=exact?{title:exact.title,summary:cleanSnippet(exact.snippet),url:`https://${exact.language}.wikipedia.org/wiki/${encodeURIComponent(exact.title.replace(/ /g,'_'))}`,matched:true,warning:'Título correspondente encontrado. Confira a variante e a aparência na prévia.'}:null;
  const suggestions=sugestoesCatalogo(formattedModel,registered);
  const seen=new Set(suggestions.map(item=>norm(item.name)));
  for(const hit of hits) {
    if(suggestions.length>=7) break;
    const name=formatarNomeModeloMoto(hit.title);
    if(seen.has(norm(name))||name.length>80) continue;
    suggestions.push({name,source:'wikipedia',url:`https://${hit.language}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g,'_'))}`});
    seen.add(norm(name));
  }
  return {formattedModel,research,suggestions};
}
export async function pesquisarMotocicleta(model:string):Promise<PesquisaMotocicleta> {
  return (await verificarModeloMotocicleta(model)).research;
}
