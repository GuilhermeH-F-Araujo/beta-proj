# Configurações — integração global e logs (v67)

## Integração das preferências

O monitor de notificações agora é único e permanece na rota protegida durante a sessão. Ele não é recriado junto com cada cabeçalho. As leituras e dispensas feitas pelo usuário atualizam a central compartilhada, protegendo o estado contra respostas antigas de consultas concorrentes.

Uma gravação bem-sucedida de cliente, OS ou cadastro de usuário anuncia a atualização da central imediatamente depois da resposta da API. Eventos de outras sessões são consultados a cada cinco segundos, sujeitos à disponibilidade da rede e às limitações de timers em segundo plano do navegador. Não é um fluxo WebSocket.

Ao ativar o som de um evento, os sons gerais também são ativados e o contexto de áudio é preparado durante o clique. A mesma saída de áudio é reutilizada para bipes e arquivos personalizados, em vez de criar uma saída bloqueada nova a cada consulta. Abrir uma página ou consultar avisos antigos não repete sons. O som escolhido por evento, o volume e o horário de silêncio continuam sendo respeitados.

O motor de leitura é inicializado antes de renderizar a aplicação. Tamanho, espessura, espaçamento, contraste, movimento e densidade são compartilhados entre as páginas administrativas e seus modais. Agendamentos, que usa um contêiner diferente das demais páginas, foi incluído. Portais acrescentados ao documento recebem a escala automaticamente; diálogos internos não são ampliados duas vezes. Menus ancorados tiveram as coordenadas ajustadas para a escala global.

As escolhas continuam persistidas neste navegador. Alterações de leitura em outra aba são aplicadas via evento de armazenamento. As escolhas sonoras permanecem separadas por conta.

## Modal de logs

O modal foi refeito a partir da segunda referência fornecida: cabeçalho com ícone vermelho em círculo rosa, barra de filtros azul-clara, tabela com bordas azuis, ícones e etiquetas de ação coloridos, etiquetas verdes de sucesso, paginação vermelha e botão de exportação delineado.

- Período pelo seletor de datas já existente no projeto; intervalo validado no servidor, com limite de um ano.
- Filtros por usuário e ação, busca sem distinção de acentos, ordenação e paginação com oito linhas por página.
- Exportação dos registros filtrados em CSV, incluindo prevenção de fórmulas nos campos textuais.
- Dados reais dos históricos de OS e clientes arquivados, até os 100 mais recentes do período.
- Função do usuário quando disponível. IPs ausentes aparecem como “—”; não foram inventados acessos, endereços ou falhas de login. O status “Sucesso” identifica operações já confirmadas no histórico, não tentativas de autenticação.

## Imagem da Rede

O arquivo original tem grandes margens transparentes. A exibição foi ampliada dentro da área da maquininha, com recorte visual das margens, preservando o produto original. A visualização no guia também foi ajustada.

## Verificação

- Construção de produção de cliente e servidor com `npm run build:render`.
- 18 testes automatizados com `npm --prefix server run test:settings`.
- Os testes incluem: evento novo → toque escolhido, ausência de repetição ao navegar/consultar, atualização após gravações bem-sucedidas, falhas sem aviso, proteção contra respostas antigas, aplicação/persistência global da leitura, inclusão de portais, silêncio por horário, preferências individuais e validação de intervalos do histórico.
- O teste sonoro verifica as chamadas de reprodução e as frequências do toque escolhido com um contexto de áudio controlado. Não é uma confirmação do volume audível no equipamento do usuário.
- A comparação visual pixel a pixel e a reprodução no navegador real não foram concluídas neste ambiente. A infraestrutura de prévia já havia retornado falha de relay na revisão anterior; não se afirma validação visual que não foi realizada.

Esta revisão não alterou o banco. Ela utiliza os nove eventos instalados pela migração da v66. Para obter o comportamento atualizado, publique cliente e servidor deste pacote juntos. Não há variáveis de ambiente novas.
