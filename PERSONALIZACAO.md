# Personalizacao do painel

A organizacao e um conjunto de encaixes e atalhos conhecidos. Nao recebe HTML,
CSS, URLs ou codigo arbitrario. O cabecalho padrao conserva pesquisa de OS,
personalizacao, nova OS, novo usuario e notificacoes; o perfil permanece fixo.
O menu conserva os modulos disponiveis para a conta, com ordem e posicao editaveis.

## Uso

Abra Editar tela no menu principal ou Personalizar no cabecalho. A propria tela
recebe um efeito de elevacao e uma barra identifica o modo de edicao. Todos os
botoes e textos passam a ser objetos selecionaveis; suas acoes ficam suspensas.
Clique no elemento real para abrir ferramentas junto dele: tamanho, texto,
troca por atalho conhecido, ordenacao e restauracao. Concluir edicao devolve o
funcionamento normal. Escape fecha primeiro as ferramentas e depois o modo.

Os sinais + ficam nos proprios cabecalho e barras. O catalogo contextual possui
pesquisa e grupos Todos, Acoes, Paginas e Pesquisas. Os + nas bordas criam barras
no encaixe correspondente. Selecione a alca da area para mudar sua posicao ou
nome. Itens usam setas ou arraste; o arraste so esta ativo durante a edicao e os
encaixes aparecem quando uma barra e arrastada. Cartoes ocultos ficam visiveis
com indicacao durante a edicao, permitindo restaura-los na propria pagina.

Cada cabecalho/barra admite ate 24 blocos, incluindo pesquisas repetidas. Existem
um menu por lado: esquerda, direita, superior e inferior. O menu principal
ocupa um desses lados, portanto existem ate tres barras adicionais. Os dois
encaixes superiores sao alternativas e nunca coexistem. A criacao e as
movimentacoes so oferecem lados livres. Ao remover uma barra, o sinal + volta.
Preferencias antigas sao acomodadas nos lados livres; atalhos excedentes sao
reunidos nas barras existentes ou no cabecalho, dentro do limite de 24 blocos. Os encaixes sao esquerda, direita, acima do
cabecalho, abaixo dele e parte inferior. Nos tres encaixes horizontais, os itens
ficam centralizados em colunas laterais simetricas, com a logo a esquerda.
O modo recolhido preserva alvos de toque de pelo menos 44px e usa destaque
vermelho suave sem comprimir o fundo ativo na largura do icone. Desfazer e Refazer mantem ate 30 etapas
na sessao. Restaurar disposicao e elementos preserva os ajustes gerais de leitura.
A entrada permanente Editar tela e o perfil sao protegidos contra substituicao.

As alteracoes sao imediatas e usam a fila de salvamento da conta. O indicador
mostra a sincronizacao; nenhuma preferencia muda o padrao das outras contas.
O modo de edicao e transitorio e nunca e salvo como preferencia.

## Fontes e carregamento

Existem dez alternativas aplicadas na hora na propria interface: sistema, Plus Jakarta Sans, Arial, Verdana,
Tahoma, Trebuchet MS, Segoe UI, Georgia, Cambria e Consolas. Plus Jakarta Sans ja
acompanha o projeto; as demais usam fontes do computador e fallbacks definidos.
Nao foram adicionadas requisicoes externas para baixar fontes.

As nove telas principais visitadas permanecem em memoria usando Activity do React
ja instalado. Isso preserva filtros, paginacao, rolagem e DOM. Telas ocultas tem
seus efeitos interrompidos: nao continuam assinando atualizacoes ou executando
polling. Ao retornar, os dados sao revalidados sem substituir a lista por um
skeleton. Nao existe cache persistente de dados pessoais em localStorage.

A memoria pertence a instancia autenticada e e destruida ao sair/trocar conta.
Permissoes continuam sendo verificadas; telas sem permissao saem da arvore.
Perfis individuais e dados de autenticacao nao sao mantidos neste conjunto.
SkeletonPagina usa composicoes por modulo. SkeletonDashboard reaproveita a
composicao original do dashboard sem alterar seu conteudo visual.

## Arquivos e extensao

| Responsabilidade                                     | Arquivo                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Catalogo publico de atalhos, fontes, rotas e cartoes | server/src/shared/catalogoInterface.ts                                   |
| Contrato de organizacao da API                       | server/src/preferenciasWorkspace.ts                                      |
| Validacao e persistencia autenticada                 | server/src/preferenciasConta.ts                                          |
| Normalizacao, padroes, ordenacao e modo de arraste   | client/src/services/organizacaoInterface.ts                              |
| Integracao com a fila de preferencias da conta       | client/src/services/preferenciasGlobais.ts                               |
| Execucao autorizada e modais existentes              | client/src/components/organizacao/AtalhosPainel.tsx                      |
| Encaixes e barras adicionais                         | client/src/components/organizacao/BarrasAtalhos.tsx e EncaixesPainel.tsx |
| Controlador da edicao na tela                        | client/src/components/PersonalizadorInterface.tsx                        |
| Ferramentas, insercao e substituicoes                | client/src/components/edicaoVisual/                                      |
| Posicionamento contextual das ferramentas            | client/src/hooks/useAncoraVisual.ts                                      |
| Composicao dos menus compartilhados                  | client/src/components/EstruturaAdmin.tsx                                 |
| Retencao controlada das telas                        | client/src/components/PaginasPersistentes.tsx                            |
| Skeletons por pagina                                 | client/src/components/SkeletonPagina.tsx                                 |
| Escolha visual de fontes                             | client/src/components/configuracoes/SeletorFonte.tsx                     |
| Cartoes visiveis por pagina                          | client/src/hooks/useCartoesPagina.ts                                     |
| Pesquisas e atalhos que abrem editores nas paginas   | client/src/hooks/usePesquisaPagina.ts e useAtalhoPagina.ts               |

