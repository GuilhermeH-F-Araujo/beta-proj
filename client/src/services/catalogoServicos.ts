export type CategoriaServico={id:string;nome:string;descricao:string;cor:string;icone:string};
export type ItemCatalogoServico={id:string;nome:string;categoriaId:string;descricao:string;preco:number;custo:number;duracao:string;ativo:boolean;icone:string;adicional:string};
export type CatalogoServicos={categorias:CategoriaServico[];servicos:ItemCatalogoServico[]};

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
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return defaults;
    const value=JSON.parse(raw) as Partial<CatalogoServicos>;
    if(!Array.isArray(value.categorias)||!Array.isArray(value.servicos))return defaults;
    return {categorias:value.categorias,servicos:value.servicos};
  }catch{return defaults;}
}
export function salvarCatalogoServicos(catalogo:CatalogoServicos){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(catalogo));
  window.dispatchEvent(new CustomEvent(CATALOGO_SERVICOS_EVENT));
}
export function observarCatalogoServicos(callback:()=>void){
  window.addEventListener(CATALOGO_SERVICOS_EVENT,callback);
  window.addEventListener('storage',callback);
  return()=>{window.removeEventListener(CATALOGO_SERVICOS_EVENT,callback);window.removeEventListener('storage',callback);};
}
