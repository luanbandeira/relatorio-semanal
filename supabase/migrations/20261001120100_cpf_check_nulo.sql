-- Correção da migration anterior: app.cpf_valido(null) devolve false, então a
-- restrição ainda barrava contas sem CPF. CPF ausente passa; presente é validado.
alter table public.profiles drop constraint profiles_cpf_check;
alter table public.profiles add constraint profiles_cpf_check check (cpf is null or app.cpf_valido(cpf));
