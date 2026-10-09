-- Autorização, RLS, auditoria e bloqueio de semanas acertadas.
--
-- Modelo: leitura via RLS (políticas somente de SELECT); escrita exclusivamente
-- por funções RPC (security definer) que validam papel, conta ativa e estado da
-- semana. Os papéis anon/authenticated não têm INSERT/UPDATE/DELETE em nenhuma
-- tabela; gatilhos repetem as verificações críticas como segunda barreira.

-- ---------------------------------------------------------------------------
-- Identidade do chamador (consultada a cada requisição, sem cache de sessão)
-- ---------------------------------------------------------------------------

-- Papel do usuário autenticado se a conta estiver ativa; null caso contrário.
create or replace function app.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.active;
$$;

create or replace function app.is_admin_reader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.current_role() in ('visualizador', 'gestor', 'admin'), false);
$$;

-- Pode consultar dados operacionais do funcionário informado?
create or replace function app.can_read_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case app.current_role()
    when 'funcionario' then p_employee_id = auth.uid()
    when 'admin' then true
    when 'gestor' then true
    when 'visualizador' then exists (
      select 1 from public.profiles t
      where t.id = p_employee_id and t.active and t.role = 'funcionario'
    )
    else false
  end;
$$;

-- Exige conta ativa e devolve o papel.
create or replace function app.require_active()
returns public.user_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  v_role := app.current_role();
  if v_role is null then
    raise exception 'NAO_AUTENTICADO' using errcode = 'P0001';
  end if;
  return v_role;
end;
$$;

