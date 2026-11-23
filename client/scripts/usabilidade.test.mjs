import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';
const documentoSimulado = new JSDOM(
  '<!doctype html><html><body><div id="test-root"></div></body></html>',
  { url: 'http://localhost:5173', pretendToBeVisual: true },
);
for (const chave of [
  'window',
  'document',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLDialogElement',
  'MutationObserver',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'File',
  'FormData',
  'localStorage',
  'sessionStorage',
  'Image',
  'Node',
  'Element',
])
  globalThis[chave] = documentoSimulado.window[chave];
Object.defineProperty(globalThis, 'navigator', {
  value: documentoSimulado.window.navigator,
  configurable: true,
});
globalThis.indexedDB = indexedDB;
globalThis.requestAnimationFrame = (retorno) => setTimeout(retorno, 0);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.BroadcastChannel = class {
  addEventListener() {}
  postMessage() {}
  close() {}
};
documentoSimulado.window.HTMLElement.prototype.scrollIntoView = () => {};
documentoSimulado.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
documentoSimulado.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const React = await import('react');
globalThis.React = React;
const { act } = React;
const { createRoot: criarRaiz } = await import('react-dom/client');
const { MemoryRouter: RoteadorMemoria } = await import('react-router-dom');
const contagens = {
  aguardando: 0,
  'em andamento': 0,
  'aguardando peça': 0,
  pronto: 0,
  entregue: 0,
  cancelada: 0,
};
let totalMotos = 2,
  consultasCepPendentes = [],
  chamadas = [];
const respostaJson = (dadosLocal) =>
  new Response(JSON.stringify(dadosLocal), { headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, inicializacao = {}) => {
  const caminho = String(url);
  chamadas.push({ path: caminho, method: inicializacao.method ?? 'GET' });
  if (caminho.startsWith('/api/postal-code/'))
    return new Promise((resolver) =>
      consultasCepPendentes.push({ path: caminho, resolve: resolver }),
    );
  if (caminho === '/api/admin/miniaturas')
    return respostaJson({
      pedidos: [],
      configuracao: {
        geracao: false,
        pesquisaAmpliada: false,
        limite: 30,
        consumo: 0,
        publicacoes: 0,
      },
    });
  if (caminho === '/api/auth/me')
    return respostaJson({
      user: {
        id: 'qa-user',
        nome: 'Administrador teste',
        email: 'qa@example.invalid',
        perfil: 'Administrador',
        acesso: { administrador: true, cargo: 'Administrador', permissoes: {} },
      },
    });
  if (caminho.startsWith('/api/admin/preferences'))
    return respostaJson({
      conta: 'qa-user',
      leitura: { tamanhoTexto: 110, pesoTexto: 500, espacoLinhas: 14 },
      notificacoes: {},
      seguranca: { inatividade: 0 },
      somVersao: 0,
    });
  if (caminho === '/api/admin/dashboard')
    return respostaJson({
      orders: [],
      counts: contagens,
      oldest: [],
      employees: [],
    });
  if (caminho.startsWith('/api/admin/notifications'))
    return respostaJson({ items: [], unreadCount: 0 });
  if (caminho.startsWith('/api/orders/create-options'))
    return respostaJson({ clients: [], motorcycles: [], mechanics: [] });
  if (caminho.startsWith('/api/orders?'))
    return respostaJson({
      items: [],
      counts: contagens,
      total: 0,
      page: 1,
      pageSize: 15,
    });
  if (caminho === '/api/clients')
    return respostaJson({
      items: [],
      counts: { all: 0, active: 0, return: 0, new: 0 },
      models: [],
    });
  if (caminho === '/api/motorcycles')
    return respostaJson({
      items: [],
      counts: { all: totalMotos, active: 0, maintenance: 0, pickup: 0, inactive: 0 },
      clients: [],
    });
  if (caminho.startsWith('/api/employees'))
    return respostaJson({ itens: [], camposExtras: true, mes: '2026-11' });
  if (caminho === '/api/shared/catalogo')
    return respostaJson({ dados: { categorias: [], servicos: [] }, versao: 1 });
  if (caminho === '/api/shared/agenda') return respostaJson({ dados: [], versao: 1 });
  if (caminho === '/api/agendamentos') return respostaJson({ itens: [] });
  if (caminho === '/api/agendamentos/opcoes')
    return respostaJson({ clientes: [], mecanicos: [] });
  if (caminho === '/api/admin/settings/diagnostics')
    return respostaJson({ checkedAt: '2026-11-14', version: 'teste', checks: [] });
  if (caminho.startsWith('/api/motorcycle-brands')) return respostaJson({ brands: ['Honda'] });
  return respostaJson({ items: [], entries: [] });
};
const App = (await import('../src/App.tsx')).default;
const { iniciarRascunhos, limparRascunho, lerRascunho, gravarRascunho, suspenderRascunhos } =
  await import('../src/services/rascunhos.ts');
const { setAcessoConta } = await import('../src/services/acessoConta.ts');
const aguardar = (milissegundos) =>
  new Promise((resultadoAtual) => setTimeout(resultadoAtual, milissegundos));
let raiz;
async function montarInterface(elemento) {
  const elementoLocal = document.getElementById('test-root');
  raiz = criarRaiz(elementoLocal);
  await act(async () => {
    raiz.render(elemento);
    await aguardar(30);
  });
  for (let indice = 0; indice < 20; indice++)
    await act(async () => {
      await aguardar(15);
    });
}
async function desmontarInterface() {
  if (raiz) {
    await act(async () => raiz.unmount());
    raiz = undefined;
  }
}
const criarElemento = React.createElement;
for (const caminho of [
  '/dashboard',
  '/clientes',
  '/motocicletas',
  '/miniaturas',
  '/funcionarios',
  '/ordens-de-servico',
  '/agendamentos',
  '/servicos',
  '/configuracoes',
  '/meu-perfil',
])
  test(
    'route ' + caminho + ' mounts exactly one shared sidebar/header and no hook error',
    async () => {
      try {
        await montarInterface(
          criarElemento(RoteadorMemoria, { initialEntries: [caminho] }, criarElemento(App)),
        );
        assert.equal(document.querySelectorAll('.admin-menu').length, 1);
        assert.equal(document.querySelectorAll('.orders-header').length, 1);
        assert.equal(document.querySelector('.admin-shell') !== null, true);
        assert.equal(
          document.querySelectorAll(
            '.admin-shell-content .admin-menu,.admin-shell-content .orders-header',
          ).length,
          0,
        );
      } finally {
        await desmontarInterface();
      }
    },
  );
test('perfil alterna secoes por teclado e preserva os formularios de dados e senha', async () => {
  const consultaOriginal = globalThis.fetch;
  const envios = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url) === '/api/admin/profile' && opcoes.method === 'PATCH') {
      envios.push(JSON.parse(opcoes.body));
      return respostaJson({ user: { nome: 'Nome atualizado', telefone: '11999999999' } });
    }
    if (String(url) === '/api/admin/profile/password' && opcoes.method === 'POST') {
      envios.push(JSON.parse(opcoes.body));
      return respostaJson({ message: 'Senha atualizada com sucesso.' });
    }
    return consultaOriginal(url, opcoes);
  };
  const alterarCampo = (campo, valor) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, valor);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const enviar = (formulario) => {
    formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/meu-perfil'] }, criarElemento(App)),
    );
    const cartao = document.querySelector('.my-profile-cover');
    assert.equal(
      cartao.querySelector('.my-profile-cover-photo').getAttribute('src'),
      '/assets/capa-perfil-oficina-estacao.webp',
    );
    cartao.getBoundingClientRect = () => ({ left: 40, top: 30, width: 400, height: 100 });
    cartao.dispatchEvent(
      new window.MouseEvent('pointermove', { clientX: 140, clientY: 80, bubbles: true }),
    );
    assert.equal(cartao.style.getPropertyValue('--spotlight-x'), '25%');
    assert.equal(cartao.style.getPropertyValue('--spotlight-y'), '50%');
    const dados = document.getElementById('perfil-conta-panel-dados');
    const seguranca = document.getElementById('perfil-conta-panel-seguranca');
    const abaDados = document.getElementById('perfil-conta-tab-dados');
    const abaSeguranca = document.getElementById('perfil-conta-tab-seguranca');
    assert.equal(dados.hidden, false);
    assert.equal(seguranca.hidden, true);
    await act(async () => {
      alterarCampo(dados.querySelector('[autocomplete="name"]'), 'Nome atualizado');
      alterarCampo(dados.querySelector('[type="tel"]'), '11999999999');
    });
    await act(async () => enviar(dados));
    assert.deepEqual(envios[0], { name: 'Nome atualizado', phone: '11999999999' });
    assert.equal(document.querySelector('.my-profile-identity h3').textContent, 'Nome atualizado');
    await act(async () => {
      abaDados.focus();
      abaDados.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    assert.equal(dados.hidden, true);
    assert.equal(seguranca.hidden, false);
    assert.equal(document.activeElement, abaSeguranca);
    const [atual, nova, confirmar] = seguranca.querySelectorAll('input[type="password"]');
    await act(async () => {
      alterarCampo(atual, 'SenhaAtual#1');
      alterarCampo(nova, 'SenhaNova#2');
      alterarCampo(confirmar, 'OutraSenha#3');
    });
    await act(async () => enviar(seguranca));
    assert.equal(envios.length, 1);
    assert.match(
      document.querySelector('.my-profile-notice[role="alert"]').textContent,
      /não coincidem/,
    );
    await act(async () => alterarCampo(confirmar, 'SenhaNova#2'));
    await act(async () => enviar(seguranca));
    assert.deepEqual(envios[1], { currentPassword: 'SenhaAtual#1', newPassword: 'SenhaNova#2' });
    assert.equal(nova.value, '');
    assert.match(
      document.querySelector('.my-profile-notice[role="status"]').textContent,
      /Senha atualizada/,
    );
  } finally {
    await desmontarInterface();
    globalThis.fetch = consultaOriginal;
  }
});

