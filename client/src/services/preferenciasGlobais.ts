import { enfileirarPreferenciaConta } from "./sincronizacaoConta";
export type PreferenciasLeitura = {
  tamanhoTexto: number;
  tamanhoMenu: number;
  tamanhoCabecalho: number;
  tamanhoModais: number;
  pesoTexto: number;
  espacoLinhas: number;
  contraste: boolean;
  reduzirMovimento: boolean;
  densidade: "confortavel" | "compacta";
  periodoDashboard: "diario" | "semanal" | "mensal";
};
export const chaveLeitura = "estacao-config-preferencias";
export function normalizarLeitura(
  data: Partial<PreferenciasLeitura> & { fonte?: string } = {},
): PreferenciasLeitura {
  const numero = (valor: unknown, padrao: number, min: number, max: number) =>
    typeof valor === "number" && Number.isFinite(valor)
      ? Math.max(min, Math.min(max, valor))
      : padrao;
  return {
    tamanhoTexto: numero(
      data.tamanhoTexto,
      data.fonte === "extra" ? 120 : data.fonte === "padrao" ? 100 : 110,
      90,
      150,
    ),
    tamanhoMenu: numero(data.tamanhoMenu, 100, 90, 140),
    tamanhoCabecalho: numero(data.tamanhoCabecalho, 100, 90, 130),
    tamanhoModais: numero(data.tamanhoModais, 100, 90, 150),
    pesoTexto: numero(data.pesoTexto, 500, 400, 700),
    espacoLinhas: numero(data.espacoLinhas, 14, 12, 18),
    contraste: data.contraste === true,
    reduzirMovimento: data.reduzirMovimento !== false,
    densidade: data.densidade === "compacta" ? "compacta" : "confortavel",
    periodoDashboard: ["diario", "semanal", "mensal"].includes(
      data.periodoDashboard || "",
    )
      ? data.periodoDashboard!
      : "semanal",
  };
}
let usuarioLeitura = "";
const memoriaLeitura = new Map<string, PreferenciasLeitura>();
export const chaveLeituraConta = (id = usuarioLeitura) =>
  `estacao-conta-${id}-leitura`;
export function definirUsuarioLeitura(id: string) {
  usuarioLeitura = id;
}
export function receberPreferenciasLeitura(data: Partial<PreferenciasLeitura>) {
  const value = normalizarLeitura(data);
  memoriaLeitura.set(
    usuarioLeitura ? chaveLeituraConta() : chaveLeitura,
    value,
  );
  try {
    localStorage.setItem(chaveLeituraConta(), JSON.stringify(value));
    localStorage.setItem(chaveLeitura, JSON.stringify(value));
  } catch {}
  aplicarPreferenciasLeitura(value);
  window.dispatchEvent(new Event("app-preferences-change"));
  return value;
}
export function lerPreferenciasLeitura(): PreferenciasLeitura {
  const memoria = memoriaLeitura.get(
    usuarioLeitura ? chaveLeituraConta() : chaveLeitura,
  );
  if (memoria) return memoria;
  try {
    return normalizarLeitura(
      JSON.parse(
        localStorage.getItem(
          usuarioLeitura ? chaveLeituraConta() : chaveLeitura,
        ) || "{}",
      ) || {},
    );
  } catch {
    return normalizarLeitura();
  }
}
export function aplicarPreferenciasLeitura(
  preferencias = lerPreferenciasLeitura(),
) {
  const root = document.documentElement;
  root.dataset.appReading = "true";
  root.dataset.appTextScale = String(preferencias.tamanhoTexto);
  root.dataset.appContrast = String(preferencias.contraste);
  root.dataset.appMotion = String(!preferencias.reduzirMovimento);
  root.dataset.appDensity = preferencias.densidade;
  root.style.setProperty(
    "--app-ui-scale",
    String(preferencias.tamanhoModais / 100),
  );
  root.style.setProperty(
    "--app-content-scale",
    String(preferencias.tamanhoTexto / 100),
  );
  root.style.setProperty(
    "--app-menu-scale",
    String(preferencias.tamanhoMenu / 100),
  );
  root.style.setProperty(
    "--app-header-scale",
    String(preferencias.tamanhoCabecalho / 100),
  );
  root.style.setProperty(
    "--app-modal-scale",
    String(preferencias.tamanhoModais / 100),
  );
  root.style.setProperty("--app-font-weight", String(preferencias.pesoTexto));
  root.style.setProperty(
    "--app-heading-weight",
    String(Math.min(900, preferencias.pesoTexto + 200)),
  );
  root.style.setProperty(
    "--app-line-height",
    String(preferencias.espacoLinhas / 10),
  );
  try {
    localStorage.setItem(
      "estacao-periodo-dashboard",
      preferencias.periodoDashboard,
    );
  } catch {}
}
export function salvarPreferenciasLeitura(data: PreferenciasLeitura) {
  const value = receberPreferenciasLeitura(data);
  enfileirarPreferenciaConta("leitura", value);
}
export function iniciarPreferenciasGlobais() {
  aplicarPreferenciasLeitura();
  const atualizar = () => aplicarPreferenciasLeitura();
  window.addEventListener("app-preferences-change", atualizar);
  window.addEventListener("storage", (event) => {
    if (event.key === chaveLeitura || event.key === chaveLeituraConta()) {
      memoriaLeitura.delete(
        usuarioLeitura ? chaveLeituraConta() : chaveLeitura,
      );
      atualizar();
    }
  });
  const marcarModal = (element: Element) => {
    if (!(element instanceof HTMLElement)) return;
    const parent = element.parentElement?.closest(
      "[data-app-modal-root],dialog",
    );
    if (parent) return;
    element.dataset.appModalRoot = "true";
    element.dataset.appModalInline =
      element.parentElement === document.body
        ? "none"
        : element.closest(".orders-header")
          ? "header"
          : element.closest(".admin-menu")
            ? "menu"
            : element.closest("main")
              ? "content"
              : "none";
  };
  const marcar = (element: Element) => {
    if (
      element instanceof HTMLElement &&
      element.parentElement === document.body &&
      element.id !== "root" &&
      !["SCRIPT", "STYLE", "LINK"].includes(element.tagName)
    )
      element.dataset.appPortalRoot = "true";
    if (
      element.matches(
        'dialog,[aria-modal="true"],[class*="backdrop"],[class*="overlay"]',
      )
    )
      marcarModal(element);
    element
      .querySelectorAll(
        'dialog,[aria-modal="true"],[class*="backdrop"],[class*="overlay"]',
      )
      .forEach(marcarModal);
  };
  Array.from(document.body.children).forEach(marcar);
  const observer = new MutationObserver((entries) => {
    for (const entry of entries)
      for (const node of entry.addedNodes)
        if (node instanceof Element) marcar(node);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
export function escalaAtual(element?: Element | null) {
  const key = element?.closest("[data-app-modal-root],dialog")
    ? "--app-modal-scale"
    : element?.closest(".orders-header")
      ? "--app-header-scale"
      : element?.closest(".admin-menu")
        ? "--app-menu-scale"
        : "--app-content-scale";
  const value = Number(document.documentElement.style.getPropertyValue(key));
  return Number.isFinite(value) && value > 0 ? value : 1;
}
