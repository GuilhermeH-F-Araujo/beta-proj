# Configurações v70

## Correção da ampliação

O elemento principal e o cabeçalho usavam largura percentual dividida pela escala de leitura. Em combinação com CSS zoom e o contêiner flexível, isso estreitava a área útil ao aumentar a escala e podia excedê-la ao diminuir. Ambos agora usam largura automática e alinhamento stretch, delegando a ocupação da largura ao layout. Menu, cabeçalho, conteúdo e modais continuam com escalas independentes.

## Acabamento corporativo

- Preferências usa linhas de ajuste com identificação à esquerda e controles à direita, sem cartões aninhados para cada barra.
- Barras sóbrias, valores explícitos e botões de incremento preservam acessibilidade por mouse e teclado.
- Linhas se reorganizam conforme a largura disponível, incluindo a largura efetiva após a ampliação.
- Preferências, Segurança e Notificações compartilham superfícies neutras, bordas discretas e ícones consistentes. Foram removidos os cabeçalhos multicoloridos.
- O verde permanece em confirmações e avisos sonoros ativos. A marca vermelha continua na navegação e nas ações do projeto.
- Os títulos usam linguagem administrativa mais direta.

## Persistência e entrega

Nenhuma alteração no banco ou nas regras de persistência por conta. Não requer novas variáveis de ambiente ou migrações. O pacote contém o cliente, servidor, scripts de build, Render e todas as migrações existentes.

## Verificação

Build completo do Render e 28 testes de configurações aprovados. Inspeção do cálculo de largura e dos limites de escala concluída no código. O ambiente de navegador continua indisponível: não houve teste visual das escalas em navegador nesta execução.