test('barra de botoes aplica durante o input e salva automaticamente sem confirmar', async () => {
  const consultaOriginal = globalThis.fetch;
  const preferenciasSalvas = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url) === '/api/admin/preferences/leitura' && opcoes.method === 'PUT') {
      preferenciasSalvas.push(JSON.parse(opcoes.body).valor);
      return respostaJson({ ok: true, conta: 'qa-user' });
    }
    return consultaOriginal(url, opcoes);
  };
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(
        RoteadorMemoria,
        { initialEntries: ['/configuracoes?aba=preferencias'] },
        criarElemento(App),
      ),
    );
    await act(async () => document.getElementById('pref-editor-tab-interface').click());
    const barra = document.querySelector('input[aria-label="Tamanho dos botões"]');
    assert.ok(barra);
    assert.equal(barra.value, '100');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(barra, '135');
      barra.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(document.documentElement.style.getPropertyValue('--app-button-scale'), '1.35');
    assert.equal(
      barra.closest('.settings-range-control').querySelector('output').textContent,
      '135%',
    );
    await act(async () => aguardar(650));
    assert.equal(preferenciasSalvas.at(-1).tamanhoBotoes, 135);
    await act(async () => document.querySelector('.admin-menu a[href="/motocicletas"]').click());
    assert.equal(document.documentElement.style.getPropertyValue('--app-button-scale'), '1.35');
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
    globalThis.fetch = consultaOriginal;
  }
});
test('motorcycle cards refresh remotely without navigation and preserve the selected filter', async () => {
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/motocicletas'] }, criarElemento(App)),
    );
    const cartao = document.querySelector('.indicador-card[data-editor-cartao^="motocicletas:"]');
    assert.equal(cartao.querySelector('strong').textContent, '2');
    const ativo = document.querySelectorAll(
      '.indicador-card[data-editor-cartao^="motocicletas:"]',
    )[1];
    await act(async () => ativo.click());
    totalMotos = 7;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await aguardar(300);
    });
    assert.equal(
      document.querySelector('.indicador-card[data-editor-cartao^="motocicletas:"] strong')
        .textContent,
      '7',
    );
    assert.equal(
      document
        .querySelectorAll('.indicador-card[data-editor-cartao^="motocicletas:"]')[1]
        .getAttribute('aria-pressed'),
      'true',
    );
  } finally {
    await desmontarInterface();
  }
});
test('draft: text and photos survive unmount, reload of storage, and account switches', async () => {
  await iniciarRascunhos('draft-a');
  gravarRascunho('nova-os', 'problem', 'Motor com ruído');
  gravarRascunho('nova-os', 'photos', ['data:image/jpeg;base64,AAAA']);
  gravarRascunho('nova-os', 'password', 'NEVER');
  await aguardar(30);
  suspenderRascunhos();
  await iniciarRascunhos('draft-b');
  assert.equal(lerRascunho('nova-os', 'problem', ''), '');
  await iniciarRascunhos('draft-a');
  assert.equal(lerRascunho('nova-os', 'problem', ''), 'Motor com ruído');
  assert.deepEqual(lerRascunho('nova-os', 'photos', []), ['data:image/jpeg;base64,AAAA']);
  assert.equal(lerRascunho('nova-os', 'password', ''), '');
  limparRascunho('nova-os');
  await aguardar(20);
  await iniciarRascunhos('draft-a');
  assert.equal(lerRascunho('nova-os', 'problem', ''), '');
});
test('OS modal recovers user input after close without an exit confirmation', async () => {
  const Modal = (await import('../src/components/ModalNovaOrdem.tsx')).default;
  await iniciarRascunhos('modal-test');
  setAcessoConta({ administrador: true, cargo: 'Administrador', permissoes: {} });
  try {
    await montarInterface(criarElemento(Modal, { onClose() {}, onCreated() {} }));
    const campoTexto =
      [...document.querySelectorAll('textarea')].find(
        (itemAtual) => itemAtual.maxLength === 3000,
      ) || document.querySelector('textarea');
    assert.ok(campoTexto);
    await act(async () => {
      const definidor = Object.getOwnPropertyDescriptor(
        documentoSimulado.window.HTMLTextAreaElement.prototype,
        'value',
      ).set;
      definidor.call(campoTexto, 'Rascunho real da OS');
      campoTexto.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await desmontarInterface();
    await montarInterface(criarElemento(Modal, { onClose() {}, onCreated() {} }));
    assert.ok(
      [...document.querySelectorAll('textarea')].some(
        (itemAtual) => itemAtual.value === 'Rascunho real da OS',
      ),
    );
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
  } finally {
    await desmontarInterface();
  }
});
test('CEP field requests eight digits, ignores stale response, preserves manual corrections', async () => {
  const Campo = (await import('../src/components/CampoCep.tsx')).default;
  let encontrado = [];
  function CenarioInterface() {
    const [valorAtual, setValorAtual] = React.useState('');
    return criarElemento(Campo, {
      value: valorAtual,
      onChange: setValorAtual,
      onEndereco: (itemAtual) => encontrado.push(itemAtual),
    });
  }
  try {
    consultasCepPendentes = [];
    await montarInterface(criarElemento(CenarioInterface));
    const entrada = document.querySelector('input');
    const alterar = async (valor) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
          entrada,
          valor,
        );
        entrada.dispatchEvent(new Event('input', { bubbles: true }));
        await aguardar(380);
      });
    };
    await alterar('01001000');
    await alterar('20040002');
    assert.equal(consultasCepPendentes.length, 2);
    await act(async () => {
      consultasCepPendentes[0].resolve(
        respostaJson({
          cep: '01001000',
          rua: 'Antiga',
          bairro: '',
          cidade: 'São Paulo',
          estado: 'SP',
        }),
      );
      consultasCepPendentes[1].resolve(
        respostaJson({
          cep: '20040002',
          rua: 'Atual',
          bairro: '',
          cidade: 'Rio de Janeiro',
          estado: 'RJ',
        }),
      );
      await aguardar(30);
    });
    assert.deepEqual(
      encontrado.map((itemAtual) => itemAtual.rua),
      ['Atual'],
    );
  } finally {
    await desmontarInterface();
  }
});
after(() => {
  documentoSimulado.window.close();
});
test('draft hook switches records without carrying one motorcycle into another', async () => {
  const { useEstadoRascunho } = await import('../src/hooks/useEstadoRascunho.ts');
  await iniciarRascunhos('record-scope');
  let alterar,
    escopo = 'moto-1';
  function Formulario({ id }) {
    const [valorAtual, setValorAtual] = useEstadoRascunho(id, 'notes', '');
    alterar = setValorAtual;
    return criarElemento('output', null, valorAtual);
  }
  try {
    await montarInterface(criarElemento(Formulario, { id: escopo }));
    await act(async () => alterar('Somente moto 1'));
    await act(async () => raiz.render(criarElemento(Formulario, { id: 'moto-2' })));
    assert.equal(document.querySelector('output').textContent, '');
    await act(async () => alterar('Somente moto 2'));
    await act(async () => raiz.render(criarElemento(Formulario, { id: 'moto-1' })));
    assert.equal(document.querySelector('output').textContent, 'Somente moto 1');
  } finally {
    await desmontarInterface();
  }
});
test('successful mutations refresh mounted cards; GET and failures never announce a mutation', async () => {
  const { request } = await import('../src/services/apiAutenticacao.ts');
  try {
    totalMotos = 3;
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/motocicletas'] }, criarElemento(App)),
    );
    totalMotos = 8;
    await act(async () => {
      await request('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name: 'Novo usuário' }),
      });
      await aguardar(300);
    });
    assert.equal(
      document.querySelector('.indicador-card[data-editor-cartao^="motocicletas:"] strong')
        .textContent,
      '8',
    );
    const antes = chamadas.filter((itemAtual) => itemAtual.path === '/api/motorcycles').length;
    await act(async () => {
      await request('/api/admin/users', { method: 'GET' });
      await aguardar(260);
    });
    assert.equal(
      chamadas.filter((itemAtual) => itemAtual.path === '/api/motorcycles').length,
      antes,
    );
  } finally {
    await desmontarInterface();
  }
});
test('navigation reuses one session and preserves the actual menu/header DOM nodes', async () => {
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const menu = document.querySelector('.admin-menu'),
      cabecalho = document.querySelector('.orders-header');
    const antes = chamadas.filter((itemAtual) => itemAtual.path === '/api/auth/me').length;
    await act(async () => document.querySelector('.header-hamburger').click());
    for (const caminho of ['/motocicletas', '/ordens-de-servico', '/clientes']) {
      await act(async () => {
        document.querySelector(`.admin-menu a[href="${caminho}"]`).click();
        await aguardar(100);
      });
      assert.equal(document.querySelector('.admin-menu'), menu);
      assert.equal(document.querySelector('.orders-header'), cabecalho);
      assert.equal(menu.classList.contains('collapsed'), true);
      assert.equal(document.querySelector('.admin-menu .app-skeleton'), null);
      assert.equal(document.querySelector('.orders-auth-loading'), null);
    }
    assert.equal(chamadas.filter((itemAtual) => itemAtual.path === '/api/auth/me').length, antes);
    await act(async () => {
      for (let indice = 0; indice < 5; indice++) window.dispatchEvent(new Event('focus'));
      await aguardar(260);
    });
    assert.equal(chamadas.filter((itemAtual) => itemAtual.path === '/api/auth/me').length, antes);
  } finally {
    await desmontarInterface();
  }
});
test('initial session check shows the normal sidebar without exposing protected content', async () => {
  const original = globalThis.fetch;
  let liberarRecurso;
  globalThis.fetch = (url, inicializacao) =>
    String(url) === '/api/auth/me'
      ? new Promise((resolver) => {
          liberarRecurso = () => original(url, inicializacao).then(resolver);
        })
      : original(url, inicializacao);
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    assert.ok(document.querySelector('.admin-menu-brand img'));
    assert.ok(document.querySelectorAll('.admin-menu-link').length >= 8);
    assert.equal(document.querySelector('.admin-menu .app-skeleton'), null);
    assert.equal(document.querySelector('.clients-stats'), null);
    assert.ok(document.querySelector('.admin-shell-content .app-skeleton'));
    await act(async () => {
      liberarRecurso();
      await aguardar(60);
    });
    assert.ok(document.querySelector('.clients-stats'));
  } finally {
    globalThis.fetch = original;
    await desmontarInterface();
  }
});
test('StrictMode does not duplicate the initial access request', async () => {
  const antes = chamadas.filter((itemAtual) => itemAtual.path === '/api/auth/me').length;
  try {
    await montarInterface(
      criarElemento(
        React.StrictMode,
        null,
        criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
      ),
    );
    assert.ok(document.querySelector('.clients-stats'));
    assert.equal(
      chamadas.filter((itemAtual) => itemAtual.path === '/api/auth/me').length - antes,
      1,
    );
  } finally {
    await desmontarInterface();
  }
});

