# Configurações v76 — reorganização com referências

## Pesquisa e decisões

As referências foram efetivamente pesquisadas e abertas nesta execução:

| Referência | Aplicação no projeto |
| --- | --- |
| [MUI Dashboard](https://mui.com/material-ui/getting-started/templates/dashboard/) | Hierarquia de navegação, cabeçalhos de cartões e áreas de trabalho com ações agrupadas. |
| [MUI Tabs](https://mui.com/material-ui/react-tabs/) | Navegação reutilizável com painel associado, foco e teclado. |
| [21st — Settings Pages](https://docs.21st.dev/blog/react-settings-page-components) | Separação por assunto, valores atuais visíveis, gravação automática e confirmação existente na conta. |
| [21st — Form Layout](https://docs.21st.dev/@ephraimduncan/components/form-layout) | Referência pública de composição de formulário; adaptação feita com os componentes do projeto. O código reservado a assinantes não foi importado. |
| [MotionSites — Apps](https://motionsites.org/apps) e [Dashboard UI](https://motionsites.org/prompts/dashboard) | Catálogo e especificação pública avaliados. A proposta de vidro escuro, gradientes e vídeo não foi adotada por não combinar com a identidade clara e o público do projeto. |
| Pinterest | Busca feita; a página de resultados visuais não ficou acessível. Não é apresentada como referência visual validada. |

A área de configurações usa a fonte Jakarta local já utilizada pelo Dashboard e por Serviços.

A implementação adapta os padrões ao código existente. Não instala MUI, Tailwind ou bibliotecas de animação nem copia templates pagos.

## Mudança estrutural em Preferências

A página deixa de mostrar três blocos extensos simultaneamente. Uma navegação local apresenta Leitura, Interface e Rotina; a área ao lado exibe o editor selecionado. O painel de leitura reúne texto, prévia e acessibilidade; Interface concentra as três escalas independentes; Rotina apresenta controles e período inicial.

Os painéis permanecem montados e são ocultados visualmente quando inativos. Trocar de área não redefine valores nem interrompe a fila de salvamento. As regras de largura consideram a área útil depois da ampliação, incluindo o contêiner externo, para não voltar a criar uma faixa vazia ao lado.

## Mudança estrutural em Notificações

Duas áreas explícitas:

- Regras dos eventos: lista em largura total, filtros Todos / Clientes / Ordens de serviço, seleção do toque na mesma linha e controles do sino e do som alinhados.
- Som e horário: área própria para som padrão, volume, silêncio e áudio personalizado, com cartões em grade que se reorganizam conforme a largura.

Os filtros não desativam regras e não eliminam configurações de grupos ocultos. Os ajustes de áudio continuam no mesmo componente, preservando estados de validação e upload durante a navegação. O controle geral único de som permanece no cabeçalho.

## Navegação e acessibilidade

O novo componente `NavegacaoConfiguracao` é reutilizado nas abas principais e nas duas áreas locais. Usa nomes acessíveis, associação entre abas e painéis, foco controlado e teclas de seta, Home e End. Abas horizontais usam esquerda/direita; a navegação vertical de Preferências usa cima/baixo.

As abas principais passam a ter URL, por exemplo `/configuracoes?aba=preferencias` e `/configuracoes?aba=notificacoes`. Voltar e avançar recupera a seção indicada na URL. Valores inválidos, assuntos removidos e abas não autorizadas são tratados com retorno seguro. A aba de Cargos e permissões continua removida.

## Verificação

- Build completo do Render aprovado.
- 31 testes de configurações aprovados: os 28 existentes e três testes de navegação e links diretos.
- Sem alteração de banco, formatos de preferências ou variáveis de ambiente.
- O ambiente de prévia permanece indisponível: não houve inspeção visual em navegador nem teste de áudio em hardware nesta execução.

O ZIP contém todo o cliente e servidor, scripts, configuração Render e migrações existentes.
