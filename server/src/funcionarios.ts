import { Router, type Request, type Response } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

type Ordem = { id_os:number; id_mecanico:number|null; id_moto:number; status:string; data_entrada:string; data_saida:string|null; previsao_entrega:string|null; total:number|null };
type Pessoa = {id_funcionario:number; nome:string; cargo:string; cpf:string; email:string|null; telefone:string|null; auth_user_id:string|null; data_nascimento?:string|null; data_admissao?:string|null; departamento?:string|null; especialidade?:string|null; endereco?:string|null; situacao?:string|null};
const concluidas=new Set(['pronto','entregue']);
const abertas=new Set(['aguardando','em andamento']);
const mesAtual=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
const mesSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const idSchema=z.coerce.number().int().positive();

async function lerPaginas<T>(db:SupabaseClient,tabela:string,colunas:string,chave:string,filtro?:{coluna:string;valor:number}):Promise<T[]> {
  const result:T[]=[];
  for(let inicio=0;;inicio+=500){
    let query=db.from(tabela).select(colunas).order(chave).range(inicio,inicio+499);
    if(filtro)query=query.eq(filtro.coluna,filtro.valor);
    const {data,error}=await query;if(error)throw error;
    result.push(...(data??[]) as T[]);if(!data||data.length<500)return result;
  }
}
export function resumoFuncionario(ordens:Ordem[],mes:string){
  const periodo=ordens.filter(o=>o.data_entrada.slice(0,7)===mes);
  const feitas=periodo.filter(o=>concluidas.has(o.status)).length;
  return {total:periodo.length,concluidas:feitas,abertas:periodo.filter(o=>abertas.has(o.status)).length,
    pecas:periodo.filter(o=>o.status==='aguardando peça').length,canceladas:periodo.filter(o=>o.status==='cancelada').length,
    taxa:periodo.length?Math.round(feitas/periodo.length*100):0,
    totalConcluidas:ordens.filter(o=>concluidas.has(o.status)).length,
    totalAbertas:ordens.filter(o=>abertas.has(o.status)||o.status==='aguardando peça').length};
}
const colunasOrdem='id_os,id_mecanico,id_moto,status,data_entrada,data_saida,previsao_entrega,total';
const camposExtras=['data_nascimento','data_admissao','departamento','especialidade','endereco','situacao'];
const permissao=(row:Pessoa)=>camposExtras.every(c=>Object.hasOwn(row,c));
const conta=(row:Pessoa)=>({id:row.id_funcionario,nome:row.nome,cargo:row.cargo,email:row.email,telefone:row.telefone,
  departamento:row.departamento??null,situacao:row.situacao??'nao_informado',admissao:row.data_admissao??null,
  temConta:!!row.auth_user_id});