test('configuracoes encerra a sessao pelo servico central e volta para a entrada', async () => {
  const antes = chamadas.filter((chamada) => chamada.path === '/api/auth/logout').length;
  const consultaOriginal = globalThis.fetch;
  let sessaoEncerrada = false;
  globalThis.fetch = async (url, opcoes) => {
    if (String(url) === '/api/auth/me' && sessaoEncerrada)
      return new Response(JSON.stringify({ message: 'Sessao encerrada' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    const res = await consultaOriginal(url, opcoes);
    if (String(url) === '/api/auth/logout') sessaoEncerrada = true;
    return res;
  };
  try {
    await montarInterface(
      criarElemento(
        RoteadorMemoria,
        { initialEntries: ['/configuracoes?aba=seguranca'] },
        criarElemento(App),
      ),
    );
    const abrir = [...document.querySelectorAll('button')].find((botao) =>
      botao.textContent.includes('Sair desta conta agora'),
    );
    assert.ok(abrir);
    await act(async () => {
      abrir.click();
      await aguardar(20);
    });
    const confirmar = [...document.querySelectorAll('dialog button, [role="dialog"] button')].find(
      (botao) => botao.textContent.trim() === 'Sair da conta',
    );
    assert.ok(confirmar);
    await act(async () => {
      confirmar.click();
      await aguardar(100);
    });
    assert.equal(
      chamadas.filter((chamada) => chamada.path === '/api/auth/logout').length - antes,
      1,
    );
    assert.ok(document.querySelector('input[type="password"]'));
    assert.equal(document.querySelector('.admin-shell'), null);
  } finally {
    globalThis.fetch = consultaOriginal;
    await desmontarInterface();
  }
});

test('saida por inatividade tenta encerrar a sessao uma vez e permite repetir apos falha', async () => {
  const SessaoInativa = (await import('../src/components/configuracoes/SessaoInativa.tsx')).default;
  const { receberInatividadeConta } = await import('../src/services/configuracoesSistema.ts');
  const relogioOriginal = Date.now;
  const consultaOriginal = globalThis.fetch;
  let tentativasSaida = 0;
  receberInatividadeConta('teste-inatividade', 10);
  globalThis.fetch = async (url, opcoes) => {
    if (String(url) === '/api/auth/logout') {
      tentativasSaida++;
      throw new Error('sem conexao');
    }
    return consultaOriginal(url, opcoes);
  };
  try {
    await montarInterface(criarElemento(SessaoInativa, { usuarioId: 'teste-inatividade' }));
    const agora = relogioOriginal();
    Date.now = () => agora + 570_000;
    await act(async () => window.dispatchEvent(new Event('session-preferences-change')));
    const sair = [...document.querySelectorAll('dialog button, [role="dialog"] button')].find(
      (botao) => botao.textContent.trim() === 'Sair da conta',
    );
    assert.ok(sair);
    await act(async () => {
      sair.click();
      sair.click();
      await aguardar(30);
    });
    assert.equal(tentativasSaida, 1);
    assert.match(document.body.textContent, /Não foi possível encerrar a sessão/);
    assert.equal(sair.disabled, false);
    await act(async () => {
      sair.click();
      await aguardar(30);
    });
    assert.equal(tentativasSaida, 2);
  } finally {
    Date.now = relogioOriginal;
    globalThis.fetch = consultaOriginal;
    await desmontarInterface();
  }
});

for (const secao of ['', '/dados', '/ordens', '/desempenho'])
  test(
    'perfil do funcionario preserva a secao ' +
      (secao || 'principal') +
      ' com estado e visual separados',
    async () => {
      const Perfil = (await import('../src/components/PerfilFuncionario.tsx')).default;
      const resumo = {
        total: 2,
        concluidas: 1,
        abertas: 1,
        pecas: 0,
        canceladas: 0,
        taxa: 50,
        totalConcluidas: 1,
        totalAbertas: 1,
        clientes: 1,
      };
      const perfil = {
        pessoa: {
          id: 7,
          nome: 'Mecanico de teste',
          cargo: 'Mecânico',
          email: 'teste@example.invalid',
          telefone: null,
          departamento: null,
          situacao: 'ativo',
          admissao: null,
          temConta: true,
          cpf: '',
          nascimento: null,
          especialidade: null,
          endereco: null,
          acessoBloqueado: false,
        },
        mes: '2026-11',
        camposExtras: true,
        resumo,
        series: [
          { ...resumo, mes: '2026-10' },
          { ...resumo, mes: '2026-11' },
        ],
        ordens: [],
        documentos: [],
        notas: [],
      };
      await iniciarRascunhos('teste-perfil');
      try {
        await montarInterface(
          criarElemento(
            RoteadorMemoria,
            { initialEntries: ['/funcionarios/7' + secao] },
            criarElemento(Perfil, { profile: perfil, onRefresh() {}, onNotice() {}, onMonth() {} }),
          ),
        );
        assert.match(document.body.textContent, /Mecanico de teste/);
        assert.ok(document.querySelector('.staff-profile-tabs'));
        if (secao === '/dados') {
          const abrir = [...document.querySelectorAll('button')].find((botao) =>
            botao.textContent.includes('Alterar senha'),
          );
          assert.ok(abrir);
          await act(async () => {
            abrir.click();
            await aguardar(20);
          });
          assert.ok(document.querySelector('[role="dialog"]'));
          assert.match(document.querySelector('[role="dialog"]').textContent, /Segurança da conta/);
        }
      } finally {
        await desmontarInterface();
      }
    },
  );

test('estudio enfileira uma solicitacao persistente e a recupera depois de fechar', async () => {
  const Estudio = (await import('../src/components/miniaturas/EstudioMiniatura.tsx')).default;
  const fetchAnterior = globalThis.fetch;
  const id = '5c076cc2-c41b-414b-b86b-23ac7415421b';
  let status = 'rascunho';
  const requisicoes = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    requisicoes.push({ url: String(url), method: opcoes.method, body: opcoes.body });
    if (String(url).endsWith('/gerar')) {
      status = 'pendente';
      return respostaJson({ ok: true });
    }
    if (String(url).endsWith('/' + id) && opcoes.method === 'GET')
      return respostaJson({
        id,
        status,
        modo: 'referencia',
        observacoes: '',
        tentativas: 0,
        referencias: [],
        catalogo: { modelo: 'Honda CG 150 Spyder', variante: '', ano: null, revisao: 0 },
      });
    return respostaJson({ id, ok: true });
  };
  await iniciarRascunhos('teste-estudio-persistente');
  try {
    await montarInterface(criarElemento(Estudio, { modeloInicial: 'Honda CG 150 Spyder' }));
    const gerar = [...document.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Gerar miniatura'),
    );
    await act(async () => {
      gerar.click();
      await aguardar(50);
    });
    assert.equal(requisicoes.filter((item) => item.url.endsWith('/gerar')).length, 1);
    assert.match(document.body.textContent, /Na fila/);
    assert.equal(
      requisicoes.some((item) => item.url.includes('/model-preview/draft')),
      false,
    );
    await desmontarInterface();
    await montarInterface(criarElemento(Estudio, { modeloInicial: 'Honda CG 150 Spyder' }));
    assert.match(document.body.textContent, /Na fila/);
    assert.equal(
      requisicoes.filter((item) => item.url === '/api/admin/miniaturas' && item.method === 'POST')
        .length,
      1,
    );
  } finally {
    await desmontarInterface();
    globalThis.fetch = fetchAnterior;
  }
});

test('publicacao no estudio exige confirmacao explicita e envia a revisao visualizada', async () => {
  const Estudio = (await import('../src/components/miniaturas/EstudioMiniatura.tsx')).default;
  const fetchAnterior = globalThis.fetch;
  let aprovacao;
  let publicou = 0;
  const id = '3ab414ac-9afc-49fd-a8d8-c0528c0572a2';
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url).endsWith('/aprovar')) {
      aprovacao = JSON.parse(opcoes.body);
      return respostaJson({ ok: true });
    }
    return respostaJson({
      id,
      status: aprovacao ? 'aprovada' : 'revisao',
      modo: 'referencia',
      observacoes: '',
      referencias: [],
      tentativas: 1,
      candidato: 'candidata/original.png',
      imagem: 'https://example.invalid/candidata.png',
      catalogo: { modelo: 'Honda CG 150', variante: 'Spyder', ano: null, revisao: 2 },
      verificacao: { direcao: 'direita', inteira: true, automatica: true, problemas: [] },
    });
  };
  try {
    await montarInterface(
      criarElemento(Estudio, {
        pedidoId: id,
        aoPublicar() {
          publicou++;
        },
      }),
    );
    const aprovar = [...document.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Aprovar e publicar'),
    );
    assert.equal(aprovar.disabled, true);
    await act(async () => document.querySelector('.mini-preview .mini-confirm input').click());
    assert.equal(aprovar.disabled, false);
    await act(async () => {
      aprovar.click();
      await aguardar(30);
    });
    assert.equal(aprovacao.revisao, 2);
    assert.equal(aprovacao.confirmouDireita, true);
    assert.equal(aprovacao.confirmouUso, true);
    assert.equal(publicou, 1);
  } finally {
    await desmontarInterface();
    globalThis.fetch = fetchAnterior;
  }
});

