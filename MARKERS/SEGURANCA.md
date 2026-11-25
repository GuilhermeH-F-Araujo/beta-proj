# Seguranca

## Rotas e confirmacao
- O Express casa rotas sem diferenciar maiusculas e aceita barras extras. `rotaNormalizada` aplica a mesma forma em `exigeConfirmacao`, `protegerOperacao` e `permitirRequisicao`, para que `/api/Employees/1/access` tambem peca a confirmacao de senha.
- Limites por IP: API 600/min, login 30/min, recuperacao e redefinicao de senha 10/15 min, confirmacao administrativa 30/15 min. Os contadores ficam na memoria de cada instancia.
- Corpo JSON limitado a 1 MB. Somente `/api/orders`, `/api/clients`, `/api/employees`, `/api/admin/profile/photo` e `/api/admin/preferences` aceitam ate 10 MB, porque recebem fotos ou sons em base64.
- O Swagger em `/documentacao/` fica fora do ar em producao, a menos que `DOCUMENTACAO_PUBLICA=true`.

## Sessao
- A checagem de conta bloqueada fica em cache por 30 segundos por usuario. Bloquear pelo painel limpa o cache na hora nesta instancia.

## Supabase
Aplicado em `supabase/migrations/20261125042000_endurecimento_e_indices.sql`:
- funcoes de gatilho `rls_auto_enable` e `criar_cliente_ao_cadastrar` sem EXECUTE para anon e authenticated;
- search_path fixo em seis funcoes;
- 22 indices para chaves estrangeiras.

Pendente no painel: ativar a protecao contra senhas vazadas em Authentication.

Tabelas com RLS sem politicas bloqueiam a API publica por desenho; o backend usa a chave de servico. As funcoes chamadas pelos aplicativos conferem `mecanico_atual_id()` ou `mecanico_e_dono_os()`.

## Recomendacoes abertas
- CSP completa (`default-src`, `script-src`) depois de testar no navegador.
- Limites e caches distribuidos se o Render usar mais de uma instancia.
- Nunca cole o `.env` em conversas ou chamados; troque tokens expostos.
