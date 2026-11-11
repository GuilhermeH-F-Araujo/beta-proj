import {
  buscarPreferenciasConta,
  iniciarSincronizacaoConta,
  preferenciaPendente,
  concluirCarregamentoConta,
  enfileirarPreferenciaConta,
  sinalizarFalhaSincronizacao,
  contaPreferenciasAtual,
} from "./sincronizacaoConta";
import {
  definirUsuarioLeitura,
  receberPreferenciasLeitura,
  chaveLeituraConta,
  chaveLeitura,
  normalizarLeitura,
  type PreferenciasLeitura,
} from "./preferenciasGlobais";
import {
  definirUsuarioNotificacoes,
  lerConfigNotificacoes,
  receberConfigNotificacoes,
  salvarConfigNotificacoes,
  padraoNotificacoes,
  type ConfigNotificacoes,
} from "./preferenciasNotificacoes";
import {
  receberInatividadeConta,
  minutosInatividade,
} from "./configuracoesSistema";
import {
  definirVersaoSomConta,
  buscarSomPersonalizadoMeta,
} from "./sonsNotificacao";
const objeto = (data: unknown): data is Record<string, unknown> =>
  !!data &&
  typeof data === "object" &&
  !Array.isArray(data) &&
  Object.keys(data).length > 0;
const lerCache = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const gravarCache = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
let cargaAtual = 0;
export async function carregarPreferenciasDaConta(id: string) {
  const token = ++cargaAtual;
  const legado = lerCache(chaveLeitura);
  iniciarSincronizacaoConta(id);
  definirUsuarioLeitura(id);
  definirUsuarioNotificacoes(id);
  const tinhaCache = lerCache(chaveLeituraConta(id) + "-confirmada") === "true";
  const tinhaArquivo = !!lerCache(chaveLeituraConta(id));
  let local: Partial<PreferenciasLeitura> = {};
  try {
    local = JSON.parse(lerCache(chaveLeituraConta(id)) || "{}");
    if (!tinhaArquivo && !lerCache("estacao-dono-preferencias-antigas")) {
      local = JSON.parse(legado || "{}");
      gravarCache("estacao-dono-preferencias-antigas", id);
    }
  } catch {}
  receberPreferenciasLeitura(local);
  try {
    const remote = await buscarPreferenciasConta();
    if (token !== cargaAtual || contaPreferenciasAtual() !== id) return;
    if (remote.conta !== id)
      throw new Error(
        "A conta mudou. Entre novamente para carregar suas preferências.",
      );
    const pendente = preferenciaPendente("leitura");
    let leitura = pendente || remote.leitura;
    if (!objeto(leitura)) {
      leitura = normalizarLeitura(local);
      enfileirarPreferenciaConta("leitura", leitura);
    }
    receberPreferenciasLeitura(leitura as Partial<PreferenciasLeitura>);
    const localNotificacoes = lerConfigNotificacoes();
    const notificacoes =
      preferenciaPendente("notificacoes") || remote.notificacoes;
    if (objeto(notificacoes))
      receberConfigNotificacoes(notificacoes as ConfigNotificacoes);
    else {
      receberConfigNotificacoes(localNotificacoes || padraoNotificacoes());
      enfileirarPreferenciaConta("notificacoes", lerConfigNotificacoes());
    }
    const seguranca = (preferenciaPendente("seguranca") ||
      remote.seguranca) as { inatividade?: number } | null;
    const inatividade =
      seguranca && [0, 10, 20, 30, 60].includes(seguranca.inatividade ?? -1)
        ? seguranca.inatividade!
        : minutosInatividade(id);
    receberInatividadeConta(id, inatividade);
    if (!objeto(seguranca))
      enfileirarPreferenciaConta("seguranca", { inatividade });
    definirVersaoSomConta(remote.somVersao);
    const config = lerConfigNotificacoes();
    if (
      config.toque === "personalizado" ||
      Object.values(config.eventos).some((r) => r.toque === "personalizado")
    ) {
      const som = await buscarSomPersonalizadoMeta();
      if (token !== cargaAtual || contaPreferenciasAtual() !== id) return;
      if (!som) {
        const next = {
          ...config,
          toque:
            config.toque === "personalizado"
              ? ("brisa" as const)
              : config.toque,
          eventos: { ...config.eventos },
        };
        for (const [tipo, regra] of Object.entries(next.eventos))
          if (regra.toque === "personalizado")
            next.eventos[tipo as keyof ConfigNotificacoes["eventos"]] = {
              ...regra,
              toque: "padrao",
            };
        salvarConfigNotificacoes(next);
      }
    }
    gravarCache(chaveLeituraConta(id) + "-confirmada", "true");
    concluirCarregamentoConta();
    window.dispatchEvent(new Event("account-preferences-loaded"));
  } catch (error) {
    if (token !== cargaAtual || contaPreferenciasAtual() !== id) return;
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível carregar suas preferências.";
    sinalizarFalhaSincronizacao(message);
    if (!tinhaCache || message.includes("A conta mudou")) throw error;
  }
}
