-- Permite ao backend administrativo exibir a quilometragem cadastrada da moto.
grant select (quilometragem) on table public.moto to service_role;
