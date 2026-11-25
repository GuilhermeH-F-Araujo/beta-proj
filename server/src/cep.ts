import { Router, type Request, type Response } from 'express';
export type EnderecoCep = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
  fonte: 'correios' | 'viacep';
};
const texto = (itemAtual: unknown, maximo = 255) =>
  typeof itemAtual === 'string' ? itemAtual.trim().slice(0, maximo) : '';
export function normalizarEndereco(
  dados: Record<string, unknown>,
  cep: string,
  fonte: EnderecoCep['fonte'],
): EnderecoCep {
  const estado = texto(dados.uf, 2).toUpperCase();
  const cidade = texto(dados.localidade, 100);
  if (!/^[A-Z]{2}$/.test(estado) || !cidade || dados.erro) throw new Error('CEP não encontrado.');
  return {
    cep,
    rua: texto(dados.logradouro),
    bairro: texto(dados.bairro, 100),
    cidade,
    estado,
    fonte,
  };
}
export class ErroCep extends Error {
  constructor(
    mensagem: string,
    public situacao: number,
  ) {
    super(mensagem);
  }
}
export function criarConsultaCep(
  consultar: typeof fetch = fetch,
  ambiente: NodeJS.ProcessEnv = process.env,
) {
  const memoria = new Map<string, { ate: number; valor: EnderecoCep }>();
  const pendente = new Map<string, Promise<EnderecoCep>>();
  let token = '';
  let validade = 0;
  let tokenPendente: Promise<string> | undefined;
  async function obterToken() {
    if (ambiente.CORREIOS_TOKEN) return ambiente.CORREIOS_TOKEN;
    if (token && validade > Date.now()) return token;
    if (tokenPendente) return tokenPendente;
    if (
      !ambiente.CORREIOS_USUARIO ||
      !ambiente.CORREIOS_CODIGO_ACESSO ||
      !ambiente.CORREIOS_CONTRATO
    )
      return '';
    tokenPendente = (async () => {
      const response = await consultar('https://api.correios.com.br/token/v1/autentica/contrato', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(4000),
        headers: {
          Authorization:
            'Basic ' +
            Buffer.from(ambiente.CORREIOS_USUARIO + ':' + ambiente.CORREIOS_CODIGO_ACESSO).toString(
              'base64',
            ),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          numero: ambiente.CORREIOS_CONTRATO,
          ...(ambiente.CORREIOS_DR ? { dr: Number(ambiente.CORREIOS_DR) } : {}),
        }),
      });
      if (!response.ok) throw new Error('Autenticação postal indisponível.');
      const dados = await response.json();
      if (typeof dados.token !== 'string') throw new Error('Resposta postal inválida.');
      token = dados.token;
      const expiraEmLocal = Date.parse(dados.expiraEm ?? '');
      validade = Math.min(
        Number.isFinite(expiraEmLocal) ? expiraEmLocal - 60000 : Date.now() + 15 * 60000,
        Date.now() + 30 * 60000,
      );
      return token;
    })().finally(() => {
      tokenPendente = undefined;
    });
    return tokenPendente;
  }
  return async (entrada: string) => {
    const cep = entrada.replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep) || !/^[\d-]+$/.test(entrada))
      throw new ErroCep('Informe um CEP com oito números.', 400);
    const encontrado = memoria.get(cep);
    if (encontrado && encontrado.ate > Date.now()) return encontrado.valor;
    if (pendente.has(cep)) return pendente.get(cep)!;
    const tarefa = (async () => {
      let resultado: EnderecoCep | undefined;
      try {
        const autorizacaoPortador = await obterToken();
        if (autorizacaoPortador) {
          const resultadoAtual = await consultar(
            'https://api.correios.com.br/cep/v2/enderecos/' + cep,
            {
              headers: {
                Authorization: 'Bearer ' + autorizacaoPortador,
                Accept: 'application/json',
              },
              redirect: 'error',
              signal: AbortSignal.timeout(4000),
            },
          );
          if (resultadoAtual.status === 401) {
            token = '';
            validade = 0;
          }
          if (resultadoAtual.status === 404)
            throw new ErroCep(
              'CEP não encontrado. Confira ou preencha o endereço manualmente.',
              404,
            );
          if (!resultadoAtual.ok) throw new Error('Serviço postal indisponível.');
          resultado = normalizarEndereco(await resultadoAtual.json(), cep, 'correios');
        }
      } catch (erroCapturado) {
        if (erroCapturado instanceof ErroCep) throw erroCapturado;
        if (ambiente.CEP_PERMITIR_VIACEP === 'false')
          throw new ErroCep(
            'Não foi possível consultar o CEP. Preencha o endereço manualmente.',
            503,
          );
      }
      if (!resultado) {
        if (ambiente.CEP_PERMITIR_VIACEP === 'false')
          throw new ErroCep(
            'Configure o acesso aos Correios ou preencha o endereço manualmente.',
            503,
          );
        try {
          const resultadoAtual = await consultar('https://viacep.com.br/ws/' + cep + '/json/', {
            redirect: 'error',
            signal: AbortSignal.timeout(4000),
          });
          if (!resultadoAtual.ok) throw new Error();
          const dados = await resultadoAtual.json();
          if (dados.erro)
            throw new ErroCep(
              'CEP não encontrado. Confira ou preencha o endereço manualmente.',
              404,
            );
          resultado = normalizarEndereco(dados, cep, 'viacep');
        } catch (erroCapturado) {
          if (erroCapturado instanceof ErroCep) throw erroCapturado;
          throw new ErroCep(
            'Não foi possível consultar o CEP. Preencha o endereço manualmente.',
            503,
          );
        }
      }
      if (memoria.size >= 1000) memoria.delete(memoria.keys().next().value!);
      memoria.set(cep, { ate: Date.now() + 3600000, valor: resultado });
      return resultado;
    })().finally(() => pendente.delete(cep));
    pendente.set(cep, tarefa);
    return tarefa;
  };
}
export function rotasCep(autorizar: (req: Request, res: Response) => Promise<unknown>) {
  const roteador = Router();
  const consulta = criarConsultaCep();
  const limites = new Map<string, { ate: number; n: number }>();
  roteador.get('/:cep', async (req, res) => {
    if (!(await autorizar(req, res))) return;
    const chave = String(res.locals.adminUserId ?? req.ip);
    let repositorioArquivos = limites.get(chave);
    if (!repositorioArquivos || repositorioArquivos.ate < Date.now()) {
      repositorioArquivos = { ate: Date.now() + 60000, n: 0 };
      if (limites.size > 2000)
        for (const [chaveAtual, valorAtual] of limites)
          if (valorAtual.ate < Date.now()) limites.delete(chaveAtual);
      limites.set(chave, repositorioArquivos);
    }
    if (++repositorioArquivos.n > 40) {
      res.status(429).json({ message: 'Aguarde um momento para consultar outro CEP.' });
      return;
    }
    try {
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.json(await consulta(String(req.params.cep)));
    } catch (erroCapturado) {
      res.status(erroCapturado instanceof ErroCep ? erroCapturado.situacao : 503).json({
        message:
          erroCapturado instanceof ErroCep
            ? erroCapturado.message
            : 'Não foi possível consultar o CEP.',
      });
    }
  });
  return roteador;
}
