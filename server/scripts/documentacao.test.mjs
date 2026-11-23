import testar from 'node:test';
import verificar from 'node:assert/strict';

// A fabrica pode ser inspecionada sem credenciais reais e sem consultar o banco.
process.env.URL_SUPABASE = 'https://exemplo.supabase.co';
process.env.CHAVE_PUBLICA_SUPABASE = 'chave-publica-teste';
process.env.CHAVE_PRIVADA_SUPABASE = 'chave-privada-teste';
const { createApp } = await import('../dist/app.js');
const { especificacao } = await import('../dist/documentacao/rotas.js');
const app = createApp();

function rotasRegistradas(pilha, prefixo = '') {
  const rotas = [];
  const prefixos = [
    '/api/admin/miniaturas',
    '/api/miniaturas/celular',
    '/api/admin/search',
    '/api/employees',
    '/api/admin/dashboard',
    '/api/admin/settings',
    '/api/admin/preferences',
    '/api/postal-code',
    '/api/shared',
  ];
  let proximoPrefixo = 0;
  for (const camada of pilha) {
    if (camada.route) {
      for (const caminho of [camada.route.path].flat()) {
        if (caminho.startsWith('/documentacao')) continue;
        for (const metodo of Object.keys(camada.route.methods))
          rotas.push([metodo, (prefixo + caminho).replace(/\/$/, '').replace(/:(\w+)/g, '{$1}')]);
      }
    } else if (camada.handle?.stack && camada.name === 'router') {
      rotas.push(...rotasRegistradas(camada.handle.stack, prefixos[proximoPrefixo++]));
    }
  }
  return rotas;
}

testar('cada operacao registrada possui contrato OpenAPI e nao ha operacoes inexistentes', () => {
  const reais = rotasRegistradas(app.router.stack)
    .map(([metodo, caminho]) => metodo + ' ' + caminho)
    .sort();
  const documentadas = Object.entries(especificacao.paths)
    .flatMap(([caminho, metodos]) => Object.keys(metodos).map((metodo) => metodo + ' ' + caminho))
    .sort();
  verificar.deepEqual(documentadas, reais);
});

testar('campos obrigatorios do pagamento acompanham os dois estados aceitos pela API', () => {
  const esquema =
    especificacao.paths['/api/orders/{id}/payment'].post.requestBody.content['application/json']
      .schema;
  verificar.deepEqual(esquema.oneOf[0].required, ['paid']);
  verificar.deepEqual(esquema.oneOf[1].required, ['paid', 'method', 'terminal', 'installments']);
  verificar.deepEqual(esquema.oneOf[1].properties.method.enum, ['pix', 'credito', 'debito']);
});

testar(
  'documentacao, contrato JSON e arquivos do Swagger sao servidos pelo proprio projeto',
  async () => {
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise((resolver) => servidor.once('listening', resolver));
    try {
      const origem = `http://127.0.0.1:${servidor.address().port}`;
      const contrato = await fetch(origem + '/documentacao/openapi.json');
      verificar.equal(contrato.status, 200);
      verificar.equal((await contrato.json()).info.title, 'Documentação');
      const pagina = await fetch(origem + '/documentacao/');
      verificar.equal(pagina.status, 200);
      verificar.match(await pagina.text(), /swagger-ui/);
      const estilos = await fetch(origem + '/documentacao/swagger-ui.css');
      verificar.equal(estilos.status, 200);
      verificar.match(estilos.headers.get('content-type'), /text\/css/);
      const protegida = await fetch(origem + '/api/clients');
      verificar.equal(protegida.status, 401);
    } finally {
      await new Promise((resolver) => servidor.close(resolver));
    }
  },
);
