# Configurações v71 — refinamento de Notificações e Preferências

## Notificações

- Substitui a introdução repetida por um resumo compacto: quantidade de eventos visíveis, ativação do som e horário de silêncio. Os números derivam das configurações reais.
- Verde identifica controles ativos e eventos configurados com som. Sons desligados aparecem explicitamente no resumo e nas linhas que têm som selecionado.
- As categorias permanecem neutras e os avisos sonoros selecionados recebem um destaque suave, sem cores diferentes para cada módulo.
- O botão de ouvir a prévia usa o vermelho da marca. O volume passa a preencher a barra conforme o valor escolhido.
- A mensagem de resultado deixa de ser fixa sobre a lista; permanece acessível por região de status/alerta.
- A organização considera a largura efetiva após a ampliação, evitando comprimir as duas colunas em uma área pequena.

## Preferências

Mantém a organização aprovada. Refina valores, estados selecionados, ícones e contrastes. Verde indica opções ativadas; azul acinzentado identifica ajustes de leitura e seleção. A correção de largura v70 permanece intacta.

## Validação e implantação

Build completo do Render e 28 testes de configurações aprovados. Sem nova migração, variável de ambiente ou mudança nas regras de persistência por conta. Não houve inspeção visual no navegador nesta execução, pois o ambiente de prévia permanece indisponível.

O ZIP contém todo o código do cliente e do servidor, scripts, configuração Render e migrações existentes.
