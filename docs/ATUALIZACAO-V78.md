# Atualização v78 — interface compartilhada e dados vivos

## O que muda

- Uma única `EstruturaAdmin`, montada na rota protegida, contém menu lateral e cabeçalho. As páginas não renderizam cópias dos menus. O recolhimento do menu continua ao navegar.
- Componente `CampoCep` compartilhado nos campos de CEP existentes: edição de cliente, novo funcionário e endereço da oficina. Consulta automática após oito dígitos, atraso curto, cancelamento e rejeição de resposta antiga. Campos continuam editáveis. Número do imóvel não é retornado pelo CEP; permanece manual. Complemento é opcional e separado.
- Consulta postal autenticada pelo servidor. Correios oficial com token subdelegado ou credenciais CWS; ViaCEP como alternativa declarada quando não há credenciais ou o serviço falha. Nenhuma chave dos Correios é enviada ao navegador.
- Atualização automática das listas, perfis, históricos, indicadores, opções da nova OS, resumo de pagamento e logs. Alterações confirmadas nesta aplicação notificam as telas e outras abas; alterações externas são consultadas a cada 15 segundos enquanto a página está visível e conectada. Ao voltar à aba ou recuperar conexão, a consulta é antecipada. Isso é atualização periódica, não um WebSocket.
- Filtros, paginação e formulários abertos são preservados. A atualização em segundo plano não troca dados existentes por skeletons.
- Agenda e catálogo passam a ter fonte compartilhada no banco, com revisão para rejeitar sobrescrita simultânea. A API verifica as permissões de criação, edição e exclusão por diferença de conteúdo.
- Rascunhos dos formulários de cadastro, edição, observações, documentos, pagamentos, agendamentos, categorias, prévias de moto e dados da oficina. Separação por conta e registro, validade de sete dias e limpeza após confirmação de salvamento. Texto e imagens preparadas usam memória/armazenamento da sessão e IndexedDB; os rascunhos permanecem neste navegador e não são sincronizados com outros computadores. Senhas e credenciais não são persistidas. Fechar não pede confirmação de descarte; o bloqueio durante uma gravação já em andamento foi preservado onde existia.
- Skeletons compartilhados nos carregamentos de dados das páginas, nas transições de rota e em consultas de modais e diagnóstico. Formulários estáticos de login e configurações locais não ganham atraso artificial. Erros e resultados vazios continuam distintos de carregamento.
- Números dos cards de motocicletas em cor neutra, mantendo as cores dos ícones.
- Correção da coluna dos dias da semana no calendário e da data inicial fixa de novos agendamentos.

## Antes de publicar

1. Faça uma cópia de segurança do banco e preserve os arquivos locais de ambiente.
2. Execute `ATUALIZAR-BANCO-V78.sql` no projeto Supabase utilizado pelo servidor, ou aplique as duas migrações novas pelo fluxo habitual:
   - `20261111161420_complemento_cliente.sql`;
   - `20261111162023_dados_compartilhados_painel.sql`.
3. Publique o pacote completo na raiz do repositório, preservando `client`, `server`, `scripts`, `package.json` e `render.yaml`.
4. Render: `npm run build:render`, início `npm start`, health check `/health`.

As alterações SQL são aditivas: acrescentam o complemento do cliente e uma tabela de snapshots versionados de agenda/catálogo. A tabela compartilhada tem RLS e acesso direto revogado de `anon` e `authenticated`; a API faz a autorização antes de usar a conexão privilegiada.

**Atualização de situação:** as duas alterações foram posteriormente aplicadas e verificadas no Supabase `estacao-motos` em 11/11/2026. Consultar `ATUALIZACAO-V79.md`. As instruções de aplicação são necessárias apenas para outros ambientes ainda não atualizados. Não reaplique migrações antigas indiscriminadamente.

## Credenciais de CEP

A API oficial exige contrato Correios com Busca CEP habilitada. Configure somente no servidor/Render:

- `CORREIOS_TOKEN`: token subdelegado; ou
- `CORREIOS_USUARIO`, `CORREIOS_CODIGO_ACESSO`, `CORREIOS_CONTRATO` e, se necessário, `CORREIOS_DR`.
- `CEP_PERMITIR_VIACEP=true` é o padrão. Use `false` para exigir o serviço oficial e permitir apenas preenchimento manual quando ele não estiver configurado/disponível.

O servidor mantém token/cache temporários, limita consultas por usuário, valida o CEP e usa endereços fixos dos provedores com timeout. Um CEP geral pode retornar somente cidade/UF: rua, número e demais campos continuam disponíveis.

Referências consultadas:
- https://www.correios.com.br/atendimento/developers/manuais/manual-api-busca-cep
- https://viacep.com.br/

Não houve chamada real autenticada aos Correios com contrato do usuário; a integração foi verificada com respostas simuladas nos testes.

## Dados locais anteriores

Na primeira inicialização de um cadastro compartilhado ainda inexistente, a aplicação pode aproveitar o catálogo local e os agendamentos reais locais. Os exemplos antigos de agenda, com IDs do conjunto demonstrativo, não são importados. O catálogo inicial existente no projeto continua disponível como ponto de partida.

Depois que o banco já possui dados, ele é a fonte de leitura. Antes de substituir os caches locais, a aplicação preserva uma cópia com o sufixo `-backup-pre-v78`, quando o armazenamento do navegador permite. Dados locais divergentes de outros computadores não são mesclados automaticamente; preservar e revisar esses cadastros antes de descartar qualquer cache.

Dados gerais da oficina continuam com a persistência local anterior; a mudança no banco desta entrega abrange agenda, catálogo e complemento de cliente. Preferências pessoais mantêm a sincronização por conta já existente.

## Testes

- Build do fluxo Render executado com sucesso durante a implementação; compilação do cliente e do servidor novamente verificada após os ajustes.
- 83 testes de servidor/regras, incluindo CEP, permissões, revisão de dados compartilhados e regressões existentes.
- 15 testes de interface em DOM simulado com React: montagem de nove rotas, um menu/cabeçalho por página, atualização dos cards mantendo filtro, rascunhos e isolamento entre contas/registros, recuperação do texto do modal e respostas de CEP fora de ordem.

Comandos:

```bash
npm run install:all
npm run build
npm run test:ui
npm --prefix server run test:shared
npm --prefix server run test:settings
```

Os testes de interface usam JSDOM e respostas simuladas. Não substituem inspeção visual em navegador real, uso de áudio no computador, validação das credenciais e teste do banco de produção. Não houve essa inspeção visual nesta execução.
