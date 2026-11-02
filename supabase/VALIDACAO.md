# Verificações locais — 30/10/2026

## Executado

- Compilação TypeScript do servidor.
- Compilação TypeScript e build Vite do painel.
- Teste PostgreSQL em memória (PGlite 0.3.14), aplicando as 25 migrations em ordem.
- Os 7 testes existentes de URL/origem do cliente passaram.

O teste scripts/verificar-tabelas.mjs valida:

| Caso | Evidência |
| --- | --- |
| Preservação de dados | Comparação completa, coluna por coluna, de avisos, histórico de cliente e todos os estados da fila antes/depois, usando a tradução definida. |
| Unificação | Auditoria ligada por audit_id vira um evento com auditoria integral em JSON. Dois eventos com mesmo texto/data sem vínculo continuam distintos. |
| OS excluída | Eventos com id_os inexistente permanecem acessíveis no banco. A exclusão administrativa não apaga o histórico. |
| Backup | Texto legado preservado privadamente e ausente do histórico operacional. |
| Autor | Autor nulo preservado; alteração direta com auth.uid() do mecânico registra esse UUID. |
| OS | Criação pela RPC existente, consulta SQL, edição, cancelamento com justificativa e exclusão com motivo. |
| Cancelamento | Tentativa sem motivo é rejeitada; com motivo gera uma única nova transição. |
| Edição | Apenas o cliente da OS é alterado; outro cadastro fica intacto. |
| Arquivamento | Nome e motivo antigos preservados; novos registros usam arquivar e mantêm vínculos de cliente/moto/OS. |
| Avisos | Leitura de um administrador não cria leitura para o outro; FKs e cascata de leitura continuam funcionando. |
| Miniaturas | Estados traduzidos; reserva não entrega trabalho já reservado; retomada após prazo; token antigo rejeitado; cota, retentativa, revisão e reconciliação exercitadas. |
| Pagamento | Registro existente continua funcionando, sem mudar esquema ou grants. |
| Permissões | RLS ativo, tabelas administrativas fechadas para anon/authenticated; RPCs novas restritas ao service_role; recuperacao inacessível a essas três roles. |
| Escopo | Colunas e grants das entidades principais e pagamento, e conteúdo dos buckets, iguais antes/depois. |
| Retirada | Dependência externa e audit_id incompatível bloqueiam a transação, sem renomeações parciais. A conferência de conteúdo e contagens ocorre dentro da mesma transação. |

## Reprodução

```powershell
npm ci --prefix server
npm ci --prefix client
npm run build
npm install --prefix .verificacao --no-package-lock @electric-sql/pglite@0.3.14
node scripts/verificar-tabelas.mjs
node --test server/scripts/url-cliente.test.mjs
```

.verificacao é ignorada pelo Git e contém apenas o runtime local de verificação.
O teste não lê credenciais nem conecta ao banco remoto.
O script inspecao.sql também foi executado na fixture para validar sua sintaxe
e confirmar que seu levantamento não depende de operações de escrita.

## Limites

O esquema mínimo das entidades preexistentes é uma fixture. O teste usa
PostgreSQL real em WebAssembly, mas não instancia Supabase Auth, PostgREST,
Storage ou os provedores de imagem. Login real, políticas específicas do banco
compartilhado, geração de imagens e interação no navegador não foram validados
de ponta a ponta. A aprovação da fila foi verificada como transição no banco;
upload e aprovação de arquivos no Storage não foram executados.

A transição foi aplicada no banco real após backup e autorização. O backup das
nove tabelas foi restaurado localmente e submetido à migration atômica; a comparação
de todas as linhas e colunas passou. Depois da aplicação, a comparação no banco
real também passou: nove tabelas do escopo preservadas, 17 tabelas externas sem
alteração de conteúdo/metadados e 79 funções externas sem alteração de corpo/ACL.
RLS, permissões das sete RPCs novas e ausência de referências antigas conferidos.
As dependências compartilhadas autorizadas e os resultados estão em EXECUCAO.md.

Para repetir o ensaio com o backup privado:

```powershell
node scripts/verificar-banco-real.mjs .verificacao/backups/20261030
```
