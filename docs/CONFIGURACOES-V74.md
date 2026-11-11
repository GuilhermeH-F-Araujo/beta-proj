# Configurações v74 — composição e consistência

Preferências e Notificações passam a usar uma única folha de acabamento, reescrita para substituir as regras sobrepostas das últimas versões.

## Preferências

Cada seção separa o contexto dos controles: uma coluna lateral identifica o grupo e explica seu alcance; à direita ficam os ajustes. A leitura mantém tamanho, espessura, espaçamento, prévia e controles de acessibilidade. Interface e rotina usam a mesma estrutura. As linhas deixam de parecer cartões dentro de cartões.

A composição se adapta à largura efetiva do conteúdo: as linhas e as seções se reorganizam quando a escala aumenta. O cálculo de largura automática da v70 foi preservado. Conteúdo, menu, cabeçalho e modais mantêm escalas independentes e persistência por conta.

## Notificações

Mantém o controle geral único, os eventos à esquerda e as opções de áudio à direita. Ícones dos eventos ficam sem caixas decorativas. Os cabeçalhos de grupo têm preenchimento discreto, divisórias e alinhamento com os controles. Verde identifica as opções ligadas; vermelho aparece somente na identidade e em detalhes de ações. Textos auxiliares têm contraste reforçado, e eventos desativados não deixam toda a descrição translúcida.

Som, arquivo personalizado, silêncio, testes de áudio e regras individuais continuam usando os serviços existentes. Nenhuma alteração no banco, nas permissões ou nos formatos de preferências.

A aba Cargos e permissões continua removida.

## Validação

- Build completo do Render aprovado.
- 28 testes de configurações aprovados.
- Regras de reorganização e limites de escala revisados no código. Não houve inspeção visual em navegador, pois a prévia permanece indisponível.
- Pacote completo, sem nova migração ou variável de ambiente.
