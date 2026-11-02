import React, {useEffect, useState} from 'react';
import {MemoryRouter, Routes, Route} from '../../client/node_modules/react-router-dom';
import Motocicletas from '../../client/src/pages/Motocicletas';
import OrdensServico from '../../client/src/pages/OrdensServico';
import Historico from '../../client/src/pages/HistoricoMotocicleta';
import {continueRender, delayRender,staticFile} from 'remotion';

const orders = [
 {id:1042,status:'em andamento',client:'Cliente demonstração A',motorcycle:'Honda CG 160',plate:'DEMO1A2',entry:'2026-10-30T09:00:00',forecast:'2026-10-30T17:00:00',mechanic:'Equipe Estação',phone:null,total:280,paymentStatus:'pendente'},
 {id:1041,status:'pronto',client:'Cliente demonstração B',motorcycle:'Yamaha Fazer 250',plate:'DEMO3B4',entry:'2026-10-29T10:00:00',forecast:'2026-10-30T14:00:00',mechanic:'Equipe Estação',phone:null,total:420,paymentStatus:'pago'},
 {id:1040,status:'aguardando peça',client:'Cliente demonstração C',motorcycle:'Honda Biz 125',plate:'DEMO5C6',entry:'2026-10-29T08:00:00',forecast:'2026-10-31T12:00:00',mechanic:'Equipe Estação',phone:null,total:190,paymentStatus:'pendente'},
 {id:1039,status:'entregue',client:'Cliente demonstração D',motorcycle:'Honda CB 300',plate:'DEMO7D8',entry:'2026-10-28T08:00:00',forecast:'2026-10-29T12:00:00',mechanic:'Equipe Estação',phone:null,total:350,paymentStatus:'pago'},
];
function response(url:string){
 if(url.includes('/auth/me'))return {user:{id:'demo',nome:'Demonstração',perfil:'Administrador'}};
 if(url.includes('notifications'))return {items:[],unreadCount:0};
 if(url.includes('/history'))return {motorcycle:{id:1,model:'Honda CG 160',plate:'DEMO1A2',year:2025,color:'Vermelha',photo:null,km:12400,client:'Cliente demonstração A'},summary:{total:2,completed:1,inProgress:1,waitingParts:0,cancelled:0,open:1,services:3,parts:2,spent:560},mostUsedParts:[{name:'Filtro de óleo',quantity:1,total:45},{name:'Óleo motor',quantity:1,total:65}],orders:[{...orders[0],problem:'Revisão periódica',observations:null,exit:null,kmEntry:12400,kmExit:null,services:[{description:'Revisão geral',price:170}],parts:[{name:'Óleo motor',quantity:1,unitPrice:65}]},{...orders[3],problem:'Manutenção preventiva',exit:'2026-08-20T15:00:00',kmEntry:7400,kmExit:7400,services:[{description:'Troca de óleo',price:80}],parts:[]}]};
 if(url.includes('/motorcycles')&&!url.includes('preview'))return {items:orders.map((o,i)=>({id:i+1,clientId:i+1,client:o.client,phone:null,model:o.motorcycle,plate:o.plate,year:2025,modelYear:2025,color:i?'Preta':'Vermelha',mileage:12400+i*1800,chassis:'',renavam:'',notes:'',active:true,status:['maintenance','pickup','maintenance','active'][i],lastOrder:{id:o.id,date:o.entry,status:o.status,paymentStatus:o.paymentStatus},orderCount:2})),counts:{all:4,active:1,maintenance:2,pickup:1,inactive:0,completed:0,delivered:0,cancelled:0,'no-orders':0},clients:[]};
 if(url.includes('/orders?'))return {items:orders,total:4,page:1,pageSize:15,counts:{aguardando:0,'em andamento':1,'aguardando peça':1,pronto:1,entregue:1,cancelada:0}};
 return {url:null,image:null,origin:'missing',status:null,items:[],models:[]};
}
export const ProductScreen=({page}:{page:'moto'|'orders'|'history'})=>{
 const [handle]=useState(()=>delayRender('Interface original'));
 useState(()=>{window.fetch=async(input)=>new Response(JSON.stringify(response(String(input))),{status:200,headers:{'Content-Type':'application/json'}});return true;});
 useEffect(()=>{const fix=setTimeout(()=>{document.querySelectorAll('img').forEach(img=>{const src=img.getAttribute('src');if(src?.startsWith('/assets/'))img.src=staticFile(src.slice(1));});},400);const timer=setTimeout(()=>continueRender(handle),1500);return()=>{clearTimeout(fix);clearTimeout(timer);};},[handle]);
 const route=page==='moto'?'/motocicletas':page==='orders'?'/ordens-de-servico':'/ordens-de-servico/1042/historico';
 return <><style>{`*{box-sizing:border-box}html,body{margin:0} .orders-viewport{position:absolute!important;width:1440px!important;height:1000px!important}button,input{font-family:Arial} `}</style><MemoryRouter initialEntries={[route]}><Routes><Route path="/motocicletas" element={<Motocicletas/>}/><Route path="/ordens-de-servico" element={<OrdensServico/>}/><Route path="/ordens-de-servico/:id/historico" element={<Historico/>}/></Routes></MemoryRouter></>;
};
export const ScreenMoto=()=> <ProductScreen page="moto"/>;
export const ScreenOrders=()=> <ProductScreen page="orders"/>;
export const ScreenHistory=()=> <ProductScreen page="history"/>;
