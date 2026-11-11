import {buscarCompartilhado,salvarCompartilhado} from './dadosCompartilhados';
import {pode} from './acessoConta';
export type CategoriaServico={id:string;nome:string;descricao:string;cor:string;icone:string};
export type ItemCatalogoServico={id:string;nome:string;categoriaId:string;descricao:string;preco:number;custo:number;duracao:string;ativo:boolean;icone:string;adicional:string};
export type CatalogoServicos={categorias:CategoriaServico[];servicos:ItemCatalogoServico[]};

let catalogoMemoria:CatalogoServicos|undefined;
const STORAGE_KEY='estacao-motos-catalogo-servicos-v1';
export const CATALOGO_SERVICOS_EVENT='estacao-motos-catalogo-servicos-atualizado';
export const categoriasIniciais:CategoriaServico[]=[
  {id:'manutencao',nome:'Manutenção',descricao:'Serviços de manutenção preventiva e corretiva.',cor:'#3B82F6',icone:'wrench'},
  {id:'freios',nome:'Freios',descricao:'Serviços relacionados ao sistema de freios.',cor:'#F04444',icone:'gauge'},
  {id:'injecao',nome:'Injeção',descricao:'Serviços de injeção eletrônica e carburador.',cor:'#16A36A',icone:'activity'},
  {id:'eletrica',nome:'Elétrica',descricao:'Serviços do sistema elétrico da motocicleta.',cor:'#F59E0B',icone:'activity'},
  {id:'transmissao',nome:'Transmissão',descricao:'Serviços de corrente, coroa, pinhão e embreagem.',cor:'#8B5CF6',icone:'refresh'},
  {id:'rodas',nome:'Rodas',descricao:'Serviços de rodas, pneus e balanceamento.',cor:'#EF4444',icone:'gauge'},
];
export const servicosIniciais:ItemCatalogoServico[]=[
  {id:'svc-oleo',nome:'Troca de Óleo do Motor',categoriaId:'manutencao',descricao:'Troca do óleo e verificação do nível de lubrificação.',preco:80,custo:35,duracao:'30 min',ativo:true,icone:'wrench',adicional:''},
  {id:'svc-revisao',nome:'Revisão Periódica',categoriaId:'manutencao',descricao:'Inspeção preventiva dos principais componentes.',preco:150,custo:65,duracao:'1h 30min',ativo:true,icone:'clipboard-check',adicional:''},
  {id:'svc-carburador',nome:'Limpeza do Carburador',categoriaId:'injecao',descricao:'Limpeza e ajuste do sistema de alimentação.',preco:120,custo:50,duracao:'1h',ativo:true,icone:'activity',adicional:''},
  {id:'svc-pastilha',nome:'Troca de Pastilhas de Freio',categoriaId:'freios',descricao:'Substituição e conferência das pastilhas.',preco:100,custo:45,duracao:'45 min',ativo:true,icone:'gauge',adicional:''},
  {id:'svc-balanceamento',nome:'Balanceamento de Rodas',categoriaId:'rodas',descricao:'Balanceamento para uma condução mais estável.',preco:60,custo:25,duracao:'30 min',ativo:true,icone:'gauge',adicional:''},
  {id:'svc-corrente',nome:'Regulagem de Corrente',categoriaId:'transmissao',descricao:'Ajuste de tensão e lubrificação da corrente.',preco:40,custo:15,duracao:'20 min',ativo:true,icone:'refresh',adicional:''},
  {id:'svc-diagnostico',nome:'Diagnóstico Eletrônico',categoriaId:'eletrica',descricao:'Leitura de falhas e verificação dos sensores.',preco:90,custo:30,duracao:'45 min',ativo:true,icone:'activity',adicional:''},
  {id:'svc-bateria',nome:'Troca de Bateria',categoriaId:'eletrica',descricao:'Substituição da bateria e teste do sistema de carga.',preco:50,custo:20,duracao:'20 min',ativo:true,icone:'activity',adicional:''},
];
const defaults:CatalogoServicos={categorias:categoriasIniciais,servicos:servicosIniciais};

export function lerCatalogoServicos():CatalogoServicos{
  if(catalogoMemoria)return catalogoMemoria;
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return defaults;
    const value=JSON.parse(raw) as Partial<CatalogoServicos>;
    if(!Array.isArray(value.categorias)||!Array.isArray(value.servicos))return defaults;
    return {categorias:value.categorias,servicos:value.servicos};
  }catch{return defaults;}
}
export async function salvarCatalogoServicos(catalogo:CatalogoServicos){
  const anterior=lerCatalogoServicos();
  if(catalogo.servicos.some(s=>!anterior.servicos.some(a=>a.id===s.id))&&!pode('servicos','criar')||anterior.servicos.some(s=>!catalogo.servicos.some(a=>a.id===s.id))&&!pode('servicos','excluir')||catalogo.servicos.some(s=>{const a=anterior.servicos.find(a=>a.id===s.id);return a&&JSON.stringify(a)!==JSON.stringify(s)})&&!pode('servicos','editar')||JSON.stringify(catalogo.categorias)!==JSON.stringify(anterior.categorias)&&!pode('servicos','editar'))throw new Error('Seu cargo não permite alterar este item do catálogo.');
  await salvarCompartilhado('catalogo',catalogo);
  receberCatalogo(catalogo);
}
export function receberCatalogo(catalogo:CatalogoServicos){
  catalogoMemoria=catalogo;
  try{const antigo=localStorage.getItem(STORAGE_KEY);if(antigo&&!localStorage.getItem(STORAGE_KEY+'-backup-pre-v78'))localStorage.setItem(STORAGE_KEY+'-backup-pre-v78',antigo);localStorage.setItem(STORAGE_KEY,JSON.stringify(catalogo));}catch{/* A gravação no servidor já foi confirmada; cache indisponível não desfaz a operação. */}
  window.dispatchEvent(new CustomEvent(CATALOGO_SERVICOS_EVENT));
}
export function observarCatalogoServicos(callback:()=>void){
  window.addEventListener(CATALOGO_SERVICOS_EVENT,callback);
  const changed=(event:StorageEvent)=>{if(event.key===STORAGE_KEY){catalogoMemoria=undefined;callback()}};
  window.addEventListener('storage',changed);
  return()=>{window.removeEventListener(CATALOGO_SERVICOS_EVENT,callback);window.removeEventListener('storage',changed);};
}

export async function atualizarCatalogoCompartilhado(){const result=await buscarCompartilhado<CatalogoServicos>('catalogo');if(result){receberCatalogo(result);return result}if(!pode('servicos','criar')){const empty={categorias:[],servicos:[]};receberCatalogo(empty);return empty}const local=lerCatalogoServicos();const saved=await salvarCompartilhado('catalogo',local);receberCatalogo(saved);return saved}
