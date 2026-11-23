# Arquitetura

## Estrutura

| Caminho                                 | Responsabilidade                                        |
| --------------------------------------- | ------------------------------------------------------- |
| client/src/main.tsx                     | Inicializa preferencias, armazenamento e React          |
| client/src/App.tsx                      | Declara as rotas e carrega as paginas sob demanda       |
| client/src/pages                        | Telas e estado de cada fluxo                            |
| client/src/components                   | Componentes reutilizaveis, modais, menu e cabecalho     |
| client/src/components/novaOrdem         | Secoes de cliente, motocicleta e atendimento da nova OS |
| client/src/components/perfilFuncionario | Conteudo e modais do perfil do funcionario              |
| client/src/components/edicaoMotocicleta | Formulario visual e auxiliares da edicao de motos       |
| client/src/pages/configuracoes          | Composicao visual das configuracoes                     |
| client/src/components/configuracoes     | Navegacao, controles e secoes das configuracoes         |
| client/src/hooks                        | Logica React compartilhada                              |
| client/src/services/api                 | Chamadas HTTP separadas por assunto                     |
| client/src/services/apiAutenticacao.ts  | Entrada compativel para os consumidores da API          |
| client/src/services                     | Rascunhos, preferencias, sons e sincronizacao           |
| client/src/data                         | Dados locais usados pela interface                      |
| client/src/styles                       | Estilos globais de comportamento e acessibilidade       |
| server/src/index.ts                     | Abre a porta e inicia a fila de miniaturas              |
| server/src/app.ts                       | Monta os middlewares, rotas, arquivos estaticos e erros |
| server/src/config                       | Configuracao e clientes do Supabase                     |
| server/src/auth                         | Sessao, autorizacao e limite de tentativas              |
| server/src/validators                   | Validadores compartilhados dos pedidos                  |
| server/src/routes                       | Operacoes HTTP por dominio                              |
| server/src/servicos                     | Consultas de ordens, pagamentos, fotos e previas        |
| server/src/documentacao                 | Publicacao local do Swagger e do contrato               |
| server/tarefas                          | Testes e tarefas administrativas do servidor            |
| client/tarefas                          | Testes de interface e carregadores de teste             |
| tarefas                                 | Execucao local e compilacao para hospedagem             |
| supabase/migrations                     | Alteracoes de estrutura e regras do banco               |

## Como uma pagina funciona

O App escolhe a pagina pela URL. A RotaProtegida valida a sessao inicial. A EstruturaAdmin mantem uma instancia do menu e do cabecalho enquanto o conteudo da rota muda. Uma consulta nao deve desmontar o menu nem apagar o estado do formulario.

Os formularios maiores separam um hook com estado e acoes de um componente visual. As secoes reutilizam o tipo do hook para manter campos e manipuladores em sincronia. Isso evita duplicar uma segunda definicao do formulario.

A pagina chama um servico. O transporte HTTP envia os cookies, interpreta erros e informa quando uma escrita terminou. Os servicos por dominio mantem os caminhos e campos JSON usados pelo servidor. O arquivo de entrada da API reexporta esses servicos para evitar alteracoes desnecessarias nos consumidores existentes.

No servidor, a rota valida os dados, verifica o acesso e executa a operacao no Supabase. Regras de seguranca pertencem ao servidor. Ocultar um botao no React nao e autorizacao.

## Estado, atualizacao e rascunhos

O estado de edicao fica proximo do formulario. Logica compartilhada fica nos hooks e servicos existentes. Nao copie o mesmo menu, calendario, seletor ou modal entre paginas.

A atualizacao de dados tem uma rotina compartilhada. Consultas periodicas respeitam a visibilidade e a conexao. Escritas confirmadas avisam os assinantes e outras abas. Atualizar uma tabela nao deve redefinir os filtros escolhidos pelo usuario. O projeto usa sincronizacao periodica e eventos locais; isso nao e uma assinatura Realtime do Supabase.

Rascunhos usam a conta, o formulario e o registro como identificacao. Textos pequenos podem usar sessionStorage; fotos e arquivos usam IndexedDB. A validade e de sete dias. Senhas, tokens e credenciais nao sao gravados. Fechar o modal conserva o rascunho. Salvar com sucesso limpa o rascunho daquele formulario. Eles ficam no navegador e nao acompanham outra maquina.

Preferencias de leitura, som e inatividade acompanham a conta no servidor. Ha uma copia local para aplicar os controles sem esperar uma nova consulta a cada navegacao. Uma resposta antiga nao pode substituir uma edicao mais recente ainda em envio. O indicador de salvo depende da confirmacao do servidor.

## Sessao e acesso

Cookies HttpOnly guardam os tokens da sessao. A API pode renovar uma sessao expirada. O React reutiliza a verificacao inicial e faz revalidacoes em segundo plano. Uma resposta de sessao encerrada remove o acesso ao conteudo protegido.

O Google Authenticator usa TOTP pelo Supabase Auth, sem DNS, SMS ou e-mail. A tela de seguranca permite vincular o aplicativo por QR code. Confirmacoes administrativas validam senha e codigo no servidor; aprovar, recusar ou promover um administrador exige os dois fatores e consome a prova uma unica vez. A confirmacao so com senha vale 3 minutos; com senha e autenticador, ate 20 minutos. O banco guarda apenas o hash da prova e o nivel de verificacao, nunca a senha ou o codigo.

A chave privada fica somente no servidor. Como ela pode ultrapassar RLS, cada operacao administrativa precisa validar a identidade e a permissao antes da consulta. Limites de tentativas em memoria pertencem a esta instancia do processo e nao substituem controles distribuidos.

A pagina de cargos foi removida da interface. As funcoes de autorizacao existentes continuam necessarias. Nao retire verificacoes porque uma tela deixou de existir.

A consulta de motocicletas fica em server/src/services/motocicletas.ts. A rota cuida de autorizacao e resposta HTTP. O helper paginacao.ts percorre os lotes do Supabase sem apresentar um resultado incompleto como consulta concluida.

## Imagens e pagamentos

Geracao de miniatura, rascunho e aprovacao sao etapas diferentes. Uma imagem gerada nao deve virar imagem oficial automaticamente. A aprovacao verifica o administrador e o contexto. Os nomes persistidos no Storage e seus formatos de hash sao contratos de dados existentes.

O resumo de pagamento usa os valores da OS e dos itens no banco. O valor apresentado no navegador nao autoriza uma cobranca. Confirmar e desfazer a marcacao usam o mesmo fluxo existente, sem mudanca de regra nesta reorganizacao.

## Limites conhecidos

O catalogo usa `servicos` e `categorias_servico` como registros relacionais, com revisao atomica para evitar sobrescrita silenciosa. A agenda da tela administrativa le e grava em `agendamento`, vinculando os IDs existentes de cliente, moto e mecanico; ela nao mantém uma segunda lista JSON separada.

A compilacao e os testes verificam cenarios conhecidos. Uma refatoracao nao substitui homologacao com os aplicativos externos e com o banco da oficina.
