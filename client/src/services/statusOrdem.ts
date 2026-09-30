import type { StatusOrdem } from './apiAutenticacao';

export const rotulosStatusOrdem: Record<StatusOrdem,string> = {
  aguardando:'Aberta', 'em andamento':'Em andamento', 'aguardando peça':'Aguardando peça',
  pronto:'Pronta', entregue:'Finalizada', cancelada:'Cancelada',
};

export const cartoesStatusOrdem:{status:StatusOrdem;title:string;subtitle:string;icon:string;shade:string}[] = [
  {status:'aguardando',title:'Abertas',subtitle:'Aguardando início',icon:'calendar',shade:'pink'},
  {status:'em andamento',title:'Em andamento',subtitle:'Em execução',icon:'wrench',shade:'yellow'},
  {status:'aguardando peça',title:'Aguardando peça',subtitle:'Peça pendente',icon:'package',shade:'blue'},
  {status:'entregue',title:'Finalizadas',subtitle:'Concluídas',icon:'check',shade:'green'},
  {status:'cancelada',title:'Canceladas',subtitle:'OS canceladas',icon:'close',shade:'gray'},
];
