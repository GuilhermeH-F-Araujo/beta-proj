import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {resumoFuncionario,rotasFuncionarios} from '../dist/funcionarios.js';
test('indicadores separam peças e canceladas, respeitam o mês e preservam totais históricos',()=>{
 const statuses=['pronto','entregue','aguardando','em andamento','aguardando peça','cancelada'];
 const ordens=statuses.map((status,i)=>({id_os:i,status,data_entrada:'2026-10-02T12:00:00Z'}));
 ordens.push({id_os:9,status:'pronto',data_entrada:'2026-09-30T23:00:00Z'},{id_os:10,status:'aguardando peça',data_entrada:'2026-09-30T23:00:00Z'});
 assert.deepEqual(resumoFuncionario(ordens,'2026-10'),{total:6,concluidas:2,abertas:2,pecas:1,canceladas:1,taxa:33,totalConcluidas:3,totalAbertas:4});
 assert.equal(resumoFuncionario([],'2026-10').taxa,0);
});
test('rotas rejeitam leitura e escrita sem autenticação antes de acessar o banco',async()=>{
 const app=express();app.use('/api/employees',rotasFuncionarios(async(req,res)=>{res.status(401).json({message:'Sem sessão'});return null;}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{for(const [method,path] of [['GET',''],['GET','/1'],['PATCH','/1'],['POST','/1/notas'],['DELETE','/1/documentos/1'],['GET','/1/photo']]){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/employees${path}`,{method});assert.equal(response.status,401,method+path);}}finally{await new Promise(resolve=>server.close(resolve));}
});
test('bloquear e liberar acesso altera somente a conta Auth e mantém o cadastro do funcionário',async()=>{
 const employee={id_funcionario:7,nome:'Ana Santos',cargo:'Mecânico',auth_user_id:'auth-ana'};
 let bannedUntil=null;const updates=[];
 const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:employee,error:null})};
 const db={from(){return query;},auth:{admin:{
  getUserById:async()=>({data:{user:{id:'auth-ana',banned_until:bannedUntil}},error:null}),
  updateUserById:async(_id,attributes)=>{updates.push(attributes.ban_duration);bannedUntil=attributes.ban_duration==='none'?null:new Date(Date.now()+60_000).toISOString();return{data:{user:{id:'auth-ana',banned_until:bannedUntil}},error:null};},
 }}};
 const app=express();app.use(express.json());app.use('/api/employees',rotasFuncionarios(async(_req,res)=>{res.locals.adminUserId='auth-admin';return db;}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const endpoint=`http://127.0.0.1:${server.address().port}/api/employees/7/access`;
  const block=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({bloqueado:true})});
  assert.equal(block.status,200);assert.deepEqual(await block.json(),{ok:true,bloqueado:true});
  const unblock=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({bloqueado:false})});
  assert.equal(unblock.status,200);assert.deepEqual(await unblock.json(),{ok:true,bloqueado:false});
  assert.deepEqual(updates,['876000h','none']);assert.equal(employee.nome,'Ana Santos');assert.equal(employee.auth_user_id,'auth-ana');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('administrador define diretamente a nova senha da conta vinculada sem alterar o cadastro',async()=>{
 const employee={id_funcionario:9,nome:'Beto Mecânico',auth_user_id:'auth-beto'};const passwordUpdates=[];
 const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:employee,error:null})};
 const db={from(){return query;},auth:{admin:{updateUserById:async(id,attributes)=>{passwordUpdates.push([id,attributes]);return{data:{user:{id}},error:null};}}}};
 const app=express();app.use(express.json());app.use('/api/employees',rotasFuncionarios(async(_req,res)=>{res.locals.adminUserId='auth-admin';return db;}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const endpoint=`http://127.0.0.1:${server.address().port}/api/employees/9/password`;
  const response=await fetch(endpoint,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'NovaSenha9!'})});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
  assert.deepEqual(passwordUpdates,[['auth-beto',{password:'NovaSenha9!'}]]);
  assert.deepEqual(employee,{id_funcionario:9,nome:'Beto Mecânico',auth_user_id:'auth-beto'});
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('não permite que o administrador use o fluxo de troca de senha de outro funcionário para si',async()=>{
 const employee={id_funcionario:10,nome:'Admin',auth_user_id:'auth-admin'};let changed=false;
 const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:employee,error:null})};
 const db={from(){return query;},auth:{admin:{updateUserById:async()=>{changed=true;return{data:{user:{}},error:null};}}}};
 const app=express();app.use(express.json());app.use('/api/employees',rotasFuncionarios(async(_req,res)=>{res.locals.adminUserId='auth-admin';return db;}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/employees/10/password`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'NovaSenha9!'})});assert.equal(response.status,409);assert.equal(changed,false);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('impede bloquear a própria conta do administrador',async()=>{
 const employee={id_funcionario:8,nome:'Admin',cargo:'Administrador',auth_user_id:'auth-admin'};let changed=false;
 const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:employee,error:null})};
 const db={from(){return query;},auth:{admin:{getUserById:async()=>({data:{user:{id:'auth-admin'}},error:null}),updateUserById:async()=>{changed=true;return{data:{user:{}},error:null};}}}};
 const app=express();app.use(express.json());app.use('/api/employees',rotasFuncionarios(async(_req,res)=>{res.locals.adminUserId='auth-admin';return db;}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/employees/8/access`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({bloqueado:true})});assert.equal(response.status,409);assert.equal(changed,false);}finally{await new Promise(resolve=>server.close(resolve));}
});