-- Registra no contexto da transação o motivo e a sessão de suporte, lidos pelos
-- gatilhos de auditoria.
create or replace function app.set_audit_context(p_reason text, p_support_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.reason', coalesce(p_reason, ''), true);
  perform set_config('app.support_session', coalesce(p_support_session::text, ''), true);
end;
$$;

-- Valida permissão de escrita em lançamentos do funcionário.
-- Funcionário: somente os próprios. Administrador: qualquer funcionário (exceção
-- autorizada e auditada), opcionalmente dentro de uma sessão de suporte.
create or replace function app.require_entry_writer(p_employee_id uuid, p_support_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := app.require_active();
  v_target public.user_role;
begin
  select role into v_target from public.profiles where id = p_employee_id;
  if v_target is distinct from 'funcionario' then
    raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001';
  end if;

  if v_role = 'funcionario' then
    if p_employee_id <> auth.uid() then
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
    if p_support_session is not null then
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
  elsif v_role = 'admin' then
    if p_support_session is not null and not exists (
      select 1 from public.support_sessions s
      where s.id = p_support_session
        and s.admin_id = auth.uid()
        and s.employee_id = p_employee_id
        and s.ended_at is null
        and s.expires_at > now()
    ) then
      raise exception 'SUPORTE_EXPIRADO' using errcode = 'P0001';
    end if;
  else
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;

  perform set_config('app.support_session', coalesce(p_support_session::text, ''), true);
end;
$$;

create or replace function app.setting_date(p_key text)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::date from public.app_settings where key = p_key;
$$;

create or replace function app.setting_int(p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::int from public.app_settings where key = p_key;
$$;

-- Datas aceitas para lançamentos: a partir do início da operação e até o fim
-- da semana atual (America/Sao_Paulo).
create or replace function app.require_valid_date(p_date date)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_date is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = 'P0001';
  end if;
  if p_date < app.setting_date('data_inicio_operacao') then
    raise exception 'DATA_ANTES_INICIO' using errcode = 'P0001';
  end if;
  if p_date > app.week_start(app.today_local()) + 6 then
    raise exception 'DATA_FUTURA' using errcode = 'P0001';
  end if;
end;
$$;

-- Obtém (ou cria) a semana do funcionário que contém a data.
create or replace function app.ensure_week(p_employee_id uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date := app.week_start(p_date);
  v_id uuid;
begin
  insert into public.employee_weeks (employee_id, week_start)
  values (p_employee_id, v_start)
  on conflict (employee_id, week_start) do nothing;

  select id into v_id
  from public.employee_weeks
  where employee_id = p_employee_id and week_start = v_start;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();
create trigger categories_touch before update on public.categories
  for each row execute function app.touch_updated_at();
create trigger expenses_touch before update on public.expenses
  for each row execute function app.touch_updated_at();
create trigger receipts_touch before update on public.receipts
  for each row execute function app.touch_updated_at();
create trigger routes_touch before update on public.routes
  for each row execute function app.touch_updated_at();

-- Bloqueia alterações em lançamentos de semana acertada. O UPDATE em
-- employee_weeks adquire trava de linha: um acerto concorrente (SELECT ... FOR
-- UPDATE na mesma semana) espera ou é esperado, de modo que nenhum lançamento
-- escapa da validação do acerto.
create or replace function app.guard_week_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.week_status;
  v_week uuid;
  v_emp uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.employee_weeks set version = version + 1
    where id = old.week_id
    returning status into v_status;
    if v_status <> 'aberta' then
      raise exception 'SEMANA_ACERTADA' using errcode = 'P0001';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if tg_op = 'INSERT' or new.week_id <> old.week_id then
      update public.employee_weeks set version = version + 1
      where id = new.week_id
      returning status, employee_id into v_status, v_emp;
      if v_status <> 'aberta' then
        raise exception 'SEMANA_ACERTADA' using errcode = 'P0001';
      end if;
      if v_emp <> new.employee_id then
        raise exception 'SEMANA_INVALIDA' using errcode = 'P0001';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.employee_id <> old.employee_id then
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
    return new;
  end if;
  return old;
end;
$$;

create trigger expenses_guard before insert or update or delete on public.expenses
  for each row execute function app.guard_week_open();
create trigger receipts_guard before insert or update or delete on public.receipts
  for each row execute function app.guard_week_open();
create trigger routes_guard before insert or update or delete on public.routes
  for each row execute function app.guard_week_open();
create trigger attachments_guard before insert or update or delete on public.attachments
  for each row execute function app.guard_week_open();

-- Auditoria genérica: ator real (auth.uid()), funcionário afetado, ação,
-- motivo, sessão de suporte e valores anteriores/posteriores.
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_action text;
  v_employee uuid;
  v_reason text := nullif(current_setting('app.reason', true), '');
  v_support text := nullif(current_setting('app.support_session', true), '');
begin
  if tg_table_name = 'employee_weeks' and tg_op = 'UPDATE'
     and old.status is not distinct from new.status then
    return null; -- incremento de versão apenas
  end if;

  v_action := case tg_op
    when 'INSERT' then 'criado'
    when 'DELETE' then 'removido'
    else case
      when (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then 'excluido'
      when tg_table_name = 'employee_weeks' then 'status_' || (v_new ->> 'status')
      when tg_table_name = 'settlements' and (v_new ->> 'valid') = 'false' then 'acerto_invalidado'
      else 'alterado'
    end
  end;

  v_employee := case tg_table_name
    when 'profiles' then (v_row ->> 'id')::uuid
    when 'categories' then null
    when 'app_settings' then null
    else (v_row ->> 'employee_id')::uuid
  end;

  insert into public.audit_events
    (actor_id, employee_id, support_session_id, entity, entity_id, action, reason, old_data, new_data)
  values (
    -- Operações de serviço (sem JWT de usuário) informam o ator em app.actor.
    coalesce(auth.uid(), nullif(current_setting('app.actor', true), '')::uuid),
    v_employee,
    v_support::uuid,
    tg_table_name,
    case when tg_table_name = 'app_settings' then null else (v_row ->> 'id')::uuid end,
    v_action,
    v_reason,
    v_old,
    v_new
  );
  return null;
end;
$$;

create trigger profiles_audit after insert or update or delete on public.profiles
  for each row execute function app.audit_row();
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function app.audit_row();
create trigger employee_weeks_audit after update on public.employee_weeks
  for each row execute function app.audit_row();
create trigger expenses_audit after insert or update or delete on public.expenses
  for each row execute function app.audit_row();
create trigger receipts_audit after insert or update or delete on public.receipts
  for each row execute function app.audit_row();
create trigger routes_audit after insert or update or delete on public.routes
  for each row execute function app.audit_row();
create trigger attachments_audit after insert or update or delete on public.attachments
  for each row execute function app.audit_row();
create trigger settlements_audit after insert or update on public.settlements
  for each row execute function app.audit_row();
create trigger app_settings_audit after insert or update on public.app_settings
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema app to authenticated, service_role;
grant execute on function app.current_role() to authenticated;
grant execute on function app.is_admin_reader() to authenticated;
grant execute on function app.can_read_employee(uuid) to authenticated;
grant execute on function app.week_start(date) to authenticated;
grant execute on function app.today_local() to authenticated;

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.employee_weeks enable row level security;
alter table public.expenses enable row level security;
alter table public.receipts enable row level security;
alter table public.routes enable row level security;
alter table public.attachments enable row level security;
alter table public.settlements enable row level security;
alter table public.support_sessions enable row level security;
alter table public.audit_events enable row level security;
alter table public.login_attempts enable row level security;

-- profiles: CPF fica fora da concessão de colunas (somente o Administrador o obtém
-- por função dedicada).
grant select (id, full_name, username, role, active, avatar, photo_path,
  must_change_password, deactivated_at, created_at, updated_at)
  on public.profiles to authenticated;

create policy profiles_select on public.profiles for select to authenticated
using (
  (id = auth.uid() and active)
  or app.current_role() = 'admin'
  or (app.current_role() = 'gestor' and role = 'funcionario')
  or (app.current_role() = 'visualizador' and role = 'funcionario' and active)
);

grant select on public.app_settings to authenticated;
create policy app_settings_select on public.app_settings for select to authenticated
using (app.current_role() is not null);

grant select on public.categories to authenticated;
create policy categories_select on public.categories for select to authenticated
using (app.current_role() is not null);

grant select on public.employee_weeks to authenticated;
create policy employee_weeks_select on public.employee_weeks for select to authenticated
using (app.can_read_employee(employee_id));

grant select on public.expenses to authenticated;
create policy expenses_select on public.expenses for select to authenticated
using (deleted_at is null and app.can_read_employee(employee_id));

grant select on public.receipts to authenticated;
create policy receipts_select on public.receipts for select to authenticated
using (deleted_at is null and app.can_read_employee(employee_id));

grant select on public.routes to authenticated;
create policy routes_select on public.routes for select to authenticated
using (deleted_at is null and app.can_read_employee(employee_id));

grant select on public.attachments to authenticated;
create policy attachments_select on public.attachments for select to authenticated
using (deleted_at is null and app.can_read_employee(employee_id));

-- Saldos, crédito e acerto: somente administração.
grant select on public.settlements to authenticated;
create policy settlements_select on public.settlements for select to authenticated
using (app.is_admin_reader() and app.can_read_employee(employee_id));

grant select on public.support_sessions to authenticated;
create policy support_sessions_select on public.support_sessions for select to authenticated
using (app.current_role() = 'admin' and admin_id = auth.uid());

grant select on public.audit_events to authenticated;
create policy audit_events_select on public.audit_events for select to authenticated
using (app.current_role() = 'admin');

-- login_attempts: sem acesso para anon/authenticated (apenas service_role).
