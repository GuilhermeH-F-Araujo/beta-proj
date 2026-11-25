import {
  lerPreferenciasLeitura,
  normalizarLeitura,
  type PreferenciasLeitura,
} from '../../services/preferenciasGlobais';

export type Aba = 'geral' | 'preferencias' | 'seguranca' | 'integracoes' | 'sobre' | 'notificacoes';

export type Oficina = {
  nome: string;
  cnpj: string;
  telefone: string;
  email: string;
  cep: string;
  numero?: string;
  complemento?: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  semana: string;
  sabado: string;
};

export type Preferencias = PreferenciasLeitura;

export const abas: { id: Aba; label: string; icon: string; help: string }[] = [
  {
    id: 'geral',
    label: 'Geral',
    icon: 'settings',
    help: 'Dados e rotina da oficina',
  },
  {
    id: 'preferencias',
    label: 'Preferências',
    icon: 'sliders',
    help: 'Ajustes de uso e acessibilidade',
  },
  {
    id: 'seguranca',
    label: 'Segurança',
    icon: 'lock',
    help: 'Proteção e controle de acesso',
  },
  {
    id: 'integracoes',
    label: 'Integrações',
    icon: 'package',
    help: 'Serviços conectados ao sistema',
  },
  {
    id: 'notificacoes',
    label: 'Notificações',
    icon: 'bell',
    help: 'Escolha quais avisos merecem sua atenção',
  },
  {
    id: 'sobre',
    label: 'Sobre o sistema',
    icon: 'info',
    help: 'Versão e informações do produto',
  },
];

export const inicialOficina: Oficina = {
  nome: 'Estação Motos',
  cnpj: '',
  telefone: '',
  email: '',
  cep: '',
  endereco: '',
  bairro: '',
  cidade: '',
  estado: '',
  semana: '',
  sabado: '',
};

export const inicialPreferencias: Preferencias = normalizarLeitura();

export const lerArmazenamento = <T>(chave: string, alternativa: T): T => {
  try {
    const dados = localStorage.getItem(chave);
    return dados ? { ...alternativa, ...JSON.parse(dados) } : alternativa;
  } catch {
    return alternativa;
  }
};

export const lerPreferencias = lerPreferenciasLeitura;
