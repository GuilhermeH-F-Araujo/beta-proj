import { minutosInatividade, receberInatividadeConta } from './configuracoesSistema';
import {
  chaveLeitura,
  chaveLeituraConta,
  normalizarLeitura,
  receberPreferenciasLeitura,
  setUsuarioLeitura,
  type PreferenciasLeitura,
} from './preferenciasGlobais';
import {
  lerConfiguracaoNotificacoes,
  padraoNotificacoes,
  receberConfiguracaoNotificacoes,
  salvarConfiguracaoNotificacoes,
  setUsuarioNotificacoes,
  type ConfiguracaoNotificacoes,
} from './preferenciasNotificacoes';
import {
  buscarPreferenciasConta,
  concluirCarregamentoConta,
  contaPreferenciasAtual,
  enfileirarPreferenciaConta,
  iniciarSincronizacaoConta,
  preferenciaPendente,
  sinalizarFalhaSincronizacao,
} from './sincronizacaoConta';
import { buscarSomPersonalizadoMeta, setVersaoSomConta } from './sonsNotificacao';
const objeto = (dados: unknown): dados is Record<string, unknown> =>
  !!dados && typeof dados === 'object' && !Array.isArray(dados) && Object.keys(dados).length > 0;
const lerMemoria = (chave: string) => {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
};
const gravarMemoria = (chave: string, valor: string) => {
  try {
    localStorage.setItem(chave, valor);
  } catch {}
};
let cargaAtual = 0;
export async function carregarPreferenciasDaConta(id: string) {
  const token = ++cargaAtual;
  const legado = lerMemoria(chaveLeitura);
  iniciarSincronizacaoConta(id);
  setUsuarioLeitura(id);
  setUsuarioNotificacoes(id);
  const tinhaMemoria = lerMemoria(chaveLeituraConta(id) + '-confirmada') === 'true';
  const tinhaArquivo = !!lerMemoria(chaveLeituraConta(id));
  let local: Partial<PreferenciasLeitura> = {};
  try {
    local = JSON.parse(lerMemoria(chaveLeituraConta(id)) || '{}');
    if (!tinhaArquivo && !lerMemoria('estacao-dono-preferencias-antigas')) {
      local = JSON.parse(legado || '{}');
      gravarMemoria('estacao-dono-preferencias-antigas', id);
    }
  } catch {}
  receberPreferenciasLeitura(local);
  try {
    const remoto = await buscarPreferenciasConta();
    if (token !== cargaAtual || contaPreferenciasAtual() !== id) return;
    if (remoto.conta !== id)
      throw new Error('A conta mudou. Entre novamente para carregar suas preferências.');
    const pendente = preferenciaPendente('leitura');
    let leitura = pendente || remoto.leitura;
    if (!objeto(leitura)) {
      leitura = normalizarLeitura(local);
      enfileirarPreferenciaConta('leitura', leitura);
    }
    receberPreferenciasLeitura(leitura as Partial<PreferenciasLeitura>);
    const localNotificacoes = lerConfiguracaoNotificacoes();
    const notificacoes = preferenciaPendente('notificacoes') || remoto.notificacoes;
    if (objeto(notificacoes))
      receberConfiguracaoNotificacoes(notificacoes as ConfiguracaoNotificacoes);
    else {
      receberConfiguracaoNotificacoes(localNotificacoes || padraoNotificacoes());
      enfileirarPreferenciaConta('notificacoes', lerConfiguracaoNotificacoes());
    }
    const seguranca = (preferenciaPendente('seguranca') || remoto.seguranca) as {
      inatividade?: number;
    } | null;
    const inatividade =
      seguranca && [0, 10, 20, 30, 60].includes(seguranca.inatividade ?? -1)
        ? seguranca.inatividade!
        : minutosInatividade(id);
    receberInatividadeConta(id, inatividade);
    if (!objeto(seguranca)) enfileirarPreferenciaConta('seguranca', { inatividade });
    setVersaoSomConta(remoto.somVersao);
    const configuracao = lerConfiguracaoNotificacoes();
    if (
      configuracao.toque === 'personalizado' ||
      Object.values(configuracao.eventos).some(
        (resultadoAtual) => resultadoAtual.toque === 'personalizado',
      )
    ) {
      const som = await buscarSomPersonalizadoMeta();
      if (token !== cargaAtual || contaPreferenciasAtual() !== id) return;
      if (!som) {
        const continuar = {
          ...configuracao,
          toque: configuracao.toque === 'personalizado' ? ('brisa' as const) : configuracao.toque,
          eventos: { ...configuracao.eventos },
        };
        for (const [tipo, regra] of Object.entries(continuar.eventos))
          if (regra.toque === 'personalizado')
            continuar.eventos[tipo as keyof ConfiguracaoNotificacoes['eventos']] = {
              ...regra,
              toque: 'padrao',
            };
        salvarConfiguracaoNotificacoes(continuar);
      }
    }
    gravarMemoria(chaveLeituraConta(id) + '-confirmada', 'true');
    concluirCarregamentoConta();
    window.dispatchEvent(new Event('account-preferences-loaded'));
  } catch (erro) {
    if (token !== cargaAtual || contaPreferenciasAtual() !== id) return;
    const mensagem =
      erro instanceof Error ? erro.message : 'Não foi possível carregar suas preferências.';
    sinalizarFalhaSincronizacao(mensagem);
    if (!tinhaMemoria || mensagem.includes('A conta mudou')) throw erro;
  }
}
