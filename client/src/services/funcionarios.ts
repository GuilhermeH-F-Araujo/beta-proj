import { request } from './apiAutenticacao';

export type SituacaoFuncionario = 'ativo' | 'ferias' | 'afastado' | 'desligado' | 'nao_informado';
export type ResumoFuncionario = {
  total: number;
  concluidas: number;
  abertas: number;
  pecas: number;
  canceladas: number;
  taxa: number;
  totalConcluidas: number;
  totalAbertas: number;
};
export type Funcionario = {
  id: number;
  nome: string;
  cargo: string;
  email: string | null;
  telefone: string | null;
  departamento: string | null;
  situacao: SituacaoFuncionario;
  admissao: string | null;
  temConta: boolean;
  resumo: ResumoFuncionario;
};
export type OrdemFuncionario = {
  id: number;
  entrada: string;
  saida: string | null;
  previsao: string | null;
  status: string;
  cliente: string;
  veiculo: string;
  placa: string | null;
  ano: number | null;
  servico: string;
  maoDeObra: number | null;
};
export type DocumentoFuncionario = {
  id: number;
  tipo: string;
  numero: string;
  validade: string | null;
  criado_em: string;
};
export type PerfilFuncionario = {
  pessoa: Omit<Funcionario, 'resumo'> & {
    cpf: string;
    nascimento: string | null;
    especialidade: string | null;
    endereco: string | null;
    acessoBloqueado: boolean;
  };
  mes: string;
  camposExtras: boolean;
  resumo: ResumoFuncionario & { clientes: number };
  series: (ResumoFuncionario & { mes: string })[];
  ordens: OrdemFuncionario[];
  documentos: DocumentoFuncionario[];
};
export type CargoFuncionario = 'Administrador' | 'Gerente' | 'Mecânico' | 'Atendente' | 'Cliente';
export type EdicaoFuncionario = {
  nome: string;
  cargo: CargoFuncionario;
  telefone: string;
  cpf: string;
  nascimento: string;
  admissao: string;
  departamento: string;
  especialidade: string;
  endereco: string;
  situacao: SituacaoFuncionario;
};
export type NovoFuncionario = {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
  cargo: Exclude<CargoFuncionario, 'Cliente' | 'Gerente'>;
  data_nascimento: string;
  data_admissao: string;
  departamento: string;
  especialidade: string;
  endereco: string;
  cep: string;
  complemento: string;
  tipo_contrato: string;
  duracao_contrato_meses?: number | null;
  comissao_servico: number | null;
  observacoes_profissionais: string;
  situacao: Exclude<SituacaoFuncionario, 'nao_informado'>;
  telefone_secundario?: string;
  contato_emergencia?: string;
  parentesco_emergencia?: string;
  telefone_emergencia?: string;
  foto?: string;
};
export function cadastrarFuncionario(entradaLocal: NovoFuncionario & { senha: string; confirmarSenha?: string }): Promise<{ id: number | string; approvalPending?: boolean }>;
export function cadastrarFuncionario(entradaLocal: NovoFuncionario) {
  return request<{ id: number | string; approvalPending?: boolean }>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(entradaLocal),
  });
}
export const buscarFuncionarios = (mes: string, sinal?: AbortSignal) =>
  request<{ mes: string; itens: Funcionario[]; camposExtras: boolean }>(
    `/api/employees?mes=${mes}`,
    { method: 'GET', signal: sinal },
  );
export const buscarFuncionario = (id: number, mes: string, sinal?: AbortSignal) =>
  request<PerfilFuncionario>(`/api/employees/${id}?mes=${mes}`, {
    method: 'GET',
    signal: sinal,
  });
export const salvarFuncionario = (id: number, entradaLocal: EdicaoFuncionario) =>
  request<{ ok: true }>(`/api/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(entradaLocal),
  });
export const alterarAcessoFuncionario = (id: number, bloqueado: boolean) =>
  request<{ ok: true; bloqueado: boolean }>(`/api/employees/${id}/access`, {
    method: 'PATCH',
    body: JSON.stringify({ bloqueado }),
  });
export const alterarSenhaFuncionario = (id: number, senhaLocal: string) =>
  request<{ ok: true }>(`/api/employees/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ password: senhaLocal }),
  });
export const adicionarDocumentoFuncionario = (
  id: number,
  entradaLocal: { tipo: string; numero: string; validade: string },
) =>
  request<{ ok: true }>(`/api/employees/${id}/documentos`, {
    method: 'POST',
    body: JSON.stringify(entradaLocal),
  });
export const removerRegistroFuncionario = (
  id: number,
  tipo: 'documentos',
  item: number,
) => request<{ ok: true }>(`/api/employees/${id}/${tipo}/${item}`, { method: 'DELETE' });
export const salvarFotoFuncionario = (id: number, imagem: string) =>
  request<{ ok: true }>(`/api/employees/${id}/photo`, {
    method: 'POST',
    body: JSON.stringify({ image: imagem }),
  });
export const fotoFuncionario = (id: number, versao = 0) =>
  `${((import.meta.env?.VITE_URL_API ?? import.meta.env?.VITE_API_URL) || '').replace(/\/$/, '')}/api/employees/${id}/photo?v=${versao}`;

export const buscarOpcoesMecanicos = (sinal?: AbortSignal) =>
  request<{ itens: Pick<Funcionario, 'nome' | 'cargo' | 'departamento' | 'situacao'>[] }>(
    '/api/employees/options',
    { method: 'GET', signal: sinal },
  );
