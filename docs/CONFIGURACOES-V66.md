# Configurações — versão 66

## O que foi concluído

- Notificações têm aba própria e não ficam em Preferências.
- Nove eventos persistidos no banco: novo cliente, cliente atualizado, nova OS, OS atualizada, mudança de andamento, aguardando peça, pronta para entrega, entregue e cancelada.
- Cada evento tem escolha de exibição no painel, som e toque específico ou padrão.
- Som geral, volume, prévia, horário de silêncio (inclusive atravessando meia-noite) e áudio próprio. Os sons começam desligados; nova OS, pronta e cancelada vêm pré-selecionadas como importantes.
- Escolhas de notificação e arquivos de áudio separados por conta neste navegador. Não são sincronizados entre computadores. Limpar os dados do navegador remove essas escolhas.
- Segurança: alteração real de senha com confirmação da senha atual; saída por inatividade configurável (10, 20, 30 ou 60 minutos; pode desligar), aviso um minuto antes; atividade de outras abas da mesma conta é considerada; consulta dos históricos de OS e clientes arquivados, filtros e CSV.
- Integrações: verificação real e individual de quatro consultas do servidor; terminais Stone e Rede claramente identificados como operação manual, com orientações em modal; atalho para configurar notificações. Não há integração de cobrança automática nem WhatsApp.
- Sobre: identidade do produto, versão, dados da instalação, relatório técnico sem dados pessoais, atalhos de acessibilidade/avisos e perguntas frequentes.
- Telas novas usam componentes compartilhados de cards, cabeçalhos e diálogos. O seletor do projeto foi reaproveitado e corrigido para funcionar dentro de diálogos nativos.

## Banco e implantação

A migração `20261107222601_notificacoes_configuraveis.sql` já foi aplicada ao projeto Estação Motos conectado durante este trabalho. Ela está incluída no ZIP para histórico e instalações novas. Não é necessário reaplicar as migrações antigas nesse banco.

Ela amplia os eventos e inclui a referência ao cliente, sem apagar avisos anteriores. Atualizações sem mudança de dados não geram avisos. Alterações de vínculo de autenticação e arquivamento de cliente não geram o aviso genérico de edição. Os eventos novos de cliente não copiam CPF, e-mail, endereço ou telefone para a mensagem.

A implantação no Render exige publicar o novo cliente e o novo servidor juntos. Não há variáveis de ambiente novas. Preserve as variáveis de ambiente já configuradas. O comando de construção continua sendo `npm run build:render`; o de inicialização, `npm start`.

Em outro banco, aplique primeiro a migração nova e depois publique o servidor. A coluna de referência ao cliente é usada pela API de notificações.

## Segurança dos sons

Extensão, tipo declarado, tamanho e duração de metadados são validados antes da decodificação. A decodificação final verifica duração (0,25 a 8 segundos), canais (até dois) e frequência de amostragem. O áudio aceito é reconstruído como PCM WAV, sem conservar metadados do arquivo original, e fica no IndexedDB local da conta. O arquivo não é enviado a um serviço externo. O limite de entrada é 1,5 MB.

Avisos antigos não tocam ao abrir o sistema. Um lote novo toca uma vez, com intervalo mínimo entre toques. O horário de silêncio e volume zero são respeitados. Mudar as preferências não dispara novas consultas a cada movimento do slider.

O navegador pode bloquear reprodução automática até haver interação com a página. “Ouvir som” permite testar o dispositivo e a reprodução. O volume do computador também afeta o resultado.

## Verificações executadas

- Construção de produção completa de servidor e cliente, via `npm run build:render`.
- 11 testes automatizados de API e regras, via `npm --prefix server run test:settings`: autorização administrativa, diagnóstico parcial, validação de filtros, união/ordenação de históricos, falhas de consulta, nove eventos configuráveis, isolamento por conta, silêncio atravessando meia-noite, regras sonoras, dados salvos inválidos e rejeição de arquivos inadequados antes da decodificação.
- Teste de integração no banco: os nove tipos de evento foram gerados por triggers em tabelas temporárias, sem mudanças nos cadastros reais. A transação foi revertida ao final; nenhum aviso de teste foi mantido. Atualização sem mudança não criou aviso.
- Conferência de permissões: RLS preservada; anon e authenticated sem leitura direta dos avisos; servidor autorizado a ler a nova referência; funções internas não executáveis por anon/authenticated.
- Integridade e conteúdo do ZIP completo.

A inspeção visual e os testes de interação no navegador não puderam ser concluídos: a infraestrutura de prévia retornou falha de conexão/relay. As verificações de construção, regras, API e banco acima foram executadas; não se deve confundir isso com aprovação visual do layout. A importação e reprodução real de arquivos no navegador ainda dependem dessa validação visual/funcional.

## Referências aplicadas

Os padrões de configuração seguem as orientações de [Switches do MUI](https://mui.com/material-ui/react-switch/), [Sliders do MUI](https://mui.com/material-ui/react-slider/) e [acessibilidade do Radix](https://www.radix-ui.com/primitives/docs/overview/accessibility): controles com rótulos explícitos, estado programático, interação por teclado e prévia dos valores. Os componentes existentes do projeto foram preservados e estendidos, sem adicionar MUI ou Radix como dependências.

## Limite da revisão de segurança

A verificação das alterações não representa uma auditoria integral do banco. O verificador do projeto também retornou avisos em funções públicas antigas e sobre proteção contra senhas vazadas. Eles não foram alterados neste trabalho, pois são usados por outros fluxos do projeto e exigem revisão própria. Referências: [privilégios de funções SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable) e [senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
