begin;
do $$
declare usuario uuid; quantidade integer;
begin
  select count(*), (array_agg(f.auth_user_id))[1] into quantidade,usuario
    from public.funcionario f join auth.users u on u.id=f.auth_user_id
    where lower(f.email)='ednalourdes74@gmail.com' and lower(u.email)='ednalourdes74@gmail.com'
      and f.cargo='Administrador' and f.perfil_acesso='Administrador'
      and coalesce(f.situacao,'ativo')='ativo';
  if quantidade<>1 then raise exception 'A conta de dono deve corresponder a um único administrador ativo.'; end if;
  insert into public.admin_autoridade(id_usuario,nivel) values(usuario,'dono')
    on conflict(id_usuario) do update set nivel='dono';
  insert into public.seguranca_auditoria(id_usuario,alvo,evento) values(usuario,usuario,'dono_definido');
end $$;
commit;
