# Notificações v77

A tela de Notificações passa a usar a mesma estrutura de edição aprovada em Preferências. Preferências não foi redesenhada nesta versão.

## Organização

- Navegação própria com Eventos, Som e volume e Silêncio.
- Remoção do banner e da navegação horizontal duplicada.
- Controle geral de som visível junto à navegação em todas as áreas.
- Eventos mantém filtros, regras do sino, sons individuais e seleção de toque, com o alinhamento adequado à área de edição.
- Som e volume reúne o som padrão, prévia, volume e áudio personalizado. Os controles são agrupados, em vez de três cartões competindo na mesma linha.
- Silêncio tem uma área dedicada para ativação e horários, acompanhada de uma explicação derivada da configuração atual. Horários iguais indicam silêncio durante o dia inteiro.
- Quando há silêncio programado, o controle geral oferece um atalho para revisar esse horário.

Os painéis continuam montados durante as trocas de área, mantendo as preferências e o estado de upload. Seletores abertos são fechados ao mudar de área, inclusive pelo teclado. A navegação reutiliza o componente existente, com foco, setas, Home, End e identificação dos painéis.

## Acabamento

Tipografia Jakarta do projeto, mesma navegação de Preferências, vermelho discreto na seleção, verde nos controles ligados e campos neutros. Grades se reorganizam pela largura efetiva após a ampliação. O controle geral não é um menu fixo novo e acompanha a escala do conteúdo.

## Validação

Build completo do Render e 31 testes de configurações aprovados. Sem alterações no banco, nas regras de notificação, na validação dos arquivos ou no formato das preferências por conta. Não há nova variável de ambiente ou migração.

Não houve inspeção visual em navegador ou teste de áudio em hardware nesta execução; a prévia permanece indisponível no ambiente.
