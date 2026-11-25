begin;
set local lock_timeout = '10s';

-- The API authorizes the administrator before reading appointments.
grant select on public.agendamento to service_role;

notify pgrst,'reload schema';
commit;