const adminRole=(value:string|null|undefined)=>(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()==='administrador';
const isBanned=(user:{banned_until?:string|null}|null|undefined)=>{const date=Date.parse(user?.banned_until??'');return Number.isFinite(date)&&date>Date.now();};

export function rotasFuncionarios(autorizar:(req:Request,res:Response)=>Promise<SupabaseClient|null>){
  const router=Router();
  router.use(async(req,res,next)=>{try{const db=await autorizar(req,res);if(!db)return;res.locals.funcionariosDb=db;res.setHeader('Cache-Control','private, no-store');next();}catch(error){next(error);}});
  const db=(res:Response)=>res.locals.funcionariosDb as SupabaseClient;
  const texto=(max:number)=>z.string().trim().max(max);
  const data=z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).refine(v=>{if(!v)return true;const d=new Date(`${v}T12:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
  router.post('/',async(req,res,next)=>{try{
    const body=z.object({nome:texto(100).min(2),email:z.email().max(150),telefone:texto(20).refine(v=>v.replace(/\D/g,'').length>=10),cpf:texto(14).refine(v=>v.replace(/\D/g,'').length===11),senha:z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^\w\s]/),
      cargo:z.enum(['Administrador','Gerente','Mecânico']),data_nascimento:data,data_admissao:data,departamento:texto(100),especialidade:texto(150),endereco:texto(300),cep:texto(12),complemento:texto(120),
      tipo_contrato:texto(40),comissao_servico:z.number().min(0).max(100).nullable(),observacoes_profissionais:texto(2000),situacao:z.enum(['ativo','ferias','afastado','desligado'])}).strict().safeParse(req.body);
    if(!body.success)return res.status(400).json({message:'Confira os dados do funcionário.'});
    const p=body.data;const adminDb=db(res);
    const [{data:byEmail,error:emailError},{data:byCpf,error:cpfError}]=await Promise.all([
      adminDb.from('funcionario').select('id_funcionario').ilike('email',p.email).limit(1),
      adminDb.from('funcionario').select('id_funcionario').eq('cpf',p.cpf.replace(/\D/g,'' )).limit(1),
    ]);
    if(emailError||cpfError)throw emailError??cpfError;
    if(byEmail?.length||byCpf?.length)return res.status(409).json({message:'Este CPF ou e-mail já pertence a outro funcionário.'});
    const email=p.email.trim().toLowerCase();
    const {data:auth,error:authError}=await adminDb.auth.admin.createUser({email,password:p.senha,email_confirm:true});
    if(authError||!auth.user)return res.status(409).json({message:'Não foi possível criar o acesso. Confira se este e-mail já está em uso.'});
    const {senha:ignored,...dados}=p;void ignored;
    const {data:id,error}=await adminDb.rpc('cadastrar_funcionario',{p_payload:{...dados,cpf:p.cpf.replace(/\D/g,''),email,id_usuario_autenticacao:auth.user.id}});
    if(error){const {error:cleanupError}=await adminDb.auth.admin.deleteUser(auth.user.id);if(cleanupError)return res.status(500).json({message:'A conta de acesso foi criada, mas o cadastro falhou. Contate o administrador antes de tentar novamente.'});if(error.code==='23505')return res.status(409).json({message:'Este CPF ou e-mail já pertence a outro funcionário.'});throw error;}
    return res.status(201).json({id});
  }catch(error){next(error);}});
  router.get('/',async(req,res,next)=>{try{
    const mes=mesSchema.safeParse(req.query.mes??mesAtual());if(!mes.success)return res.status(400).json({message:'Mês inválido.'});
    const [pessoas,ordens]=await Promise.all([
      lerPaginas<Pessoa>(db(res),'funcionario','*','id_funcionario'),
      lerPaginas<Ordem>(db(res),'ordem_servico',colunasOrdem,'id_os'),
    ]);
    const porPessoa=new Map<number,Ordem[]>();for(const o of ordens)if(o.id_mecanico!=null){const grupo=porPessoa.get(o.id_mecanico)??[];grupo.push(o);porPessoa.set(o.id_mecanico,grupo);}
    return res.json({mes:mes.data,itens:pessoas.map(p=>({...conta(p),resumo:resumoFuncionario(porPessoa.get(p.id_funcionario)??[],mes.data)})),camposExtras:pessoas.length?permissao(pessoas[0]):true});
  }catch(error){next(error);}});
  router.get('/:id/photo',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id);if(!id.success)return res.status(400).end();
    const {data,error}=await db(res).from('funcionario').select('auth_user_id').eq('id_funcionario',id.data).maybeSingle();if(error)throw error;
    if(!data?.auth_user_id)return res.status(404).end();
    const photo=await db(res).storage.from('admin-avatars').download(`admins/${data.auth_user_id}/avatar.jpg`);
    if(photo.error||!photo.data)return res.status(404).end();
    res.setHeader('Cache-Control','private, max-age=120');res.setHeader('Vary','Cookie');return res.type('image/jpeg').send(Buffer.from(await photo.data.arrayBuffer()));
  }catch(error){next(error);}});
  router.get('/:id',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),mes=mesSchema.safeParse(req.query.mes??mesAtual());
    if(!id.success||!mes.success)return res.status(400).json({message:'Funcionário ou mês inválido.'});
    const {data:p,error}=await db(res).from('funcionario').select('*').eq('id_funcionario',id.data).maybeSingle();if(error)throw error;
    if(!p)return res.status(404).json({message:'Funcionário não encontrado.'});
    let acessoBloqueado=false;
    if(p.auth_user_id){const {data:auth,error:authError}=await db(res).auth.admin.getUserById(p.auth_user_id);if(authError)throw authError;acessoBloqueado=isBanned(auth.user as (typeof auth.user & {banned_until?:string|null}));}
    const ordens=await lerPaginas<Ordem>(db(res),'ordem_servico',colunasOrdem,'id_os',{coluna:'id_mecanico',valor:id.data});
    const ids=ordens.map(o=>o.id_os),motosIds=[...new Set(ordens.map(o=>o.id_moto))];
    // Consultas em lotes: nenhuma requisição por linha da tabela.
    const motos=[] as {id_moto:number;id_cliente:number;modelo:string;placa:string;ano:number}[];
    const servicos=[] as {id_os:number;descricao:string;preco:number}[];
    for(let i=0;i<Math.max(ids.length,motosIds.length);i+=200){
      const [m,s]=await Promise.all([
        motosIds.slice(i,i+200).length?db(res).from('moto').select('id_moto,id_cliente,modelo,placa,ano').in('id_moto',motosIds.slice(i,i+200)):Promise.resolve({data:[],error:null}),
        ids.slice(i,i+200).length?db(res).from('os_servico').select('id_os,descricao,preco').in('id_os',ids.slice(i,i+200)):Promise.resolve({data:[],error:null}),
      ]);if(m.error||s.error)throw m.error??s.error;motos.push(...(m.data??[]));servicos.push(...(s.data??[]));
    }
    const clientesIds=[...new Set(motos.map(m=>m.id_cliente))];const clientes=[] as {id_cliente:number;nome:string}[];
    for(let i=0;i<clientesIds.length;i+=200){const r=await db(res).from('cliente').select('id_cliente,nome').in('id_cliente',clientesIds.slice(i,i+200));if(r.error)throw r.error;clientes.push(...(r.data??[]));}
    const [documentos,notas]=permissao(p)?await Promise.all([
      db(res).from('funcionario_documento').select('id,tipo,numero,validade,criado_em').eq('id_funcionario',id.data).order('id',{ascending:false}).limit(100),
      db(res).from('funcionario_nota').select('id,texto,criado_em,id_usuario').eq('id_funcionario',id.data).order('criado_em',{ascending:false}).order('id',{ascending:false}).limit(100),
    ]):[{data:[],error:null},{data:[],error:null}];
    if(documentos.error||notas.error)throw documentos.error??notas.error;
    const autores=[...new Set((notas.data??[]).map(n=>n.id_usuario).filter(Boolean))];
    const autoresResult=autores.length?await db(res).from('funcionario').select('auth_user_id,nome').in('auth_user_id',autores):{data:[],error:null};if(autoresResult.error)throw autoresResult.error;
    const nomes=new Map((autoresResult.data??[]).map(a=>[a.auth_user_id,a.nome]));
    const motoMap=new Map(motos.map(m=>[m.id_moto,m])),clienteMap=new Map(clientes.map(c=>[c.id_cliente,c.nome]));
    const servicoMap=new Map<number,typeof servicos>();for(const s of servicos){const rows=servicoMap.get(s.id_os)??[];rows.push(s);servicoMap.set(s.id_os,rows);}
    const series=[];for(let i=5;i>=0;i--){const date=new Date(`${mes.data}-15T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-i);const key=date.toISOString().slice(0,7);series.push({mes:key,...resumoFuncionario(ordens,key)});}
    return res.json({pessoa:{...conta(p),acessoBloqueado,cpf:p.cpf,nascimento:p.data_nascimento??null,especialidade:p.especialidade??null,endereco:p.endereco??null},
      mes:mes.data,camposExtras:permissao(p),resumo:{...resumoFuncionario(ordens,mes.data),clientes:clientes.length},series,
      ordens:ordens.filter(o=>o.data_entrada.slice(0,7)===mes.data).sort((a,b)=>b.data_entrada.localeCompare(a.data_entrada)||b.id_os-a.id_os).map(o=>{
        const moto=motoMap.get(o.id_moto),itens=servicoMap.get(o.id_os)??[];
        return{id:o.id_os,entrada:o.data_entrada,saida:o.data_saida,previsao:o.previsao_entrega,status:o.status,
          cliente:moto?clienteMap.get(moto.id_cliente)??'Não informado':'Não informado',veiculo:moto?.modelo??'Não informado',placa:moto?.placa??null,ano:moto?.ano??null,
          servico:itens.map(s=>s.descricao).join(', ')||'Não informado',maoDeObra:itens.length?itens.reduce((n,s)=>n+Number(s.preco),0):null};}),
      documentos:documentos.data??[],notas:(notas.data??[]).map(n=>({...n,autor:nomes.get(n.id_usuario)??'Administrador'}))});
  }catch(error){next(error);}});
  router.patch('/:id/access',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),body=z.object({bloqueado:z.boolean()}).strict().safeParse(req.body);
    if(!id.success||!body.success)return res.status(400).json({message:'Não foi possível identificar a alteração de acesso.'});
    const {data:p,error}=await db(res).from('funcionario').select('id_funcionario,nome,cargo,auth_user_id').eq('id_funcionario',id.data).maybeSingle();if(error)throw error;
    if(!p)return res.status(404).json({message:'Funcionário não encontrado.'});
    if(!p.auth_user_id)return res.status(422).json({message:'Este funcionário ainda não tem uma conta de acesso vinculada.'});
    const actorId=String(res.locals.adminUserId??'');
    if(body.data.bloqueado&&p.auth_user_id===actorId)return res.status(409).json({message:'Por segurança, você não pode bloquear a própria conta.'});
    const {data:auth,error:authError}=await db(res).auth.admin.getUserById(p.auth_user_id);if(authError)throw authError;
    const currentlyBlocked=isBanned(auth.user as (typeof auth.user & {banned_until?:string|null}));
    if(currentlyBlocked===body.data.bloqueado)return res.json({ok:true,bloqueado:currentlyBlocked});
    if(body.data.bloqueado&&adminRole(p.cargo)){
      const {data:admins,error:adminsError}=await db(res).from('funcionario').select('auth_user_id,cargo,perfil_acesso').not('auth_user_id','is',null);
      if(adminsError)throw adminsError;
      const activeAdmins=await Promise.all((admins??[]).filter(row=>adminRole(row.cargo)&&adminRole(row.perfil_acesso)).map(async row=>{
        if(!row.auth_user_id)return false;
        const {data:adminAuth,error:adminAuthError}=await db(res).auth.admin.getUserById(row.auth_user_id);
        if(adminAuthError)throw adminAuthError;
        return !isBanned(adminAuth.user as (typeof adminAuth.user & {banned_until?:string|null}));
      }));
      if(activeAdmins.filter(Boolean).length<=1)return res.status(409).json({message:'Não é possível bloquear o último administrador com acesso ativo.'});
    }
    const {data:updated,error:updateError}=await db(res).auth.admin.updateUserById(p.auth_user_id,{ban_duration:body.data.bloqueado?'876000h':'none'});
    if(updateError)throw updateError;
    const blocked=isBanned(updated.user as (typeof updated.user & {banned_until?:string|null}));
    return res.json({ok:true,bloqueado:blocked});
  }catch(error){next(error);}});
  router.patch('/:id/password',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),body=z.object({password:z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/\d/).regex(/[^\w\s]/)}).strict().safeParse(req.body);
    if(!id.success)return res.status(400).json({message:'Funcionário inválido.'});
    if(!body.success)return res.status(400).json({message:'Use pelo menos 8 caracteres, com maiúscula, minúscula, número e símbolo.'});
    const {data:employee,error}=await db(res).from('funcionario').select('nome,auth_user_id').eq('id_funcionario',id.data).maybeSingle();if(error)throw error;
    if(!employee)return res.status(404).json({message:'Funcionário não encontrado.'});
    if(!employee.auth_user_id)return res.status(422).json({message:'Este funcionário ainda não possui uma conta vinculada.'});
    if(employee.auth_user_id===String(res.locals.adminUserId??''))return res.status(409).json({message:'Para alterar sua própria senha, use a opção de segurança do seu perfil.'});
    const {error:updateError}=await db(res).auth.admin.updateUserById(employee.auth_user_id,{password:body.data.password});
    if(updateError)return res.status(400).json({message:'O Supabase não aceitou a nova senha. Confira os requisitos e tente novamente.'});
    return res.json({ok:true});
  }catch(error){next(error);}});
  const dataEdicao=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(`${v}T12:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;}).or(z.literal(''));
  router.patch('/:id',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),body=z.object({nome:texto(100).min(2),cargo:z.enum(['Administrador','Gerente','Mecânico','Cliente']),telefone:texto(20).refine(v=>!v||v.replace(/\D/g,'').length>=10),cpf:texto(14).refine(v=>v.replace(/\D/g,'').length===11),
      nascimento:dataEdicao,admissao:dataEdicao,departamento:texto(100),especialidade:texto(150),endereco:texto(500),situacao:z.enum(['ativo','ferias','afastado','desligado','nao_informado'])}).strict().safeParse(req.body);
    if(!id.success||!body.success)return res.status(400).json({message:'Confira os campos e as datas informadas.'});
    const p=body.data;const {data:updated,error}=await db(res).rpc('admin_update_employee',{p_id:id.data,p_payload:{...p,cpf:p.cpf.replace(/\D/g,'')},p_actor:res.locals.adminUserId});
    if(error?.code==='23505')return res.status(409).json({message:'Este CPF já pertence a outro funcionário.'});
    if(error){const message=String(error.message??'');if(message.includes('próprio acesso')||message.includes('único administrador'))return res.status(409).json({message});throw error;}
    return updated?res.json({ok:true}):res.status(404).json({message:'Funcionário não encontrado.'});
  }catch(error){next(error);}});
  router.post('/:id/photo',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),body=z.object({image:z.string().max(740000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)}).safeParse(req.body);
    if(!id.success||!body.success)return res.status(400).json({message:'Envie uma foto JPEG de até 500 KB.'});
    const {data,error}=await db(res).from('funcionario').select('auth_user_id').eq('id_funcionario',id.data).maybeSingle();if(error)throw error;
    if(!data?.auth_user_id)return res.status(422).json({message:'Vincule uma conta ao funcionário antes de alterar a foto.'});
    const bytes=Buffer.from(body.data.image.split(',')[1],'base64');if(bytes.length>550000||bytes[0]!==255||bytes[1]!==216)return res.status(400).json({message:'Foto JPEG inválida.'});
    const result=await db(res).storage.from('admin-avatars').upload(`admins/${data.auth_user_id}/avatar.jpg`,bytes,{contentType:'image/jpeg',upsert:true,cacheControl:'0'});if(result.error)throw result.error;
    return res.json({ok:true});
  }catch(error){next(error);}});
  router.post('/:id/documentos',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),body=z.object({tipo:texto(40).min(1),numero:texto(80).min(1),validade:data}).strict().safeParse(req.body);
    if(!id.success||!body.success)return res.status(400).json({message:'Confira o tipo, o número e a validade do documento.'});
    const {error}=await db(res).from('funcionario_documento').insert({id_funcionario:id.data,...body.data,validade:body.data.validade||null});if(error)throw error;return res.status(201).json({ok:true});
  }catch(error){next(error);}});
  router.post('/:id/notas',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),body=z.object({texto:texto(2000).min(1)}).strict().safeParse(req.body);
    if(!id.success||!body.success)return res.status(400).json({message:'Escreva uma anotação de até 2.000 caracteres.'});
    const {error}=await db(res).from('funcionario_nota').insert({id_funcionario:id.data,texto:body.data.texto,id_usuario:res.locals.adminUserId});if(error)throw error;return res.status(201).json({ok:true});
  }catch(error){next(error);}});
  router.delete('/:id/:tipo/:item',async(req,res,next)=>{try{
    const id=idSchema.safeParse(req.params.id),item=idSchema.safeParse(req.params.item),tipo=z.enum(['documentos','notas']).safeParse(req.params.tipo);
    if(!id.success||!item.success||!tipo.success)return res.status(400).json({message:'Registro inválido.'});
    const {data,error}=await db(res).from(tipo.data==='documentos'?'funcionario_documento':'funcionario_nota').delete().eq('id_funcionario',id.data).eq('id',item.data).select('id');if(error)throw error;
    return data?.length?res.json({ok:true}):res.status(404).json({message:'Registro não encontrado.'});
  }catch(error){next(error);}});
  return router;
}
