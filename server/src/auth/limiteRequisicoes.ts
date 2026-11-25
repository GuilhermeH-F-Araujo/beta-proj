import type { RequestHandler } from 'express';

export function limitarRequisicoes(maximo: number, janelaMs: number): RequestHandler {
  const acessos = new Map<string, { total: number; expiraEm: number }>();
  let proximaLimpeza = 0;

  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const agora = Date.now();
    if (agora >= proximaLimpeza) {
      for (const [ip, acesso] of acessos) if (acesso.expiraEm <= agora) acessos.delete(ip);
      proximaLimpeza = agora + 60_000;
    }

    const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
    const anterior = acessos.get(ip);
    // Limita a memoria sem apagar contadores ainda ativos.
    if (!anterior && acessos.size >= 20_000) {
      res.setHeader('Retry-After', '60');
      return res
        .status(429)
        .json({ message: 'Muitas solicitações. Tente novamente em instantes.' });
    }
    const acesso =
      anterior && anterior.expiraEm > agora ? anterior : { total: 0, expiraEm: agora + janelaMs };
    if (acesso.total >= maximo) {
      res.setHeader('Retry-After', String(Math.ceil((acesso.expiraEm - agora) / 1000)));
      return res
        .status(429)
        .json({ message: 'Muitas solicitações. Tente novamente em instantes.' });
    }

    acesso.total++;
    acessos.set(ip, acesso);
    next();
  };
}