test('pagina do QR remove token do endereco e usa acesso restrito por Bearer', async () => {
  const Pagina = (await import('../src/pages/EnviarReferencia.tsx')).default;
  const fetchAnterior = globalThis.fetch;
  const enderecoAnterior = window.location.href;
  const token = 'a'.repeat(43);
  let autorizacao;
  window.history.replaceState(null, '', '/enviar-referencia#' + token);
  globalThis.fetch = async (_url, opcoes) => {
    autorizacao = opcoes.headers.Authorization;
    return respostaJson({ modelo: 'Honda CG 150', quantidade: 0, podeEnviar: true });
  };
  try {
    await montarInterface(criarElemento(Pagina));
    assert.equal(window.location.hash, '');
    assert.equal(autorizacao, 'Bearer ' + token);
    assert.equal(document.querySelector('.admin-menu'), null);
    assert.match(document.body.textContent, /Tirar foto/);
    assert.match(document.body.textContent, /Escolher da galeria/);
  } finally {
    await desmontarInterface();
    globalThis.fetch = fetchAnterior;
    window.history.replaceState(null, '', enderecoAnterior);
  }
});

test('miniatura rapida pede somente o modelo e coloca a IA para trabalhar sem formulario tecnico', async () => {
  const Rapida = (await import('../src/components/miniaturas/MiniaturaRapida.tsx')).default;
  const anterior = globalThis.fetch;
  const id = '7e7fdb91-9445-4c74-905f-9060809db124';
  let gerou = 0;
  await iniciarRascunhos('teste-rapido-modelo');
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url).endsWith('/gerar')) {
      gerou++;
      return respostaJson({ ok: true });
    }
    if (String(url).endsWith('/' + id) && opcoes.method === 'GET')
      return respostaJson({
        id,
        status: 'pendente',
        tentativas: 0,
        referencias: [],
        catalogo: { modelo: 'Honda CG 160', revisao: 0 },
      });
    return respostaJson({ id });
  };
  try {
    await montarInterface(criarElemento(Rapida, { modeloInicial: 'Honda CG 160' }));
    assert.equal(document.querySelectorAll('.mini-quick input').length, 1);
    assert.equal(document.querySelector('.mini-estudio'), null);
    const botao = [...document.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Gerar miniatura'),
    );
    await act(async () => {
      botao.click();
      await aguardar(40);
    });
    assert.equal(gerou, 1);
    assert.match(document.body.textContent, /Sua moto está na fila/);
  } finally {
    await desmontarInterface();
    globalThis.fetch = anterior;
  }
});

test('aprovacao rapida exige apenas um clique explicito, mantendo a confirmacao no servidor', async () => {
  const Rapida = (await import('../src/components/miniaturas/MiniaturaRapida.tsx')).default;
  const anterior = globalThis.fetch;
  const id = 'd6cd8c6f-2079-42b3-9a3c-0974c9b6ac1d';
  let payload;
  let mudou = 0;
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url).endsWith('/aprovar')) {
      payload = JSON.parse(opcoes.body);
      return respostaJson({ ok: true });
    }
    return respostaJson({
      id,
      status: payload ? 'aprovada' : 'revisao',
      imagem: 'https://example.invalid/moto.png',
      tentativas: 1,
      catalogo: { modelo: 'Honda CG 160', revisao: 4 },
    });
  };
  try {
    await montarInterface(
      criarElemento(Rapida, {
        pedidoId: id,
        aoPublicar() {
          mudou++;
        },
      }),
    );
    assert.equal(document.querySelector('input[type="checkbox"]'), null);
    const aprovar = [...document.querySelectorAll('button')].find((item) =>
      item.textContent.includes('Aprovar esta miniatura'),
    );
    await act(async () => {
      aprovar.click();
      await aguardar(40);
    });
    assert.equal(payload.revisao, 4);
    assert.equal(payload.confirmouDireita, true);
    assert.equal(mudou, 1);
  } finally {
    await desmontarInterface();
    globalThis.fetch = anterior;
  }
});

test('lote aceita 100 modelos em um envio e bloqueia excedente sem prender a tela', async () => {
  const Lote = (await import('../src/components/miniaturas/LoteMiniaturas.tsx')).default;
  const anterior = globalThis.fetch;
  let recebidos = [];
  let atualizacoes = 0;
  await iniciarRascunhos('teste-lote-cem-modelos');
  globalThis.fetch = async (url, opcoes = {}) => {
    assert.ok(String(url).endsWith('/lote'));
    recebidos = JSON.parse(opcoes.body).modelos;
    return respostaJson({ pedidos: recebidos.map((modelo) => ({ modelo, status: 'pendente' })) });
  };
  const preencher = async (quantidade) => {
    const campo = document.querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        documentoSimulado.window.HTMLTextAreaElement.prototype,
        'value',
      ).set.call(
        campo,
        Array.from({ length: quantidade }, (_, i) => `Moto Modelo ${i}`).join('\n'),
      );
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      await aguardar(30);
    });
  };
  try {
    await montarInterface(
      criarElemento(Lote, {
        pedidos: [],
        atualizar: async () => {
          atualizacoes++;
        },
      }),
    );
    const botao = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Colocar modelos na fila'),
    );
    await preencher(101);
    assert.equal(botao.disabled, true);
    await preencher(100);
    assert.equal(botao.disabled, false);
    await act(async () => {
      botao.click();
      await aguardar(50);
    });
    assert.equal(recebidos.length, 100);
    assert.equal(atualizacoes, 1);
    assert.match(document.body.textContent, /100 modelos recebidos/);
  } finally {
    await desmontarInterface();
    globalThis.fetch = anterior;
  }
});

test('pedido sem confirmacao do modelo mostra a falha sem manter mensagem de IA trabalhando', async () => {
  const Rapida = (await import('../src/components/miniaturas/MiniaturaRapida.tsx')).default;
  const anterior = globalThis.fetch;
  await iniciarRascunhos('teste-falha-pesquisa-clara');
  const id = '57021731-3971-4e68-a900-4ce05868d729';
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url).endsWith('/gerar')) return respostaJson({ ok: true });
    if (String(url).endsWith('/' + id))
      return respostaJson({
        id,
        status: 'informacao',
        tentativas: 0,
        erro: 'Modelo nao confirmado nas fontes.',
        catalogo: { modelo: 'Marca Modelo Teste', revisao: 0 },
      });
    return respostaJson({ id });
  };
  try {
    await montarInterface(criarElemento(Rapida, { modeloInicial: 'Marca Modelo Teste' }));
    const botao = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Gerar miniatura'),
    );
    await act(async () => {
      botao.click();
      await aguardar(50);
    });
    assert.match(document.body.textContent, /Modelo nao confirmado/);
    assert.doesNotMatch(document.body.textContent, /A IA está cuidando disso/);
    assert.equal(document.querySelector('.mini-quick-form input').disabled, false);
  } finally {
    await desmontarInterface();
    globalThis.fetch = anterior;
  }
});

test('edicao direta seleciona o elemento real sem executar e restaura seu tamanho', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  const { chaveElemento } = await import('../src/services/personalizacaoElementos.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const menu = document.querySelector('.admin-menu nav a[href="/motocicletas"]');
    const chave = chaveElemento(menu);
    await act(async () => document.querySelector('[aria-label="Personalizar a tela"]').click());
    assert.equal(document.documentElement.dataset.appEditing, 'true');
    await act(async () => menu.click());
    assert.ok(document.querySelector('.orders-header h1').textContent.includes('Clientes'));
    assert.ok(document.querySelector('.canvas-element-tools'));
    for (let i = 0; i < 12; i++)
      await act(async () =>
        document.querySelector('[aria-label="Aumentar tamanho do elemento"]').click(),
      );
    assert.equal(preferencias.lerPreferenciasLeitura().elementos[chave].escala, 160);
    assert.equal(menu.style.getPropertyValue('--app-local-scale'), '1.6');
    assert.equal(
      document.querySelector('.admin-menu nav a[href="/clientes"]').hasAttribute('data-app-custom'),
      false,
    );
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent === 'Restaurar elemento')
        .click(),
    );
    assert.equal(menu.hasAttribute('data-app-custom'), false);
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    assert.equal(document.documentElement.hasAttribute('data-app-editing'), false);
    await act(async () => {
      menu.click();
      await aguardar(120);
    });
    assert.ok(document.querySelector('.orders-header h1').textContent.includes('Motocicletas'));
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('login e logo levam ao dashboard', async () => {
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/login'] }, criarElemento(App)),
    );
    await act(async () => {
      await aguardar(300);
    });
    assert.equal(
      document.querySelector('.orders-header h1')?.textContent.includes('Dashboard'),
      true,
    );
    await act(async () => {
      document.querySelector('.admin-menu a[href="/clientes"]').click();
      await aguardar(100);
    });
    await act(async () => {
      document.querySelector('.admin-menu-brand').click();
      await aguardar(100);
    });
    assert.equal(
      document.querySelector('.orders-header h1').textContent.includes('Dashboard'),
      true,
    );
  } finally {
    await desmontarInterface();
  }
});

