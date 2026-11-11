# Configurações v68

## Leitura e acessibilidade

- Conteúdo, menu lateral, cabeçalho e modais têm controles de tamanho independentes. Aumentar o conteúdo mantém a navegação no tamanho escolhido separadamente.
- Espessura, espaçamento, contraste e movimento continuam globais. Os estilos permanecem ativos quando outras páginas carregam seus próprios arquivos CSS.
- As preferências pessoais são carregadas antes de liberar as páginas protegidas, evitando exibir valores padrão antes dos valores da conta.
- O bloco “Deixe a central de avisos do seu jeito” foi removido das integrações.

## Persistência da conta

Leitura, notificações, som personalizado e tempo de inatividade são armazenados por usuário autenticado. Ao entrar em outro computador, a conta recupera seus ajustes. O cadastro geral da oficina mantém seu comportamento anterior; esta migração trata das preferências pessoais.

As alterações de leitura e notificações são aplicadas imediatamente e enviadas ao servidor após uma breve pausa. Um indicador distingue carregamento, salvamento, confirmação e erro. Se a conexão falhar, as alterações pendentes ficam no cache da própria conta e são reenviadas. Alterações durante uma requisição não são descartadas. Outra conta não recebe os ajustes nem a fila do usuário anterior.

Sons personalizados só são confirmados após o servidor validar e salvar o WAV. Há verificações de formato PCM, cabeçalhos, canais, taxa de amostragem, tamanho e duração; os metadados são calculados no servidor. A ausência de áudio em outro computador provoca o download privado para a conta autenticada.

## Banco e implantação

Migração: `supabase/migrations/20261107233034_preferencias_da_conta.sql`.

A migração já foi aplicada ao projeto Supabase conectado. Ela adiciona `public.usuario_preferencia` e `public.salvar_preferencia_usuario`, sem excluir dados existentes. O acesso direto por clientes anônimos ou autenticados está revogado; RLS permanece habilitado. As rotas do servidor usam a identidade da sessão, conferem a conta solicitada e atualizam somente a seção enviada. A função executa com os privilégios do chamador, sem SECURITY DEFINER.

O aviso informativo “RLS sem políticas” é intencional para essa tabela, pois somente o servidor com service role possui acesso. Não habilitar acesso público para remover esse aviso.

Publicar cliente e servidor juntos. Não há nova variável de ambiente. O ZIP contém a estrutura completa na raiz, incluindo `client/src/main.tsx`, servidor, scripts de build, configuração do Render e migrações. Não contém dependências instaladas, arquivos de ambiente privados ou builds gerados.

## Validação

- `npm run build:render`: aprovado.
- `npm --prefix server run test:settings`: 28 testes aprovados.
- Teste transacional no banco: isolamento entre contas, preservação entre seções, versão do áudio e permissões aprovados; alterações de teste revertidas.
- Verificação de avisos de segurança das novas entidades: apenas o aviso informativo intencional descrito acima.
- Sem inspeção visual em navegador nesta execução, por indisponibilidade do ambiente de prévia. Não foi validado som em dispositivo físico.
