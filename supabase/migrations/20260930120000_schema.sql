-- Relatório Semanal — esquema base
-- Valores monetários em centavos inteiros (bigint). Datas de ocorrência em `date`
-- no calendário America/Sao_Paulo; horários de auditoria em timestamptz.

create schema if not exists app;
revoke all on schema app from public;

-- Funções novas não ficam executáveis por anon/public por padrão.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema app revoke execute on functions from public;

create type public.user_role as enum ('funcionario', 'visualizador', 'gestor', 'admin');
create type public.avatar_kind as enum ('masculino', 'feminino', 'neutro');
create type public.expense_group as enum ('percurso', 'outras');
create type public.week_status as enum ('aberta', 'acertada');

-- ---------------------------------------------------------------------------
-- Utilitários puros
-- ---------------------------------------------------------------------------

create or replace function app.cpf_valido(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
  s int;
  r int;
  i int;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' then
    return false;
  end if;
  if p_cpf ~ '^(.)\1{10}$' then
    return false;
  end if;
  for i in 1..11 loop
    d[i] := substr(p_cpf, i, 1)::int;
  end loop;
  s := 0;
  for i in 1..9 loop
    s := s + d[i] * (11 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop
    s := s + d[i] * (12 - i);
  end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

-- Segunda-feira da semana que contém a data.
create or replace function app.week_start(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select p_date - (extract(isodow from p_date)::int - 1);
$$;

create or replace function app.today_local()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.app_settings (key, value) values
  ('data_inicio_operacao', to_jsonb('2026-01-01'::text)),
  ('anexos_max_por_despesa', to_jsonb(5)),
  ('anexos_max_bytes', to_jsonb(10485760)),
  ('suporte_duracao_minutos', to_jsonb(30)),
  ('senha_temporaria_validade_horas', to_jsonb(72));

create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  cpf text not null unique check (app.cpf_valido(cpf)),
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  role public.user_role not null default 'funcionario',
  active boolean not null default true,
  avatar public.avatar_kind not null default 'neutro',
  photo_path text,
  must_change_password boolean not null default true,
  temp_password_expires_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 60),
  grupo public.expense_group not null,
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index categories_name_uq on public.categories (lower(btrim(name)));

create table public.employee_weeks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id),
  week_start date not null check (extract(isodow from week_start) = 1),
  status public.week_status not null default 'aberta',
  -- Incrementada a cada alteração de lançamento; serve de trava de linha e de
  -- controle otimista no acerto.
  version int not null default 1,
  settled_at timestamptz,
  settled_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (employee_id, week_start)
);
create index employee_weeks_employee_idx on public.employee_weeks (employee_id, week_start desc);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.employee_weeks (id),
  employee_id uuid not null references public.profiles (id),
  occurred_on date not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 10000000),
  category_id uuid not null references public.categories (id),
  grupo public.expense_group not null,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  km numeric(8, 1) check (km is null or km >= 0),
  origem text check (origem is null or char_length(origem) <= 120),
  destino text check (destino is null or char_length(destino) <= 120),
  clientes text check (clientes is null or char_length(clientes) <= 500),
  has_receipt boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
create index expenses_week_idx on public.expenses (week_id) where deleted_at is null;
create index expenses_employee_date_idx on public.expenses (employee_id, occurred_on) where deleted_at is null;
create index expenses_category_idx on public.expenses (category_id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.employee_weeks (id),
  employee_id uuid not null references public.profiles (id),
  received_on date not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 10000000),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
create index receipts_week_idx on public.receipts (week_id) where deleted_at is null;
create index receipts_employee_date_idx on public.receipts (employee_id, received_on) where deleted_at is null;

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.employee_weeks (id),
  employee_id uuid not null references public.profiles (id),
  occurred_on date not null,
  origem text not null check (char_length(btrim(origem)) between 1 and 120),
  destino text not null check (char_length(btrim(destino)) between 1 and 120),
  km numeric(8, 1) check (km is null or km >= 0),
  clientes text check (clientes is null or char_length(clientes) <= 500),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
create index routes_week_idx on public.routes (week_id) where deleted_at is null;
create index routes_employee_date_idx on public.routes (employee_id, occurred_on) where deleted_at is null;

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id),
  week_id uuid not null references public.employee_weeks (id),
  employee_id uuid not null references public.profiles (id),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  original_name text check (original_name is null or char_length(original_name) <= 200),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id)
);
create index attachments_expense_idx on public.attachments (expense_id) where deleted_at is null;

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.employee_weeks (id),
  employee_id uuid not null references public.profiles (id),
  week_start date not null,
  credit_before_cents bigint not null,
  received_cents bigint not null,
  spent_cents bigint not null,
  balance_cents bigint not null check (balance_cents >= 0),
  settled_by uuid not null references public.profiles (id),
  settled_at timestamptz not null default now(),
  valid boolean not null default true,
  invalidated_at timestamptz,
  invalidated_by uuid references public.profiles (id),
  invalidation_reason text,
  check (balance_cents = credit_before_cents + received_cents - spent_cents)
);
create unique index settlements_one_valid_per_week on public.settlements (week_id) where valid;
create index settlements_employee_idx on public.settlements (employee_id, week_start desc) where valid;

create table public.support_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id),
  employee_id uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);
create index support_sessions_admin_idx on public.support_sessions (admin_id, started_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  employee_id uuid,
  support_session_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  reason text,
  old_data jsonb,
  new_data jsonb
);
create index audit_events_employee_idx on public.audit_events (employee_id, occurred_at desc);
create index audit_events_entity_idx on public.audit_events (entity, entity_id);

create table public.login_attempts (
  id bigint generated always as identity primary key,
  username text not null,
  ip text,
  success boolean not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_username_idx on public.login_attempts (username, attempted_at desc);
create index login_attempts_ip_idx on public.login_attempts (ip, attempted_at desc);

-- Solicitações idempotentes de operações administrativas (acerto/reabertura).
-- Lançamentos usam o próprio id gerado no cliente como chave de deduplicação.

-- ---------------------------------------------------------------------------
-- Categorias iniciais
-- ---------------------------------------------------------------------------

insert into public.categories (name, grupo, sort_order) values
  ('Combustível', 'percurso', 10),
  ('Transporte e passagem', 'percurso', 20),
  ('Alimentação', 'outras', 30),
  ('Hospedagem', 'outras', 40),
  ('Estacionamento e pedágio', 'percurso', 50),
  ('Manutenção', 'percurso', 60),
  ('Impressão', 'outras', 70),
  ('Outros', 'outras', 80);
