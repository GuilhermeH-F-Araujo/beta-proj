# Backups externos do banco

O painel usa GitHub Actions para exportar o banco Supabase, criptografar cada arquivo com `age` e guardar os arquivos como artifacts em um repositorio privado. A rotina automatica roda diariamente as 02:37 no horario de Sao Paulo; a frequencia e a retencao escolhidas no painel sao lidas pelo workflow. Tambem e possivel solicitar uma execucao manual pelo painel.

## Preparar o repositorio privado

1. Publique este projeto em um repositorio **privado** no GitHub. O workflow falha antes da exportacao se o repositorio for publico.
2. Na pasta raiz do projeto, gere uma chave `age` em um computador confiavel:

   ```sh
   age-keygen -o backup-age-key.txt
   ```

3. Mantenha `backup-age-key.txt` fora do repositorio, fora do Render e em um local seguro. Guarde a chave publica indicada como `# public key:`.
4. Em **Settings > Secrets and variables > Actions**, crie os secrets:
   - `SUPABASE_DB_URL`: string do **Session pooler** obtida no botao Connect do Supabase, com a senha do banco. Use a porta indicada pelo Supabase.
   - `BACKUP_AGE_RECIPIENT`: a chave publica `age1...` gerada no passo anterior.
5. Em **Settings > Secrets and variables > Actions > Variables**, crie:
   - `BACKUP_RETENTION_DAYS`: `30` (o painel pode alterar para 15, 30 ou 90).
   - `BACKUP_FREQUENCY`: `diario` (o painel pode alterar para diario, semanal ou mensal).
6. No Render, configure:
   - `GITHUB_BACKUP_REPOSITORY`: `usuario/repositorio`.
   - `GITHUB_BACKUP_TOKEN`: token fine-grained limitado a esse repositorio, com permissoes `Actions: write`, `Variables: read/write` e `Secrets: read`.
   - `GITHUB_BACKUP_BRANCH`: branch padrao do repositorio, normalmente `main`.
7. Reinicie o servico do Render e abra **Configurações > Segurança e controle de acesso > Backups do banco**. O dono da oficina pode alterar a frequencia, escolher a retencao e executar um backup manual; as alteracoes pedem senha e Google Authenticator.

O painel guarda o token do GitHub somente no servidor. O workflow envia somente os arquivos criptografados. Cada backup inclui roles, schema e dados do banco. A retencao configurada e um prazo maximo: para manter margem no plano gratuito, o workflow reserva 400 MiB para os backups e remove os artifacts mais antigos se precisar de espaco. O GitHub Free inclui 500 MB compartilhados entre artifacts do Actions e GitHub Packages; o restante fica como margem para outros artifacts. Configure tambem um orcamento de Actions que interrompa gastos extras na conta GitHub.

O workflow automatico verifica diariamente a frequencia escolhida, por isso backups semanais e mensais tambem seguem esse agendador. O GitHub pode atrasar execucoes agendadas em periodos de alta demanda.

## Baixar e restaurar

No repositorio privado, abra **Actions > Backup do banco Supabase**, selecione a execucao e baixe o artifact. Em um computador confiavel, use a chave privada para descriptografar:

```sh
age -d -i backup-age-key.txt -o roles.sql roles.sql.age
age -d -i backup-age-key.txt -o schema.sql schema.sql.age
age -d -i backup-age-key.txt -o data.sql data.sql.age
```

Confira o arquivo `SHA256SUMS` antes de usar. Teste a restauracao em um projeto Supabase separado antes de substituir dados de producao. O procedimento oficial usa `psql` para restaurar roles, schema e dados; confirme as permissões e a versao do Postgres no destino antes de executar.

## Limites

O plano gratuito do Supabase nao cria snapshots automaticos. O `supabase db dump` e a recomendacao oficial para exportacao manual/off-site no plano gratuito. O CLI exclui schemas administrados pelo Supabase, como `auth` e `storage`; os objetos do Storage tambem nao ficam dentro do dump do banco. Este mecanismo protege os dados e objetos do schema da aplicacao, mas nao substitui a exportacao de arquivos do Storage nem uma estrategia de recuperacao de contas Auth.

Os artifacts sao externos ao Supabase, criptografados antes do envio e acessiveis a quem tem acesso ao repositorio privado. A retencao maxima exposta no painel e 90 dias; o artifact e apagado automaticamente pelo GitHub ao vencer esse prazo. O agendador do GitHub pode atrasar execucoes em periodos de alta demanda.
