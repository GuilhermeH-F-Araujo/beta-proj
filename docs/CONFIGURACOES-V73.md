# Configurações v73

## Remoção do tópico

A aba Cargos e permissões foi removida, junto com sua tela, seu modal e seus estilos. A navegação ocupa o espaço disponível sem coluna vazia. O atalho de revisão da equipe em Segurança leva a Funcionários, e os textos da visão geral foram corrigidos. A rota de gerenciamento de cargos não é mais publicada pela API.

As verificações internas de autorização e as proteções de leitura do banco permanecem para preservar a segurança e os vínculos já existentes. Esta versão não exclui registros do banco nem altera o acesso de usuários automaticamente.

## Preferências

Mantém os três blocos existentes, com refinamento dos títulos, espaçamentos, contraste dos valores e botões de ajuste. O detalhe vermelho da marca aparece na seção principal; verde continua reservado aos controles ligados. A largura automática e as escalas independentes continuam intactas.

## Notificações

O cabeçalho reúne contexto e controle geral dos sons. O controle duplicado foi retirado do cartão de áudio. A lista mantém as escolhas por evento, com títulos mais claros: Mostrar no sino e Emitir som. Os grupos usam divisórias discretas, sem cartões de resumo ou cores por categoria. Os controles ativos são verdes, os elementos de marca recebem vermelho discreto e os campos permanecem neutros.

As funcionalidades de som, testes de áudio, arquivo personalizado, silêncio e persistência por conta permanecem conectadas. As mensagens de confirmação continuam no fluxo da página, sem cobrir os eventos.

## Validação

Build completo do Render e 28 testes de configurações aprovados. Não há nova migração ou variável de ambiente. Publicar cliente e servidor juntos. Sem inspeção visual em navegador nesta execução, pois a prévia permanece indisponível.
