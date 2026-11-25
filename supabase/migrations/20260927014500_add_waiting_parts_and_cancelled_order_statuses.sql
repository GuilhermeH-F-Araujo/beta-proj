-- Amplia os estados sem alterar as OS existentes nem reinterpretar "pronto".
alter table public.ordem_servico drop constraint check_status_os;
alter table public.ordem_servico add constraint check_status_os
  check (status in ('aguardando', 'em andamento', 'aguardando peça', 'pronto', 'entregue', 'cancelada'));