Para acrescentar um destino simples, registre id, rotulo, icone, rota e permissao
no catalogo publico. O editor e a validacao passam a reconhece-lo automaticamente.
Uma acao nova sem rota tambem precisa de um manipulador em ProvedorAtalhos; nunca
armazene uma funcao ou permita uma URL informada pelo usuario. Campos contextuais
que exigem um id de registro continuam sendo acessados pela tela correspondente.

Nova OS, novo usuario/cliente/funcionario e nova motocicleta reutilizam os modais
existentes. Novo agendamento abre o formulario da agenda. Novo servico foca o
editor existente; nova categoria abre seu modal. A confirmacao de criacao de
usuarios permanece aberta para permitir conferir os dados de acesso.

Para acrescentar uma fonte, edite fontesInterface. Para acrescentar um grupo de
cartoes, edite cartoesInterface e use o gancho na pagina correspondente. Este
catalogo contem somente metadados publicos e e compartilhado pela API e cliente.
O Vite permite explicitamente apenas esse diretorio publico externo ao cliente;
a API e configuracoes privadas do servidor nao entram nessa permissao.

## Compatibilidade e verificacao

organizacao, substituicoes e o legado painelPersonalizacao sao extensoes opcionais de leitura no contrato
HTTP. Leitores antigos continuam aceitos. A normalizacao usa o padrao para dados
legados. O armazenamento permanece no JSON leitura de usuario_preferencia e na
RPC salvar_preferencia_usuario, restrita ao titular autenticado. Nao ha nova
migracao SQL nem duplicacao da fila de salvamento/sincronizacao.

Os testes cobrem limites/ids da API, sincronizacao entre computadores, isolamento
entre contas, permissao de atalhos, encaixes, ordenacao/restauracao, criacao de
barra, dez botoes e duas pesquisas, fonte aplicada na propria interface, selecao direta e bloqueio de acoes,
preservacao de filtros/DOM e pausa das telas ocultas.

Referencias consultadas:

- https://wordpress.org/documentation/article/work-with-blocks/
- https://wordpress.com/support/wordpress-editor/select-and-move-blocks/
- https://elementor.com/help/inline-editing/

- https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines/
- https://support.atlassian.com/navigation/docs/what-is-the-new-navigation-in-atlassian-home/
- https://www.nngroup.com/articles/customization/
- https://21st.dev/
- https://60fps.design/
- https://www.fontinlogo.com/

A navegacao usa encaixes, indicacao de arraste e alternativas de teclado. As ferramentas aparecem junto ao elemento selecionado. Fontes de logos foram tratadas como
referencia visual, sem substituir criterios de leitura por tipografia decorativa.

O acabamento da edicao usa a mesma colecao de icones do projeto, ferramentas
contextuais com borda de selecao e controles agrupados. A barra de edicao muda
para duas linhas em telas pequenas; o posicionamento das ferramentas respeita
a altura real da barra. Animacoes de entrada respeitam movimento reduzido.
Referencias visuais adicionais:

- https://21st.dev/@0xUrvish/components/dynamic-toolbar
- https://godly.design/
- https://motionsites.ai/

## Pesquisa geral e iluminacao

A pesquisa padrao do cabecalho consulta clientes, motos, funcionarios, OS,
servicos e agenda em GET /api/admin/search?q=. A identidade e verificada antes
de consultar; cada modulo exige permissao de visualizar no servidor. Sao ate
20 resultados. Cada cadastro le ate 20 correspondencias e, se necessario, ate
40 candidatos para sugestoes com um erro de digitacao. Nao existe indice
exaustivo de todos os campos. Falha parcial e indicada; falha total retorna 503.
O cliente aguarda 250ms de digitacao, cancela consultas antigas, permite
selecionar por setas/Enter e abre a pagina do registro. Resultados nao sao
persistidos. O antigo atalho pesquisa-os continua aceito e usa pesquisa geral.

O tema claro/escuro e salvo no mesmo JSON leitura da conta, sem migracao SQL.
Preferencias sem tema usam claro. As 39 folhas de estilo compartilham cores
semanticas com o claro original como alternativa; o escuro define superficies,
texto, bordas e cores de estado em client/src/styles/tema.css. Fotos e cores
selecionadas pelo usuario nao sao invertidas. Contraste de texto principal,
secundario e botoes e verificado nos testes.

O botao de iluminacao fica no cabecalho e nas preferencias. A troca usa View
Transitions quando disponivel. Uma faixa suave revela o tema novo sobre a
interface anterior e muda de direcao na volta. Sem essa API, uma cortina na
cor do tema de destino faz a troca. Sem animacao disponivel, aplica imediatamente. Movimento reduzido da conta ou do sistema desativa o efeito.
Perfis de conforto alteram apenas leitura; nao apagam tema, menus ou atalhos.

Arquivos adicionais: server/src/pesquisaGeral.ts,
server/src/shared/encaixesInterface.ts,
client/src/components/organizacao/PesquisaGeral.tsx e
client/src/services/temaInterface.ts.

Referencia tecnica da transicao:
https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