test('fonte individual substitui o ajuste geral e nao acumula ampliacao', async () => {
  const { iniciarPersonalizacaoElementos, chaveElemento } = await import(
    '../src/services/personalizacaoElementos.ts'
  );
  const { receberPreferenciasLeitura, normalizarLeitura } = await import(
    '../src/services/preferenciasGlobais.ts'
  );
  const area = document.createElement('section');
  area.innerHTML =
    '<p style="font-size:16px">Primeiro texto</p><p style="font-size:16px">Outro texto</p>';
  document.body.append(area);
  const [primeiro, segundo] = area.children;
  const encerrar = iniciarPersonalizacaoElementos();
  try {
    receberPreferenciasLeitura({ ...normalizarLeitura(), tamanhoFonte: 150 });
    assert.equal(primeiro.style.getPropertyValue('--app-local-font'), '24px');
    assert.equal(segundo.style.getPropertyValue('--app-local-font'), '24px');
    const preferencia = {
      ...normalizarLeitura(),
      tamanhoFonte: 150,
      elementos: { [chaveElemento(primeiro)]: { escala: 100, fonte: 100 } },
    };
    receberPreferenciasLeitura(preferencia);
    receberPreferenciasLeitura(preferencia);
    assert.equal(primeiro.style.getPropertyValue('--app-local-font'), '16px');
    assert.equal(segundo.style.getPropertyValue('--app-local-font'), '24px');
  } finally {
    encerrar();
    area.remove();
    receberPreferenciasLeitura(normalizarLeitura());
  }
});

test('aumentar e diminuir fontes e mudar outros controles nao reutiliza o tamanho ampliado', async () => {
  const { iniciarPersonalizacaoElementos } = await import(
    '../src/services/personalizacaoElementos.ts'
  );
  const { receberPreferenciasLeitura, normalizarLeitura } = await import(
    '../src/services/preferenciasGlobais.ts'
  );
  const area = document.createElement('section');
  area.innerHTML = '<p style="font-size:16px">Texto que deve continuar legivel</p>';
  document.body.append(area);
  const texto = area.firstElementChild;
  const original = window.getComputedStyle;
  // Reproduz uma leitura transitoria do tamanho ja ampliado pelo navegador.
  window.getComputedStyle = (elemento, pseudo) =>
    elemento === texto
      ? { fontSize: texto.style.getPropertyValue('--app-local-font') || '16px' }
      : original.call(window, elemento, pseudo);
  const encerrar = iniciarPersonalizacaoElementos();
  try {
    for (const tamanhoFonte of [150, 90, 120, 100, 200, 95, 100]) {
      for (const tamanhoBotoes of [150, 80, 100]) {
        receberPreferenciasLeitura({
          ...normalizarLeitura(),
          tamanhoFonte,
          tamanhoBotoes,
          tamanhoIcones: 125,
          espacoLetras: 2,
        });
        assert.equal(
          texto.style.getPropertyValue('--app-local-font'),
          tamanhoFonte === 100 ? '' : `${(16 * tamanhoFonte) / 100}px`,
        );
      }
    }
  } finally {
    encerrar();
    window.getComputedStyle = original;
    area.remove();
    receberPreferenciasLeitura(normalizarLeitura());
  }
});

test('novos textos usam a base original e a limpeza permite remontar sem escala acumulada', async () => {
  const { iniciarPersonalizacaoElementos } = await import(
    '../src/services/personalizacaoElementos.ts'
  );
  const { receberPreferenciasLeitura, normalizarLeitura } = await import(
    '../src/services/preferenciasGlobais.ts'
  );
  const area = document.createElement('section');
  area.innerHTML = '<p style="font-size:20px">Pai</p>';
  const controleAntigo = document.createElement('div');
  controleAntigo.setAttribute('data-app-preference-control', '');
  controleAntigo.innerHTML =
    '<button data-app-font="true" style="--app-local-font:0.001px">+</button>';
  area.append(controleAntigo);
  document.body.append(area);
  let encerrar = iniciarPersonalizacaoElementos();
  assert.equal(controleAntigo.firstElementChild.hasAttribute('data-app-font'), false);
  assert.equal(controleAntigo.firstElementChild.style.getPropertyValue('--app-local-font'), '');
  try {
    receberPreferenciasLeitura({ ...normalizarLeitura(), tamanhoFonte: 150 });
    const filho = document.createElement('span');
    filho.style.fontSize = '14px';
    filho.textContent = 'Novo texto';
    area.firstElementChild.append(filho);
    await aguardar(40);
    assert.equal(filho.style.getPropertyValue('--app-local-font'), '21px');
    receberPreferenciasLeitura({ ...normalizarLeitura(), tamanhoFonte: 90 });
    assert.equal(filho.style.getPropertyValue('--app-local-font'), '12.6px');
    encerrar();
    assert.equal(area.querySelector('[data-app-font]'), null);
    encerrar = iniciarPersonalizacaoElementos();
    assert.equal(filho.style.getPropertyValue('--app-local-font'), '12.6px');
    receberPreferenciasLeitura(normalizarLeitura());
    assert.equal(filho.hasAttribute('data-app-font'), false);
  } finally {
    encerrar();
    area.remove();
    receberPreferenciasLeitura(normalizarLeitura());
  }
});

test('ajustes combinados conservam o valor das fontes no formulario e na conta', async () => {
  const original = globalThis.fetch;
  const gravados = [];
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url) === '/api/admin/preferences/leitura' && opcoes.method === 'PUT') {
      gravados.push(JSON.parse(opcoes.body).valor);
      return respostaJson({ ok: true, conta: 'qa-user' });
    }
    return original(url, opcoes);
  };
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  const alterar = async (nome, valor) => {
    const barra = document.querySelector(`input[aria-label="${nome}"]`);
    assert.ok(barra);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        barra,
        String(valor),
      );
      barra.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  try {
    await montarInterface(
      criarElemento(
        RoteadorMemoria,
        { initialEntries: ['/configuracoes?aba=preferencias'] },
        criarElemento(App),
      ),
    );
    await alterar('Tamanho das fontes', 150);
    await act(async () => document.getElementById('pref-editor-tab-interface').click());
    await alterar('Tamanho dos ícones', 125);
    await alterar('Tamanho dos botões', 150);
    await alterar('Tamanho dos botões', 80);
    assert.equal(preferencias.lerPreferenciasLeitura().tamanhoFonte, 150);
    await act(async () => document.getElementById('pref-editor-tab-leitura').click());
    await alterar('Tamanho das fontes', 90);
    await alterar('Espaço entre letras', 2);
    await alterar('Tamanho das fontes', 120);
    await act(async () => aguardar(650));
    assert.equal(document.querySelector('[aria-label="Tamanho das fontes"]').value, '120');
    assert.equal(gravados.at(-1).tamanhoFonte, 120);
    assert.equal(gravados.at(-1).tamanhoBotoes, 80);
    assert.equal(gravados.at(-1).tamanhoIcones, 125);
    assert.equal(gravados.at(-1).espacoLetras, 2);
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
    globalThis.fetch = original;
  }
});

test('menu e editado na propria tela, com posicao e setas junto ao item', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    assert.equal(document.querySelector('.workspace-floating-editor'), null);
    await act(async () => document.querySelector('[aria-label="Editar Menu principal"]').click());
    for (const [rotulo, posicao] of [
      ['Lateral direita', 'direita'],
      ['Acima do cabeçalho', 'superior-antes'],
      ['Abaixo do cabeçalho', 'superior-depois'],
      ['Parte inferior', 'inferior'],
      ['Lateral esquerda', 'esquerda'],
    ]) {
      await act(async () =>
        [...document.querySelectorAll('.canvas-position-options button')]
          .find((item) => item.textContent === rotulo)
          .click(),
      );
      assert.equal(document.querySelector('.admin-shell').dataset.menuPosition, posicao);
    }
    await act(async () => document.querySelector('.admin-menu nav a[href="/dashboard"]').click());
    await act(async () =>
      document.querySelector('[aria-label="Mover elemento para baixo"]').click(),
    );
    assert.equal(document.querySelector('.admin-menu nav a').getAttribute('href'), '/clientes');
    await act(async () => document.querySelector('.canvas-reset-menu summary').click());
    await act(async () => document.querySelector('.canvas-reset-menu button').click());
    assert.equal(document.querySelector('.admin-menu nav a').getAttribute('href'), '/dashboard');
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('o mais na propria tela cria barra e insere atalho real, ativo somente ao concluir', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    await act(async () =>
      document.querySelector('[aria-label="Criar barra em Lateral direita"]').click(),
    );
    await act(async () =>
      document.querySelector('.workspace-right-bars .canvas-inline-plus').click(),
    );
    await act(async () =>
      [...document.querySelectorAll('.canvas-inserter-list button')]
        .find((item) => item.textContent.includes('Nova motocicleta'))
        .click(),
    );
    const atalho = document.querySelector('.workspace-right-bars [aria-label="Nova motocicleta"]');
    assert.ok(atalho);
    await act(async () => atalho.click());
    assert.equal(document.querySelector('.bike-edit-dialog'), null);
    assert.ok(document.querySelector('.canvas-element-tools'));
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    await act(async () => {
      atalho.click();
      await aguardar(150);
    });
    assert.ok(document.querySelector('.bike-edit-dialog[role="dialog"]'));
    assert.equal(preferencias.lerPreferenciasLeitura().organizacao.barras[0].posicao, 'direita');
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('cabecalho aceita dez botoes e duas pesquisas, com pesquisa funcional em outra pagina', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const organizacao = preferencias.lerOrganizacaoInterface();
    await act(async () =>
      preferencias.salvarOrganizacaoInterface({
        ...organizacao,
        cabecalho: [
          ...Array.from({ length: 10 }, (_, i) => ({ id: `botao-${i}`, atalho: 'nova-os' })),
          { id: 'busca-motos', atalho: 'pesquisa-motos' },
          { id: 'busca-clientes', atalho: 'pesquisa-clientes' },
        ],
      }),
    );
    assert.equal(document.querySelectorAll('.orders-header [aria-label="Nova OS"]').length, 10);
    assert.equal(document.querySelectorAll('.orders-header form[role="search"]').length, 2);
    const campo = document.querySelector(
      '.orders-header input[aria-label="Pesquisa de motocicletas"]',
    );
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, 'Honda');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      campo.closest('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await aguardar(150);
    });
    assert.equal(document.querySelector('.bikes-search input').value, 'Honda');
    assert.ok(document.querySelector('.orders-header h1').textContent.includes('Motocicletas'));
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('voltar a uma lista preserva o DOM e os filtros, sem skeleton, e pausa a atualizacao oculta', async () => {
  const consultaOriginal = globalThis.fetch;
  let atrasar = false;
  let liberar;
  let motosConsultadas = 0;
  globalThis.fetch = async (url, opcoes) => {
    if (String(url) === '/api/motorcycles') {
      motosConsultadas++;
      if (atrasar)
        return new Promise((resolver) => {
          liberar = async () => resolver(await consultaOriginal(url, opcoes));
        });
    }
    return consultaOriginal(url, opcoes);
  };
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/motocicletas'] }, criarElemento(App)),
    );
    const campo = document.querySelector('.bikes-search input');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, 'Honda');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      document.querySelector('.admin-menu nav a[href="/clientes"]').click();
      await aguardar(150);
    });
    const antes = motosConsultadas;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await aguardar(300);
    });
    assert.equal(motosConsultadas, antes);
    atrasar = true;
    await act(async () => {
      document.querySelector('.admin-menu nav a[href="/motocicletas"]').click();
      await aguardar(80);
    });
    assert.equal(document.querySelector('.bikes-search input'), campo);
    assert.equal(campo.value, 'Honda');
    assert.equal(campo.closest('.orders-viewport').querySelector('.app-skeleton'), null);
    assert.ok(liberar);
    await act(async () => {
      await liberar();
      await aguardar(30);
    });
  } finally {
    if (liberar) await liberar();
    await desmontarInterface();
    globalThis.fetch = consultaOriginal;
  }
});

