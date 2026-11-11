# Configurações v69 — organização e acabamento

## Preferências

A tela deixa as duas colunas longas para apresentar três seções, nesta ordem:

1. Leitura e acessibilidade: tamanho do conteúdo, espessura e espaço entre linhas; prévia e opções de contraste e movimento logo abaixo.
2. Tamanho da interface: menu lateral, cabeçalho e modais, com ajustes independentes.
3. Seu dia a dia: tamanho dos controles e período inicial do Dashboard.

Os controles de arrastar usam azul sóbrio, valor explícito e botões de diminuir e aumentar. Os botões respeitam os mesmos limites e passos das barras e têm nomes acessíveis. Os controles continuam utilizáveis pelo teclado. A disposição considera tanto a largura da janela quanto a largura efetiva após a ampliação do conteúdo.

## Segurança

Cabeçalhos com fundos suaves, ícones e cores por finalidade: azul para acesso, âmbar para inatividade, violeta para histórico e verde para privacidade. Identidade, proteção, linha do histórico e ações ganharam superfícies próprias. Todos os botões continuam ligados às ações já existentes.

## Notificações

Grupos de clientes e ordens têm cabeçalhos distintos, com contagem real dos eventos habilitados no painel. Eventos com som recebem destaque discreto; os controles de painel e som usam verde e violeta, respectivamente. Os módulos de som, silêncio e envio de áudio foram refinados sem mudar as regras de reprodução, validação ou persistência.

## Persistência e banco

As preferências continuam salvas por conta conforme v68. Esta versão não altera o banco e não necessita de nova migração ou variável de ambiente.

## Validação

- Build completo do Render aprovado.
- 28 testes de configurações aprovados, incluindo persistência e isolamento entre contas.
- A inspeção visual em navegador continua indisponível neste ambiente; não foi realizada comparação por captura de tela.

O pacote contém todo o projeto, com cliente, servidor, scripts, configuração Render e migrações existentes.
