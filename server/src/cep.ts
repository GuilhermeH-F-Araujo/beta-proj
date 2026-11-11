import { Router, type Request, type Response } from "express";
export type EnderecoCep = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
  fonte: "correios" | "viacep";
};
const texto = (x: unknown, max = 255) =>
  typeof x === "string" ? x.trim().slice(0, max) : "";
export function normalizarEndereco(
  data: Record<string, unknown>,
  cep: string,
  fonte: EnderecoCep["fonte"],
): EnderecoCep {
  const estado = texto(data.uf, 2).toUpperCase(),
    cidade = texto(data.localidade, 100);
  if (!/^[A-Z]{2}$/.test(estado) || !cidade || data.erro)
    throw new Error("CEP não encontrado.");
  return {
    cep,
    rua: texto(data.logradouro),
    bairro: texto(data.bairro, 100),
    cidade,
    estado,
    fonte,
  };
}
export class ErroCep extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function criarConsultaCep(
  fetcher: typeof fetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
) {
  const cache = new Map<string, { ate: number; valor: EnderecoCep }>(),
    pending = new Map<string, Promise<EnderecoCep>>();
  let token = "",
    validade = 0;
  let tokenPending: Promise<string> | undefined;
  async function obterToken() {
    if (env.CORREIOS_TOKEN) return env.CORREIOS_TOKEN;
    if (token && validade > Date.now()) return token;
    if (tokenPending) return tokenPending;
    if (
      !env.CORREIOS_USUARIO ||
      !env.CORREIOS_CODIGO_ACESSO ||
      !env.CORREIOS_CONTRATO
    )
      return "";
    tokenPending = (async () => {
      const response = await fetcher(
        "https://api.correios.com.br/token/v1/autentica/contrato",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(4000),
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(
                env.CORREIOS_USUARIO + ":" + env.CORREIOS_CODIGO_ACESSO,
              ).toString("base64"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            numero: env.CORREIOS_CONTRATO,
            ...(env.CORREIOS_DR ? { dr: Number(env.CORREIOS_DR) } : {}),
          }),
        },
      );
      if (!response.ok) throw new Error("Autenticação postal indisponível.");
      const data = await response.json();
      if (typeof data.token !== "string")
        throw new Error("Resposta postal inválida.");
      token = data.token;
      const expires = Date.parse(data.expiraEm ?? "");
      validade = Math.min(
        Number.isFinite(expires) ? expires - 60000 : Date.now() + 15 * 60000,
        Date.now() + 30 * 60000,
      );
      return token;
    })().finally(() => {
      tokenPending = undefined;
    });
    return tokenPending;
  }
  return async (entrada: string) => {
    const cep = entrada.replace(/\D/g, "");
    if (!/^\d{8}$/.test(cep) || !/^[\d-]+$/.test(entrada))
      throw new ErroCep("Informe um CEP com oito números.", 400);
    const hit = cache.get(cep);
    if (hit && hit.ate > Date.now()) return hit.valor;
    if (pending.has(cep)) return pending.get(cep)!;
    const task = (async () => {
      let result: EnderecoCep | undefined;
      try {
        const bearer = await obterToken();
        if (bearer) {
          const r = await fetcher(
            "https://api.correios.com.br/cep/v2/enderecos/" + cep,
            {
              headers: {
                Authorization: "Bearer " + bearer,
                Accept: "application/json",
              },
              redirect: "error",
              signal: AbortSignal.timeout(4000),
            },
          );
          if (r.status === 401) {
            token = "";
            validade = 0;
          }
          if (r.status === 404)
            throw new ErroCep(
              "CEP não encontrado. Confira ou preencha o endereço manualmente.",
              404,
            );
          if (!r.ok) throw new Error("Serviço postal indisponível.");
          result = normalizarEndereco(await r.json(), cep, "correios");
        }
      } catch (e) {
        if (e instanceof ErroCep) throw e;
        if (env.CEP_PERMITIR_VIACEP === "false")
          throw new ErroCep(
            "Não foi possível consultar o CEP. Preencha o endereço manualmente.",
            503,
          );
      }
      if (!result) {
        if (env.CEP_PERMITIR_VIACEP === "false")
          throw new ErroCep(
            "Configure o acesso aos Correios ou preencha o endereço manualmente.",
            503,
          );
        try {
          const r = await fetcher(
            "https://viacep.com.br/ws/" + cep + "/json/",
            { redirect: "error", signal: AbortSignal.timeout(4000) },
          );
          if (!r.ok) throw new Error();
          const data = await r.json();
          if (data.erro)
            throw new ErroCep(
              "CEP não encontrado. Confira ou preencha o endereço manualmente.",
              404,
            );
          result = normalizarEndereco(data, cep, "viacep");
        } catch (e) {
          if (e instanceof ErroCep) throw e;
          throw new ErroCep(
            "Não foi possível consultar o CEP. Preencha o endereço manualmente.",
            503,
          );
        }
      }
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(cep, { ate: Date.now() + 3600000, valor: result });
      return result;
    })().finally(() => pending.delete(cep));
    pending.set(cep, task);
    return task;
  };
}
export function rotasCep(
  autorizar: (req: Request, res: Response) => Promise<unknown>,
) {
  const router = Router(),
    consulta = criarConsultaCep();
  const limites = new Map<string, { ate: number; n: number }>();
  router.get("/:cep", async (req, res) => {
    if (!(await autorizar(req, res))) return;
    const key = String(res.locals.adminUserId ?? req.ip);
    let bucket = limites.get(key);
    if (!bucket || bucket.ate < Date.now()) {
      bucket = { ate: Date.now() + 60000, n: 0 };
      if (limites.size > 2000)
        for (const [k, v] of limites) if (v.ate < Date.now()) limites.delete(k);
      limites.set(key, bucket);
    }
    if (++bucket.n > 40) {
      res
        .status(429)
        .json({ message: "Aguarde um momento para consultar outro CEP." });
      return;
    }
    try {
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json(await consulta(String(req.params.cep)));
    } catch (e) {
      res
        .status(e instanceof ErroCep ? e.status : 503)
        .json({
          message:
            e instanceof ErroCep
              ? e.message
              : "Não foi possível consultar o CEP.",
        });
    }
  });
  return router;
}