test('modo edicao e visualmente explicito e todos os botoes ja sao selecionaveis ao entrar', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('[aria-label="Personalizar a tela"]').click());
    assert.ok(document.querySelector('[aria-label="Modo edição da minha interface"]'));
    assert.equal(document.querySelector('.personalizador-painel'), null);
    await act(async () => document.querySelector('.orders-header [aria-label="Nova OS"]').click());
    assert.equal(document.querySelector('.os-create-dialog'), null);
    assert.ok(document.querySelector('.canvas-selection-frame'));
    await act(async () =>
      document.querySelector('[aria-label="Aumentar fonte do elemento"]').click(),
    );
    const bloco = document.querySelector('.orders-header [aria-label="Nova OS"]');
    const { chaveElemento } = await import('../src/services/personalizacaoElementos.ts');
    assert.equal(preferencias.lerPreferenciasLeitura().elementos[chaveElemento(bloco)].fonte, 105);
    assert.equal(bloco.hasAttribute('data-app-custom'), true);
    await act(async () =>
      [...document.querySelectorAll('.canvas-editor-bar button')]
        .find((item) => item.textContent.includes('Desfazer'))
        .click(),
    );
    assert.equal(preferencias.lerPreferenciasLeitura().elementos[chaveElemento(bloco)], undefined);
    assert.equal(bloco.hasAttribute('data-app-custom'), false);
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    await act(async () => {
      bloco.click();
      await aguardar(100);
    });
    assert.ok(document.querySelector('.os-create-dialog'));
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('cartoes personalizados sao recuperados ao voltar e a fonte muda na tela sem previa', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => {
      document.querySelector('.admin-menu nav a[href="/configuracoes"]').click();
      await aguardar(150);
    });
    await act(async () =>
      preferencias.salvarOrganizacaoInterface({
        ...preferencias.lerOrganizacaoInterface(),
        cartoes: { clientes: ['all', 'new'] },
      }),
    );
    await act(async () => {
      document.querySelector('.admin-menu nav a[href="/clientes"]').click();
      await aguardar(100);
    });
    assert.equal(
      document.querySelectorAll('.indicador-card[data-editor-cartao^="clientes:"]').length,
      2,
    );
    await act(async () => {
      document.querySelector('.admin-menu nav a[href="/configuracoes"]').click();
      await aguardar(80);
    });
    const aba = [...document.querySelectorAll('button[role="tab"]')].find(
      (item) => item.textContent.trim() === 'Preferências',
    );
    if (aba) await act(async () => aba.click());
    const fonte = document.querySelector('button[aria-label^="Estilo das letras:"]');
    assert.ok(fonte);
    await act(async () => fonte.click());
    const opcoes = document.querySelectorAll(
      '[role="listbox"][aria-label="Estilo das letras"] [role="option"]',
    );
    assert.equal(opcoes.length, 10);
    await act(async () => [...opcoes].find((item) => item.textContent.includes('Georgia')).click());
    assert.equal(preferencias.lerPreferenciasLeitura().fonteInterface, 'serifada');
    assert.equal(document.documentElement.dataset.appFontFamily, 'serifada');
    assert.equal(document.querySelector('.settings-font-preview, .settings-reading-preview'), null);
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('notificacoes adicionadas na barra inferior abrem fora da area recortada', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () =>
      preferencias.salvarOrganizacaoInterface({
        ...preferencias.lerOrganizacaoInterface(),
        barras: [
          {
            id: 'avisos-inferiores',
            nome: 'Avisos',
            posicao: 'inferior',
            itens: [{ id: 'aviso-principal', atalho: 'notificacoes' }],
          },
        ],
      }),
    );
    await act(async () => document.querySelector('.workspace-bottom-bars .notice-trigger').click());
    const painel = document.querySelector('.notice-popover');
    assert.ok(painel);
    assert.equal(painel.parentElement, document.body);
    assert.ok(Number.parseFloat(painel.style.left) >= 16);
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('atalhos respeitam permissoes mesmo quando configurados na preferencia', async () => {
  const original = globalThis.fetch;
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  globalThis.fetch = async (url, opcoes) =>
    String(url) === '/api/auth/me'
      ? respostaJson({
          user: {
            id: 'qa-user',
            nome: 'Consulta de clientes',
            email: 'qa@example.invalid',
            perfil: 'Atendente',
            acesso: {
              administrador: false,
              cargo: 'Atendente',
              permissoes: { clientes: { visualizar: true } },
            },
          },
        })
      : original(url, opcoes);
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () =>
      preferencias.salvarOrganizacaoInterface({
        ...preferencias.lerOrganizacaoInterface(),
        cabecalho: [
          { id: 'moto-negada', atalho: 'nova-moto' },
          { id: 'usuario-negado', atalho: 'novo-usuario' },
          { id: 'perfil-livre', atalho: 'perfil' },
        ],
      }),
    );
    assert.equal(document.querySelector('.orders-header [aria-label="Nova motocicleta"]'), null);
    assert.equal(document.querySelector('.orders-header [aria-label="Novo usuário"]'), null);
    assert.ok(document.querySelector('.orders-header [aria-label="Meu perfil"]'));
    assert.equal(document.querySelector('.admin-menu nav a[href="/motocicletas"]'), null);
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
    globalThis.fetch = original;
  }
});

test('atalho de novo usuario conserva a confirmacao de criacao para conferir o acesso', async () => {
  const original = globalThis.fetch;
  let cadastros = 0;
  globalThis.fetch = async (url, opcoes = {}) => {
    if (String(url) === '/api/admin/users' && opcoes.method === 'POST') {
      cadastros++;
      return respostaJson({ id: 999 });
    }
    return original(url, opcoes);
  };
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => {
      document.querySelector('.orders-header [aria-label="Novo usuário"]').click();
      await aguardar(100);
    });
    const dados = [
      ['Nome e sobrenome', 'Pessoa de Teste'],
      ['nome@exemplo.com', 'pessoa@example.invalid'],
      ['(11) 99999-9999', '11999990000'],
      ['000.000.000-00', '52998224725'],
    ];
    for (const [placeholder, valor] of dados) {
      const campo = document.querySelector(`.nam-dialog input[placeholder="${placeholder}"]`);
      assert.ok(campo);
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, valor);
        campo.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    for (const campo of document.querySelectorAll('.nam-dialog input[autocomplete="new-password"]'))
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
          campo,
          'SenhaExemplo1!',
        );
        campo.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await act(async () => {
      document
        .querySelector('.nam-dialog')
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await aguardar(80);
    });
    assert.equal(cadastros, 1);
    assert.ok(document.querySelector('.nam-dialog .nam-finish-share'));
  } finally {
    await desmontarInterface();
    globalThis.fetch = original;
  }
});

