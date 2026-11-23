begin;

-- Categorias vazias que vieram do catalogo legado nao representam cadastro do usuario.
-- A versao 1 indica que o catalogo ainda nao foi salvo pela tela nova.
do $$
declare
  versao_atual integer;
  removidas integer := 0;
  servicos_demonstracao integer;
begin
  select versao into versao_atual
  from public.servicos_catalogo_versao
  where id = true
  for update;

  if versao_atual = 1 then
    delete from public.servicos
    where id in (
      'svc-diagnostico', 'svc-bateria', 'svc-pastilha', 'svc-carburador',
      'svc-revisao', 'svc-oleo', 'svc-balanceamento', 'svc-corrente'
    );
    get diagnostics servicos_demonstracao = row_count;

    delete from public.categorias_servico categoria
    where not exists (
      select 1
      from public.servicos servico
      where servico.categoria_id = categoria.id
    );

    get diagnostics removidas = row_count;
    if removidas + servicos_demonstracao > 0 then
      update public.servicos_catalogo_versao
      set versao = versao + 1, atualizado_em = now()
      where id = true;
    end if;
  end if;
end $$;

-- A API assina mudancas da revisao e envia o evento aos navegadores conectados.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'servicos_catalogo_versao'
    ) then
    alter publication supabase_realtime add table public.servicos_catalogo_versao;
  end if;
end $$;

commit;
