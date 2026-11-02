# Funcionários

Implementação dos frames `funcionario` (491:2), `overview-funcio` (491:437), `funcionario-OS` (491:933) e `funcionario-personal-date` (491:1320) do Figma PERC 3, arquivo aO7jOc6mvzBMmq1G8UE1Th.

Acesse **Funcionários** no menu ou `/funcionarios`. O perfil possui visão geral, desempenho, ordens e dados pessoais. Listas têm busca, filtros, paginação e exportação CSV. Os detalhes das OS reutilizam a página existente.

## Dados e acesso

A migration autorizada `20261031013632_dados_funcionarios.sql` foi aplicada no projeto estacao-motos. Acrescenta seis campos em funcionario e cria funcionario_documento e funcionario_nota. Os cinco registros anteriores mantiveram seus dados originais; situação anterior desconhecida continua como Não informado. Novos cadastros recebem situação Ativo.

As rotas `/api/employees` passam pela autenticação e autorização administrativa existente. O navegador usa a API do servidor; não recebe chave service_role. As duas tabelas novas têm RLS e acesso revogado a anon/authenticated. Notas identificam o administrador autor. A foto reutiliza o bucket privado admin-avatars e o caminho de foto existente da conta.

Os documentos guardam tipo, número e validade; o download exporta os dados em CSV, sem anexo de arquivo. Há até 100 documentos e 100 notas por consulta. Para evitar indicadores fictícios, campos ainda não cadastrados e índice de retrabalho aparecem como não informados. Totais mensais usam data de entrada e situação atual; não representam histórico de transições. Peças e cancelamentos são contados separadamente.

Cargo, e-mail e permissões de login não são alterados nesta tela. A situação funcional não bloqueia autenticação. O botão Bloquear acesso fica desabilitado; recuperação de senha reutiliza o fluxo do admin para administradores. Outros perfis continuam com recuperação pelo aplicativo correspondente.

## Implementação e verificação

As telas e o perfil são carregados sob demanda, com componentes compartilhados, fonte e ícones locais. Gráficos usam SVG/CSS sem biblioteca adicional. Consultas de funcionários e ordens são paginadas no servidor, agrupadas por funcionário, e os relacionamentos são consultados em lotes.

Validação: `npm.cmd run build` na raiz e `npm.cmd --prefix server run test:employees`. Os testes verificam indicadores por mês e rejeição de leitura/escrita sem sessão. A revisão visual utilizou fixtures isoladas, sem gravar dados de teste no Supabase, nas larguras 1920 e 390 px. Capturas estão na pasta local ignorada `.verificacao`.
