import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './MenuAdmin';
import ModalNovaOrdem from './ModalNovaOrdem';
import ModalNovoUsuario from './ModalNovoUsuario';

export default function AcoesRapidas(){
  const navigate=useNavigate();
  const [orderOpen,setOrderOpen]=useState(false);
  const [userOpen,setUserOpen]=useState(false);
  return <>
    <button type="button" className="red-btn" onClick={()=>setOrderOpen(true)}><Icon name="plus" size={14}/> Nova OS</button>
    <button type="button" className="white-btn" onClick={()=>setUserOpen(true)}><Icon name="plus" size={14}/> Novo Usuário</button>
    {orderOpen&&<ModalNovaOrdem onClose={()=>setOrderOpen(false)} onCreated={id=>{setOrderOpen(false);window.dispatchEvent(new Event('admin-notifications-refresh'));navigate(`/ordens-de-servico/${id}`);}}/>}
    {userOpen&&<ModalNovoUsuario onClose={()=>setUserOpen(false)} onCreated={()=>{}}/>}
  </>;
}