test('botao real da pagina troca de atalho, desfaz, refaz e restaura sem executar durante edicao', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  const { chaveElemento } = await import('../src/services/personalizacaoElementos.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const original = document.querySelector('.indicador-card[data-editor-cartao^="clientes:"]');
    const chave = chaveElemento(original);
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    await act(async () => original.click());
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent.includes('Trocar por atalho'))
        .click(),
    );
    await act(async () => {
      [...document.querySelectorAll('.canvas-inserter-list button')]
        .find((item) => item.textContent.includes('Nova motocicleta'))
        .click();
      await aguardar(80);
    });
    const proxy = () => document.querySelector(`[data-editor-origem="${chave}"] button`);
    assert.equal(preferencias.lerPreferenciasLeitura().substituicoes[chave], 'nova-moto');
    assert.equal(original.dataset.appReplaced, 'true');
    assert.ok(proxy());
    await act(async () => proxy().click());
    assert.equal(document.querySelector('.bike-edit-dialog'), null);
    await act(async () =>
      [...document.querySelectorAll('.canvas-editor-bar button')]
        .find((item) => item.textContent.includes('Desfazer'))
        .click(),
    );
    await act(async () => {
      await aguardar(80);
    });
    assert.equal(proxy(), null);
    assert.equal(original.dataset.appReplaced, undefined);
    await act(async () =>
      [...document.querySelectorAll('.canvas-editor-bar button')]
        .find((item) => item.textContent.includes('Refazer'))
        .click(),
    );
    await act(async () => {
      await aguardar(80);
    });
    assert.ok(proxy());
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    await act(async () => {
      proxy().click();
      await aguardar(120);
    });
    assert.ok(document.querySelector('.bike-edit-dialog'));
    await act(async () =>
      preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura()),
    );
    await act(async () => {
      await aguardar(80);
    });
    assert.equal(proxy(), null);
    assert.equal(original.dataset.appReplaced, undefined);
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('substituir um bloco por pesquisa mantem a selecao e bloqueia formulario enquanto edita', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    const botao = document.querySelector('.orders-header [aria-label="Nova OS"]');
    const id = botao.dataset.editorBloco;
    await act(async () => botao.click());
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent.includes('Trocar por atalho'))
        .click(),
    );
    await act(async () => {
      [...document.querySelectorAll('.canvas-inserter-list button')]
        .find((item) => item.textContent.includes('Pesquisa de motocicletas'))
        .click();
      await aguardar(80);
    });
    const formulario = [...document.querySelectorAll('form[data-editor-bloco]')].find(
      (item) => item.dataset.editorBloco === id,
    );
    assert.ok(formulario);
    assert.ok(document.querySelector('.canvas-element-tools'));
    let submeteu = false;
    formulario.addEventListener('submit', () => {
      submeteu = true;
    });
    await act(async () =>
      formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    assert.equal(submeteu, false);
    const campo = formulario.querySelector('input');
    await act(async () => {
      campo.focus();
      campo.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    assert.equal(document.querySelector('.bike-edit-dialog'), null);
    assert.equal(submeteu, false);
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent === 'Remover atalho')
        .click(),
    );
    assert.equal(
      [...document.querySelectorAll('[data-editor-bloco]')].some(
        (item) => item.dataset.editorBloco === id,
      ),
      false,
    );
    assert.ok(
      document.querySelector(
        '[data-editor-protegido] .workspace-organize-launcher, .workspace-organize-launcher[data-editor-protegido]',
      ),
    );
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('cartao ocultado reaparece como objeto na edicao e pode ser restaurado na propria pagina', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const total = document.querySelectorAll(
      '.indicador-card[data-editor-cartao^="clientes:"]',
    ).length;
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    const cartao = document.querySelector('.indicador-card[data-editor-cartao^="clientes:"]');
    const id = cartao.dataset.editorCartao;
    await act(async () => cartao.click());
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent === 'Ocultar cartão')
        .click(),
    );
    assert.equal(cartao.dataset.workspaceCardHidden, 'true');
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    assert.equal(
      document.querySelectorAll('.indicador-card[data-editor-cartao^="clientes:"]').length,
      total - 1,
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    const oculto = [
      ...document.querySelectorAll('.indicador-card[data-editor-cartao^="clientes:"]'),
    ].find((item) => item.dataset.editorCartao === id);
    assert.equal(oculto.dataset.workspaceCardHidden, 'true');
    await act(async () => oculto.click());
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent === 'Mostrar cartão')
        .click(),
    );
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    assert.equal(
      document.querySelectorAll('.indicador-card[data-editor-cartao^="clientes:"]').length,
      total,
    );
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('arraste do menu so ativa encaixes durante o gesto e pode ser desfeito', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  const transferencias = new Map();
  const dados = {
    types: [],
    setData(tipo, valor) {
      transferencias.set(tipo, valor);
      this.types = [...transferencias.keys()];
    },
    getData(tipo) {
      return transferencias.get(tipo) || '';
    },
  };
  const arrastar = (nome, alvo) => {
    const evento = new Event(nome, { bubbles: true, cancelable: true });
    Object.defineProperty(evento, 'dataTransfer', { value: dados });
    alvo.dispatchEvent(evento);
  };
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    assert.equal(document.querySelector('.workspace-drop-zones'), null);
    await act(async () => arrastar('dragstart', document.querySelector('.workspace-menu-slot')));
    assert.equal(document.querySelector('.workspace-drop-zones').parentElement, document.body);
    await act(async () =>
      arrastar('drop', document.querySelector('.workspace-drop-superior-antes')),
    );
    assert.equal(preferencias.lerOrganizacaoInterface().posicaoMenu, 'superior-antes');
    await act(async () => arrastar('dragstart', document.querySelector('.workspace-menu-slot')));
    await act(async () =>
      arrastar('drop', document.querySelector('.workspace-drop-superior-depois')),
    );
    assert.equal(preferencias.lerOrganizacaoInterface().posicaoMenu, 'superior-depois');
    await act(async () => arrastar('dragstart', document.querySelector('.workspace-menu-slot')));
    await act(async () => arrastar('drop', document.querySelector('.workspace-drop-direita')));
    assert.equal(preferencias.lerOrganizacaoInterface().posicaoMenu, 'direita');
    assert.equal(document.querySelector('.workspace-drop-zones'), null);
    await act(async () =>
      [...document.querySelectorAll('.canvas-editor-bar button')]
        .find((item) => item.textContent.includes('Desfazer'))
        .click(),
    );
    assert.equal(preferencias.lerOrganizacaoInterface().posicaoMenu, 'superior-depois');
    await act(async () => document.querySelector('.canvas-editor-finish').click());
    assert.equal(document.querySelector('.workspace-menu-slot').draggable, false);
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('menu no topo ou rodape centraliza navegacao e conserva area de toque quando recolhido', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  const { readFileSync } = await import('node:fs');
  const estilo = document.createElement('style');
  estilo.textContent = [
    '../src/components/menu-admin.css',
    '../src/components/organizacao/organizacao.css',
  ]
    .map((caminho) => readFileSync(new URL(caminho, import.meta.url), 'utf8'))
    .join('\n');
  document.head.append(estilo);
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    for (const posicao of ['superior-antes', 'superior-depois', 'inferior']) {
      await act(async () =>
        preferencias.salvarOrganizacaoInterface({
          ...preferencias.lerOrganizacaoInterface(),
          posicaoMenu: posicao,
        }),
      );
      for (const recolhido of [false, true]) {
        if (document.querySelector('.admin-menu').classList.contains('collapsed') !== recolhido)
          await act(async () => document.querySelector('.header-hamburger').click());
        const menu = document.querySelector('.admin-menu');
        const nav = menu.querySelector('nav');
        assert.equal(menu.dataset.menuOrientation, 'horizontal');
        assert.equal(window.getComputedStyle(menu).display, 'grid');
        assert.equal(window.getComputedStyle(nav).justifyContent, 'center');
        const logo = window.getComputedStyle(menu.querySelector('.admin-menu-brand'));
        assert.equal(logo.gridColumn, '1');
        assert.equal(logo.display, 'flex');
        const ativo = window.getComputedStyle(menu.querySelector('.admin-menu-link.selected'));
        assert.equal(ativo.minWidth, '44px');
        assert.notEqual(ativo.paddingInline, '0');
        assert.equal(ativo.borderRadius, '9px');
      }
    }
    await act(async () =>
      preferencias.salvarOrganizacaoInterface({
        ...preferencias.lerOrganizacaoInterface(),
        posicaoMenu: 'esquerda',
      }),
    );
    assert.equal(document.querySelector('.admin-menu').dataset.menuOrientation, 'vertical');
    assert.equal(window.getComputedStyle(document.querySelector('.admin-menu')).display, 'flex');
  } finally {
    estilo.remove();
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('link e pagina de fontes das miniaturas foram removidos do painel', async () => {
  try {
    await montarInterface(
      criarElemento(
        RoteadorMemoria,
        { initialEntries: ['/creditos-miniaturas'] },
        criarElemento(App),
      ),
    );
    await act(async () => {
      await aguardar(180);
    });
    assert.equal(document.querySelector('a[href="/creditos-miniaturas"]'), null);
    assert.equal(document.querySelector('.mini-credit-link'), null);
    assert.equal(document.querySelector('.mini-sources'), null);
    assert.ok(document.querySelector('.orders-header h1').textContent.includes('Dashboard'));
  } finally {
    await desmontarInterface();
  }
});

test('catalogo contextual filtra tipos de atalho e preserva pesquisa por texto', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    await act(async () =>
      document.querySelector('[aria-label="Adicionar atalho em Cabeçalho"]').click(),
    );
    const clicarGrupo = async (nome) =>
      act(async () =>
        [...document.querySelectorAll('.canvas-inserter-groups button')]
          .find((item) => item.textContent === nome)
          .click(),
      );
    await clicarGrupo('Pesquisas');
    assert.ok(document.querySelectorAll('.canvas-inserter-list button').length >= 2);
    assert.ok(
      [...document.querySelectorAll('.canvas-shortcut-copy small')].every(
        (item) => item.textContent === 'Campo de pesquisa',
      ),
    );
    await clicarGrupo('Páginas');
    assert.ok(
      [...document.querySelectorAll('.canvas-shortcut-copy small')].every(
        (item) => item.textContent === 'Abrir página',
      ),
    );
    await clicarGrupo('Ações');
    assert.ok(
      [...document.querySelectorAll('.canvas-shortcut-copy small')].every(
        (item) => item.textContent === 'Ação rápida',
      ),
    );
    await clicarGrupo('Todos');
    const campo = document.querySelector('[aria-label="Pesquisar atalhos disponíveis"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        campo,
        'motocicleta',
      );
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.ok(document.querySelectorAll('.canvas-inserter-list button').length >= 2);
    assert.ok(
      [...document.querySelectorAll('.canvas-shortcut-copy strong')].every((item) =>
        item.textContent.toLowerCase().includes('motocicleta'),
      ),
    );
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('menu ocupado oculta criacao e a remocao libera o mesmo lado incluindo as alternativas do topo', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () => document.querySelector('.workspace-organize-launcher').click());
    assert.equal(document.querySelector('[aria-label="Criar barra em Lateral esquerda"]'), null);
    await act(async () =>
      document.querySelector('[aria-label="Criar barra em Acima do cabeçalho"]').click(),
    );
    assert.equal(document.querySelector('[aria-label="Criar barra em Acima do cabeçalho"]'), null);
    assert.equal(document.querySelector('[aria-label="Criar barra em Abaixo do cabeçalho"]'), null);
    const barra = preferencias.lerOrganizacaoInterface().barras[0];
    await act(async () =>
      document
        .querySelector(`[data-workspace-bar="${barra.id}"] .canvas-area-controls button`)
        .click(),
    );
    await act(async () =>
      [...document.querySelectorAll('.canvas-element-tools button')]
        .find((item) => item.textContent.trim() === 'Remover barra')
        .click(),
    );
    assert.ok(document.querySelector('[aria-label="Criar barra em Acima do cabeçalho"]'));
    assert.ok(document.querySelector('[aria-label="Criar barra em Abaixo do cabeçalho"]'));
    await act(async () => document.querySelector('[aria-label="Editar Menu principal"]').click());
    for (const nome of ['Acima do cabeçalho', 'Abaixo do cabeçalho'])
      assert.ok(
        [...document.querySelectorAll('.canvas-position-options button')].some(
          (item) => item.textContent === nome,
        ),
      );
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('tema muda no botao do cabecalho e permanece nas preferencias ao navegar', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    await act(async () =>
      preferencias.receberPreferenciasLeitura({
        ...preferencias.normalizarLeitura(),
        reduzirMovimento: true,
      }),
    );
    await act(async () => document.querySelector('[aria-label="Ativar modo escuro"]').click());
    assert.equal(document.documentElement.dataset.appTheme, 'escuro');
    assert.equal(
      document.querySelector('.admin-menu-brand img').getAttribute('src'),
      '/assets/logobranca.png',
    );
    assert.equal(preferencias.lerPreferenciasLeitura().tema, 'escuro');
    await act(async () => {
      document.querySelector('.admin-menu nav a[href="/motocicletas"]').click();
      await aguardar(80);
    });
    assert.equal(document.documentElement.dataset.appTheme, 'escuro');
    assert.equal(
      document.querySelector('.admin-menu-brand img').getAttribute('src'),
      '/assets/logobranca.png',
    );
    await act(async () => document.querySelector('[aria-label="Ativar modo claro"]').click());
    assert.equal(document.documentElement.dataset.appTheme, 'claro');
    assert.equal(
      document.querySelector('.admin-menu-brand img').getAttribute('src'),
      '/assets/estacao-motos-logo-sidebar.png',
    );
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('troca de iluminacao revela os temas em sentidos opostos e respeita movimento reduzido', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  const { alternarTema } = await import('../src/services/temaInterface.ts');
  const original = document.startViewTransition,
    animacao = document.documentElement.animate,
    css = window.CSS;
  const quadros = [];
  let transicoes = 0;
  try {
    preferencias.receberPreferenciasLeitura({
      ...preferencias.normalizarLeitura(),
      reduzirMovimento: false,
    });
    window.CSS = { supports: () => true };
    document.startViewTransition = (aplicar) => {
      transicoes++;
      aplicar();
      return { ready: Promise.resolve(), finished: Promise.resolve() };
    };
    document.documentElement.animate = (frames, opcoes) => {
      quadros.push({ frames, opcoes });
      return { finished: Promise.resolve() };
    };
    await act(async () => {
      await Promise.all([alternarTema(), alternarTema()]);
    });
    assert.equal(transicoes, 1);
    assert.equal(preferencias.lerPreferenciasLeitura().tema, 'escuro');
    assert.equal(quadros[0].opcoes.pseudoElement, '::view-transition-new(root)');
    assert.deepEqual(quadros[0].frames, [{ maskPosition: '100% 0' }, { maskPosition: '0% 0' }]);
    await act(async () => alternarTema());
    assert.equal(preferencias.lerPreferenciasLeitura().tema, 'claro');
    assert.deepEqual(quadros[1].frames, [...quadros[0].frames].reverse());
    assert.equal(document.documentElement.dataset.themeTransition, undefined);
    preferencias.receberPreferenciasLeitura({
      ...preferencias.lerPreferenciasLeitura(),
      reduzirMovimento: true,
    });
    await alternarTema();
    assert.equal(transicoes, 2);
    assert.equal(preferencias.lerPreferenciasLeitura().tema, 'escuro');
  } finally {
    window.CSS = css;
    document.startViewTransition = original;
    document.documentElement.animate = animacao;
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('preferencias tem uma entrada de edicao e os perfis de leitura preservam o tema e os menus', async () => {
  const preferencias = await import('../src/services/preferenciasGlobais.ts');
  try {
    await montarInterface(
      criarElemento(
        RoteadorMemoria,
        { initialEntries: ['/configuracoes?aba=preferencias'] },
        criarElemento(App),
      ),
    );
    await act(async () =>
      preferencias.receberPreferenciasLeitura({
        ...preferencias.normalizarLeitura(),
        tema: 'escuro',
        organizacao: { ...preferencias.lerOrganizacaoInterface(), posicaoMenu: 'direita' },
      }),
    );
    assert.equal(document.querySelectorAll('.settings-personalizacao-hero').length, 1);
    assert.equal(document.querySelector('.settings-layout-entry'), null);
    const perfil = document.querySelector('.settings-personalizacao-presets button');
    await act(async () => perfil.click());
    assert.equal(preferencias.lerPreferenciasLeitura().tema, 'escuro');
    assert.equal(preferencias.lerOrganizacaoInterface().posicaoMenu, 'direita');
  } finally {
    await desmontarInterface();
    preferencias.receberPreferenciasLeitura(preferencias.normalizarLeitura());
  }
});

test('pesquisa geral procura registros de outros modulos e abre a pagina do resultado', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opcoes) =>
    String(url).startsWith('/api/admin/search?')
      ? respostaJson({
          itens: [
            {
              id: 'moto-1',
              titulo: 'Honda CG 160',
              detalhe: 'ABC1234',
              tipo: 'Motocicleta',
              rota: '/motocicletas?search=ABC1234',
              relevancia: 100,
            },
          ],
          incompleta: false,
        })
      : original(url, opcoes);
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const campo = document.querySelector('[aria-label="Pesquisar em todo o painel"]');
    assert.ok(campo);
    await act(async () => {
      campo.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
        campo,
        'ABC1234',
      );
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await aguardar(350);
    });
    assert.ok(
      document
        .querySelector('.global-search-results [role="option"]')
        .textContent.includes('Honda CG 160'),
    );
    await act(async () => {
      document.querySelector('.global-search-results [role="option"]').click();
      await aguardar(100);
    });
    assert.ok(document.querySelector('.orders-header h1').textContent.includes('Motocicletas'));
    assert.equal(document.querySelector('.global-search-results'), null);
  } finally {
    await desmontarInterface();
    globalThis.fetch = original;
  }
});

test('pesquisa geral ignora respostas antigas depois que o usuario muda o termo', async () => {
  const original = globalThis.fetch,
    pendentes = [];
  globalThis.fetch = async (url, opcoes) =>
    String(url).startsWith('/api/admin/search?')
      ? new Promise((resolve) => pendentes.push({ url: String(url), resolve }))
      : original(url, opcoes);
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/clientes'] }, criarElemento(App)),
    );
    const campo = document.querySelector('[aria-label="Pesquisar em todo o painel"]');
    const digitar = async (texto) =>
      act(async () => {
        campo.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(campo, texto);
        campo.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await digitar('Ana');
    await act(async () => {
      await aguardar(290);
    });
    await digitar('Honda');
    await act(async () => {
      await aguardar(290);
    });
    const resultado = (titulo) => ({
      itens: [
        {
          id: titulo,
          titulo,
          detalhe: 'Teste',
          tipo: 'Cliente',
          rota: '/clientes/1',
          relevancia: 100,
        },
      ],
      incompleta: false,
    });
    await act(async () =>
      pendentes
        .find((item) => item.url.includes('Honda'))
        .resolve(respostaJson(resultado('Honda'))),
    );
    await act(async () =>
      pendentes.find((item) => item.url.includes('Ana')).resolve(respostaJson(resultado('Ana'))),
    );
    assert.ok(document.querySelector('.global-search-results').textContent.includes('Honda'));
    assert.equal(
      document.querySelector('.global-search-results [role="option"]').textContent.includes('Ana'),
      false,
    );
  } finally {
    await desmontarInterface();
    globalThis.fetch = original;
  }
});

test('funcionarios destaca somente ordens abertas em vermelho e total em azul', async () => {
  try {
    await montarInterface(
      criarElemento(RoteadorMemoria, { initialEntries: ['/funcionarios'] }, criarElemento(App)),
    );
    assert.equal(document.querySelectorAll('.staff-metrics > [data-indicador="red"]').length, 1);
    assert.equal(
      document.querySelector('.staff-metrics > [data-indicador="red"]').dataset.editorCartao,
      'funcionarios:open',
    );
    assert.ok(
      document
        .querySelector('.staff-metrics [data-editor-cartao="funcionarios:todos"]')
        .classList.contains('blue'),
    );
  } finally {
    await desmontarInterface();
  }
});
