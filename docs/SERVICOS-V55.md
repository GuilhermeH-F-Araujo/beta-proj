# Serviços — versão 55

A página de Serviços foi reorganizada como área de trabalho do catálogo: resumo da oficina, busca e filtros, tabela para comparação direta, formulário de criação/edição e gestão de categorias. A interface segue a linguagem visual do dashboard, com tipografia Plus Jakarta Sans, fundo cinza claro, superfícies brancas, realce vermelho e tamanhos de texto confortáveis.

## Estrutura e comportamento

- Quatro indicadores rápidos: serviços totais, categorias, ativos e inativos. Cada indicador permite filtrar o catálogo relacionado.
- Tabela com serviço, categoria, preço, tempo médio, situação e ação de edição; busca, categoria e situação podem ser combinadas.
- Formulário à direita para cadastrar ou editar, com seleção de categoria e tempo personalizado, custos, situação e informações adicionais.
- Categorias organizadas em cartões acionáveis, com contagem, cor e ícone. O modal de escolha de ícone substitui visualmente o modal de categoria enquanto está aberto.
- Rolagem vertical normal mantém tabela, editor, observações, ações e cartões de categorias acessíveis em telas menores.
- As opções do catálogo continuam sincronizadas com o fluxo de agendamentos pelo evento existente.

## Persistência atual

O catálogo continua usando o `localStorage` existente (`estacao-motos-catalogo-servicos-v1`) para manter compatibilidade com as telas que já o consomem. A interface só atualiza a lista após uma gravação bem-sucedida; erros de armazenamento preservam o formulário aberto e mostram uma mensagem de erro. Esta versão não migra o catálogo para o banco de dados.

## Referências de interface

- [MUI — Table](https://mui.com/material-ui/react-table/): estrutura tabular para comparação e navegação por páginas. A escolha mantém alinhamento e leitura de preços, categoria, tempo e situação.
- [MUI — Card](https://mui.com/material-ui/react-card/): agrupamento de conteúdo relacionado e ações contextualizadas, aplicado aos indicadores, ao editor e às categorias.
- [21st.dev — React dashboard components](https://news.21st.dev/blog/react-dashboard-components): composição de painel em áreas distintas e uso de tabela quando se precisa comparar registros com alinhamento consistente.

Essas referências orientaram a composição; nenhum pacote visual adicional foi introduzido no projeto.

## Verificação

Build de produção: `npm --prefix client run build`.

Testes de navegador com viewport de 1440×900 e 1858×932: renderização, edição, criação com tempo personalizado, falha simulada de armazenamento sem alteração dos dados, gravação bem-sucedida, edição sem duplicar, combinação independente de busca/categoria/situação, limpeza de filtros e criação de categoria com seletor de ícone sem perda dos campos. Revisores de interface, aprovação visual e código aprovaram a entrega.

As capturas anexas documentam a visão geral, edição, tela larga e navegação até as categorias.
