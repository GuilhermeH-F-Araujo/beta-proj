// As preferencias acompanham a conta. Uma resposta antiga nao pode apagar
// uma edicao mais recente ainda pendente de envio.
import { request } from './apiAutenticacao';
export type SecaoPreferencia = 'leitura' | 'notificacoes' | 'seguranca';
type Pendente = { valor: unknown; versao: number };
export type EstadoSincronizacao = {
  estado: 'carregando' | 'salvando' | 'salvo' | 'erro';
  mensagem: string;
};
let escutando = false;
let conta = '';
let geracao = 0;
let fila: Partial<Record<SecaoPreferencia, Pendente>> = {};
let temporizador: ReturnType<typeof setTimeout> | undefined;
let executando: Promise<void> | null = null;
let contador = 0;
let situacao: EstadoSincronizacao = {
  estado: 'carregando',
  mensagem: 'Carregando preferências da conta…',
};
const observadores = new Set<() => void>();
export const contaPreferenciasAtual = () => conta;
export const estadoSincronizacao = () => situacao;
export const observarSincronizacao = (funcao: () => void) => {
  observadores.add(funcao);
  return () => {
    observadores.delete(funcao);
  };
};
const publicar = (estado: EstadoSincronizacao['estado'], mensagem: string) => {
  situacao = { estado, mensagem };
  observadores.forEach((funcao) => funcao());
};
const chaveFila = (id = conta) => `estacao-conta-${id}-alteracoes-pendentes`;
function persistir() {
  try {
    localStorage.setItem(chaveFila(), JSON.stringify(fila));
  } catch {}
}
export function iniciarSincronizacaoConta(id: string) {
  if (!escutando && typeof window.addEventListener === 'function') {
    const retomar = () => {
      if (conta && Object.keys(fila).length) void sincronizarPreferenciasConta();
    };
    window.addEventListener('online', retomar);
    escutando = true;
  }
  if (conta === id) return;
  conta = id;
  geracao++;
  clearTimeout(temporizador);
  executando = null;
  try {
    fila = JSON.parse(localStorage.getItem(chaveFila()) || '{}') || {};
  } catch {
    fila = {};
  }
  for (const [chave, valorLocal] of Object.entries(fila))
    if (
      !['leitura', 'notificacoes', 'seguranca'].includes(chave) ||
      !valorLocal ||
      typeof valorLocal !== 'object' ||
      !('valor' in valorLocal)
    )
      delete fila[chave as SecaoPreferencia];
  contador = Math.max(0, ...Object.values(fila).map((valorAtual) => valorAtual?.versao || 0));
  publicar('carregando', 'Carregando preferências da conta…');
}
export const preferenciaPendente = (secao: SecaoPreferencia) => fila[secao]?.valor;
export function enfileirarPreferenciaConta(secao: SecaoPreferencia, valor: unknown) {
  if (!conta) return;
  fila[secao] = { valor, versao: ++contador };
  persistir();
  publicar('salvando', 'Salvando suas preferências na conta…');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void sincronizarPreferenciasConta(), 500);
}
export function sincronizarPreferenciasConta(): Promise<void> {
  if (!conta) return Promise.resolve();
  if (executando) return executando;
  clearTimeout(temporizador);
  const responsavel = conta;
  const geracaoLocal = geracao;
  executando = (async () => {
    try {
      while (geracaoLocal === geracao) {
        const registro = Object.entries(fila)[0] as [SecaoPreferencia, Pendente] | undefined;
        if (!registro) break;
        const [secao, alteracao] = registro;
        publicar('salvando', 'Salvando suas preferências na conta…');
        const res = await request<{ ok: true; conta: string }>(`/api/admin/preferences/${secao}`, {
          method: 'PUT',
          body: JSON.stringify({ conta: responsavel, valor: alteracao.valor }),
        });
        if (geracaoLocal !== geracao) return;
        if (res.conta !== responsavel)
          throw new Error('A conta mudou. Entre novamente antes de salvar.');
        if (fila[secao]?.versao === alteracao.versao) delete fila[secao];
        persistir();
      }
      if (geracaoLocal === geracao) publicar('salvo', 'Preferências salvas na sua conta.');
    } catch (erro) {
      if (geracaoLocal === geracao) {
        publicar(
          'erro',
          erro instanceof Error
            ? erro.message
            : 'Sem conexão. Suas alterações serão sincronizadas assim que possível.',
        );
        temporizador = setTimeout(() => void sincronizarPreferenciasConta(), 10000);
      }
    } finally {
      if (geracaoLocal === geracao) executando = null;
    }
  })();
  return executando;
}
export function concluirCarregamentoConta() {
  if (Object.keys(fila).length) void sincronizarPreferenciasConta();
  else publicar('salvo', 'Preferências salvas na sua conta.');
}
export function sinalizarFalhaSincronizacao(mensagemLocal: string) {
  publicar('erro', mensagemLocal);
}
export type PreferenciasRemotas = {
  conta: string;
  leitura: Record<string, unknown> | null;
  notificacoes: Record<string, unknown> | null;
  seguranca: { inatividade?: number } | null;
  somVersao: string | null;
  atualizadoEm: string | null;
};
export const buscarPreferenciasConta = () =>
  request<PreferenciasRemotas>('/api/admin/preferences', { method: 'GET' });
export type SomRemoto = {
  name: string;
  base64: string;
  duration: number;
  size: number;
  mimeType: string;
};
export async function enviarSomConta(valor: { name: string; base64: string } | null) {
  if (!conta) return null;
  const responsavel = conta;
  const resultado = await request<{ conta: string; somVersao: string | null }>(
    '/api/admin/preferences/som',
    { method: 'PUT', body: JSON.stringify({ conta: responsavel, valor }) },
  );
  if (resultado.conta !== responsavel || conta !== responsavel)
    throw new Error('A conta mudou durante o envio. Entre novamente.');
  return resultado.somVersao;
}
export async function buscarSomConta() {
  const responsavel = conta;
  if (!responsavel) return null;
  const resultado = await request<{
    conta: string;
    som: SomRemoto | null;
    versao: string | null;
  }>('/api/admin/preferences/som', { method: 'GET' });
  if (resultado.conta !== responsavel || conta !== responsavel)
    throw new Error('A conta mudou durante a consulta do áudio.');
  return resultado;
}

export const temAlteracoesPendentes = () => Object.keys(fila).length > 0;
export function suspenderSincronizacaoConta() {
  if (conta) persistir();
  clearTimeout(temporizador);
  geracao++;
  conta = '';
  fila = {};
  executando = null;
}
