-- Funções RPC: único caminho de escrita para usuários autenticados.
-- Erros de regra usam SQLSTATE P0001 com mensagem-código (ex.: SEMANA_ACERTADA),
-- traduzida para português na aplicação.

-- ---------------------------------------------------------------------------
-- Despesas
-- ---------------------------------------------------------------------------

create or replace function public.save_expense(
  p_id uuid,
  p_employee_id uuid,
  p_occurred_on date,
  p_amount_cents bigint,
  p_category_id uuid,
  p_description text,
  p_grupo public.expense_group default null,
  p_km numeric default null,
  p_origem text default null,
  p_destino text default null,
  p_clientes text default null,
  p_has_receipt boolean default false,
  p_support_session uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat public.categories;
  v_existing public.expenses;
  v_week uuid;
  v_inserted int;
begin
  perform app.require_entry_writer(p_employee_id, p_support_session);
  perform app.require_valid_date(p_occurred_on);
  if p_id is null then
    raise exception 'ID_OBRIGATORIO' using errcode = 'P0001';
  end if;

  select * into v_cat from public.categories where id = p_category_id;
  if not found then
    raise exception 'CATEGORIA_INVALIDA' using errcode = 'P0001';
  end if;

  select * into v_existing from public.expenses where id = p_id for update;
  if found then
    if v_existing.employee_id <> p_employee_id or v_existing.deleted_at is not null then
      raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
    end if;
    if not v_cat.active and v_existing.category_id <> p_category_id then
      raise exception 'CATEGORIA_INATIVA' using errcode = 'P0001';
    end if;
  elsif not v_cat.active then
    raise exception 'CATEGORIA_INATIVA' using errcode = 'P0001';
  end if;

  v_week := app.ensure_week(p_employee_id, p_occurred_on);

  if v_existing.id is not null then
    update public.expenses set
      week_id = v_week,
      occurred_on = p_occurred_on,
      amount_cents = p_amount_cents,
      category_id = p_category_id,
      grupo = coalesce(p_grupo, v_cat.grupo),
      description = btrim(p_description),
      km = p_km,
      origem = nullif(btrim(p_origem), ''),
      destino = nullif(btrim(p_destino), ''),
      clientes = nullif(btrim(p_clientes), ''),
      has_receipt = coalesce(p_has_receipt, false),
      updated_by = auth.uid()
    where id = p_id;
    return jsonb_build_object('id', p_id, 'week_start', app.week_start(p_occurred_on), 'created', false);
  end if;

  insert into public.expenses (
    id, week_id, employee_id, occurred_on, amount_cents, category_id, grupo,
    description, km, origem, destino, clientes, has_receipt, created_by, updated_by
  ) values (
    p_id, v_week, p_employee_id, p_occurred_on, p_amount_cents, p_category_id,
    coalesce(p_grupo, v_cat.grupo), btrim(p_description), p_km,
    nullif(btrim(p_origem), ''), nullif(btrim(p_destino), ''), nullif(btrim(p_clientes), ''),
    coalesce(p_has_receipt, false), auth.uid(), auth.uid()
  )
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('id', p_id, 'week_start', app.week_start(p_occurred_on), 'created', v_inserted = 1);
end;
$$;

create or replace function public.delete_expense(p_id uuid, p_support_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.expenses;
begin
  select * into v_row from public.expenses where id = p_id for update;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  perform app.require_entry_writer(v_row.employee_id, p_support_session);
  if v_row.deleted_at is not null then
    return jsonb_build_object('id', p_id, 'deleted', false);
  end if;
  update public.expenses set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Valores recebidos da empresa
-- ---------------------------------------------------------------------------

create or replace function public.save_receipt(
  p_id uuid,
  p_employee_id uuid,
  p_received_on date,
  p_amount_cents bigint,
  p_description text default null,
  p_week_start date default null,
  p_support_session uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.receipts;
  v_week_start date := coalesce(p_week_start, app.week_start(p_received_on));
  v_week uuid;
  v_inserted int;
begin
  perform app.require_entry_writer(p_employee_id, p_support_session);
  perform app.require_valid_date(p_received_on);
  if extract(isodow from v_week_start) <> 1 then
    raise exception 'SEMANA_INVALIDA' using errcode = 'P0001';
  end if;
  perform app.require_valid_date(v_week_start);
  if p_id is null then
    raise exception 'ID_OBRIGATORIO' using errcode = 'P0001';
  end if;

  select * into v_existing from public.receipts where id = p_id for update;
  if found and (v_existing.employee_id <> p_employee_id or v_existing.deleted_at is not null) then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;

  v_week := app.ensure_week(p_employee_id, v_week_start);

  if v_existing.id is not null then
    update public.receipts set
      week_id = v_week,
      received_on = p_received_on,
      amount_cents = p_amount_cents,
      description = nullif(btrim(p_description), ''),
      updated_by = auth.uid()
    where id = p_id;
    return jsonb_build_object('id', p_id, 'week_start', v_week_start, 'created', false);
  end if;

  insert into public.receipts (id, week_id, employee_id, received_on, amount_cents, description, created_by, updated_by)
  values (p_id, v_week, p_employee_id, p_received_on, p_amount_cents, nullif(btrim(p_description), ''), auth.uid(), auth.uid())
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('id', p_id, 'week_start', v_week_start, 'created', v_inserted = 1);
end;
$$;

create or replace function public.delete_receipt(p_id uuid, p_support_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.receipts;
begin
  select * into v_row from public.receipts where id = p_id for update;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  perform app.require_entry_writer(v_row.employee_id, p_support_session);
  if v_row.deleted_at is not null then
    return jsonb_build_object('id', p_id, 'deleted', false);
  end if;
  update public.receipts set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Percursos
-- ---------------------------------------------------------------------------

create or replace function public.save_route(
  p_id uuid,
  p_employee_id uuid,
  p_occurred_on date,
  p_origem text,
  p_destino text,
  p_km numeric default null,
  p_clientes text default null,
  p_support_session uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.routes;
  v_week uuid;
  v_inserted int;
begin
  perform app.require_entry_writer(p_employee_id, p_support_session);
  perform app.require_valid_date(p_occurred_on);
  if p_id is null then
    raise exception 'ID_OBRIGATORIO' using errcode = 'P0001';
  end if;

  select * into v_existing from public.routes where id = p_id for update;
  if found and (v_existing.employee_id <> p_employee_id or v_existing.deleted_at is not null) then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;

  v_week := app.ensure_week(p_employee_id, p_occurred_on);

  if v_existing.id is not null then
    update public.routes set
      week_id = v_week,
      occurred_on = p_occurred_on,
      origem = btrim(p_origem),
      destino = btrim(p_destino),
      km = p_km,
      clientes = nullif(btrim(p_clientes), ''),
      updated_by = auth.uid()
    where id = p_id;
    return jsonb_build_object('id', p_id, 'week_start', app.week_start(p_occurred_on), 'created', false);
  end if;

  insert into public.routes (id, week_id, employee_id, occurred_on, origem, destino, km, clientes, created_by, updated_by)
  values (p_id, v_week, p_employee_id, p_occurred_on, btrim(p_origem), btrim(p_destino), p_km,
          nullif(btrim(p_clientes), ''), auth.uid(), auth.uid())
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('id', p_id, 'week_start', app.week_start(p_occurred_on), 'created', v_inserted = 1);
end;
$$;

create or replace function public.delete_route(p_id uuid, p_support_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.routes;
begin
  select * into v_row from public.routes where id = p_id for update;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  perform app.require_entry_writer(v_row.employee_id, p_support_session);
  if v_row.deleted_at is not null then
    return jsonb_build_object('id', p_id, 'deleted', false);
  end if;
  update public.routes set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Anexos (arquivo enviado antes ao Storage privado por URL assinada)
-- ---------------------------------------------------------------------------

create or replace function public.register_attachment(
  p_id uuid,
  p_expense_id uuid,
  p_storage_path text,
  p_original_name text default null,
  p_support_session uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exp public.expenses;
  v_meta jsonb;
  v_mime text;
  v_size bigint;
  v_count int;
  v_inserted int;
begin
  select * into v_exp from public.expenses where id = p_expense_id and deleted_at is null;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  perform app.require_entry_writer(v_exp.employee_id, p_support_session);

  if exists (select 1 from public.attachments where id = p_id) then
    return jsonb_build_object('id', p_id, 'created', false);
  end if;

  if p_storage_path is null
     or p_storage_path not like v_exp.employee_id::text || '/' || v_exp.id::text || '/%'
     or p_storage_path like '%..%' then
    raise exception 'ARQUIVO_INVALIDO' using errcode = 'P0001';
  end if;

  select metadata into v_meta
  from storage.objects
  where bucket_id = 'comprovantes' and name = p_storage_path;
  if not found then
    raise exception 'ARQUIVO_NAO_ENCONTRADO' using errcode = 'P0001';
  end if;

  v_mime := v_meta ->> 'mimetype';
  v_size := (v_meta ->> 'size')::bigint;
  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    raise exception 'TIPO_ARQUIVO_INVALIDO' using errcode = 'P0001';
  end if;
  if v_size is null or v_size <= 0 or v_size > app.setting_int('anexos_max_bytes') then
    raise exception 'ARQUIVO_GRANDE' using errcode = 'P0001';
  end if;

  select count(*) into v_count
  from public.attachments
  where expense_id = p_expense_id and deleted_at is null;
  if v_count >= app.setting_int('anexos_max_por_despesa') then
    raise exception 'LIMITE_ANEXOS' using errcode = 'P0001';
  end if;

  insert into public.attachments
    (id, expense_id, week_id, employee_id, storage_path, mime_type, size_bytes, original_name, created_by)
  values
    (p_id, p_expense_id, v_exp.week_id, v_exp.employee_id, p_storage_path, v_mime, v_size,
     left(p_original_name, 200), auth.uid())
  on conflict (id) do nothing;
  get diagnostics v_inserted = row_count;

  if not v_exp.has_receipt then
    update public.expenses set has_receipt = true, updated_by = auth.uid() where id = p_expense_id;
  end if;

  return jsonb_build_object('id', p_id, 'created', v_inserted = 1);
end;
$$;

create or replace function public.delete_attachment(p_id uuid, p_support_session uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.attachments;
begin
  select * into v_row from public.attachments where id = p_id for update;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  perform app.require_entry_writer(v_row.employee_id, p_support_session);
  if v_row.deleted_at is not null then
    return jsonb_build_object('id', p_id, 'deleted', false);
  end if;
  update public.attachments set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Totais (leitura sob RLS do chamador)
-- ---------------------------------------------------------------------------

create or replace function public.week_totals(p_employee_id uuid, p_week_start date)
returns table (week_id uuid, status public.week_status, version int, spent_cents bigint, received_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    coalesce(w.status, 'aberta'::public.week_status),
    coalesce(w.version, 0),
    coalesce((select sum(e.amount_cents) from public.expenses e where e.week_id = w.id and e.deleted_at is null), 0)::bigint,
    coalesce((select sum(r.amount_cents) from public.receipts r where r.week_id = w.id and r.deleted_at is null), 0)::bigint
  from (select 1) one
  left join public.employee_weeks w
    on w.employee_id = p_employee_id and w.week_start = p_week_start;
$$;

-- Crédito do último acerto válido anterior à semana.
create or replace function app.credit_before(p_employee_id uuid, p_week_start date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.balance_cents
    from public.settlements s
    where s.employee_id = p_employee_id and s.valid and s.week_start < p_week_start
    order by s.week_start desc
    limit 1
  ), 0);
$$;

create or replace function app.week_has_entries(p_week_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.expenses where week_id = p_week_id and deleted_at is null)
      or exists (select 1 from public.receipts where week_id = p_week_id and deleted_at is null);
$$;

-- Visão financeira administrativa de todas as semanas de um funcionário.
create or replace function public.admin_employee_weeks(p_employee_id uuid)
returns table (
  week_id uuid,
  week_start date,
  status public.week_status,
  version int,
  spent_cents bigint,
  received_cents bigint,
  credit_before_cents bigint,
  balance_cents bigint,
  has_entries boolean,
  pending_previous boolean,
  later_settled boolean,
  settled_at timestamptz,
  settled_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin_reader() or not app.can_read_employee(p_employee_id) then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;

  return query
  with w as (
    select ew.*,
      coalesce((select sum(e.amount_cents) from public.expenses e where e.week_id = ew.id and e.deleted_at is null), 0)::bigint as d,
      coalesce((select sum(r.amount_cents) from public.receipts r where r.week_id = ew.id and r.deleted_at is null), 0)::bigint as r,
      app.week_has_entries(ew.id) as has_entries
    from public.employee_weeks ew
    where ew.employee_id = p_employee_id
  )
  select
    w.id,
    w.week_start,
    w.status,
    w.version,
    coalesce(s.spent_cents, w.d),
    coalesce(s.received_cents, w.r),
    coalesce(s.credit_before_cents, app.credit_before(p_employee_id, w.week_start)),
    coalesce(s.balance_cents, app.credit_before(p_employee_id, w.week_start) + w.r - w.d),
    w.has_entries,
    exists (
      select 1 from w w2
      where w2.week_start < w.week_start and w2.status = 'aberta' and w2.has_entries
    ),
    exists (
      select 1 from w w3
      where w3.week_start > w.week_start and w3.status = 'acertada'
    ),
    w.settled_at,
    p.full_name
  from w
  left join public.settlements s on s.week_id = w.id and s.valid
  left join public.profiles p on p.id = w.settled_by
  order by w.week_start desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Acerto e reabertura
-- ---------------------------------------------------------------------------

create or replace function public.settle_week(
  p_employee_id uuid,
  p_week_start date,
  p_expected_version int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := app.require_active();
  v_week public.employee_weeks;
  v_c bigint;
  v_r bigint;
  v_d bigint;
  v_s bigint;
begin
  if v_role not in ('gestor', 'admin') then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_employee_id and role = 'funcionario') then
    raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'SEMANA_INVALIDA' using errcode = 'P0001';
  end if;

  perform app.ensure_week(p_employee_id, p_week_start);

  -- Trava a semana: lançamentos concorrentes esperam este acerto terminar e,
  -- em seguida, falham com SEMANA_ACERTADA.
  select * into v_week
  from public.employee_weeks
  where employee_id = p_employee_id and week_start = p_week_start
  for update;

  if v_week.status <> 'aberta' then
    raise exception 'SEMANA_JA_ACERTADA' using errcode = 'P0001';
  end if;
  if p_expected_version is not null and v_week.version <> p_expected_version then
    raise exception 'VERSAO_DESATUALIZADA' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.employee_weeks ew
    where ew.employee_id = p_employee_id
      and ew.week_start < p_week_start
      and ew.status = 'aberta'
      and app.week_has_entries(ew.id)
  ) then
    raise exception 'SEMANA_ANTERIOR_PENDENTE' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.employee_weeks ew
    where ew.employee_id = p_employee_id
      and ew.week_start > p_week_start
      and ew.status = 'acertada'
  ) then
    raise exception 'SEMANA_POSTERIOR_ACERTADA' using errcode = 'P0001';
  end if;

  v_c := app.credit_before(p_employee_id, p_week_start);
  select coalesce(sum(amount_cents), 0) into v_r from public.receipts where week_id = v_week.id and deleted_at is null;
  select coalesce(sum(amount_cents), 0) into v_d from public.expenses where week_id = v_week.id and deleted_at is null;
  v_s := v_c + v_r - v_d;

  if v_s < 0 then
    raise exception 'SALDO_NEGATIVO' using errcode = 'P0001', detail = (-v_s)::text;
  end if;

  insert into public.settlements
    (week_id, employee_id, week_start, credit_before_cents, received_cents, spent_cents, balance_cents, settled_by)
  values
    (v_week.id, p_employee_id, p_week_start, v_c, v_r, v_d, v_s, auth.uid());

  update public.employee_weeks set
    status = 'acertada',
    settled_at = now(),
    settled_by = auth.uid(),
    version = version + 1
  where id = v_week.id;

  return jsonb_build_object(
    'week_start', p_week_start,
    'credit_before_cents', v_c,
    'received_cents', v_r,
    'spent_cents', v_d,
    'balance_cents', v_s
  );
end;
$$;

create or replace function public.reopen_week(p_employee_id uuid, p_week_start date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role := app.require_active();
  v_target public.employee_weeks;
  v_reopened date[];
begin
  if v_role not in ('gestor', 'admin') then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'MOTIVO_OBRIGATORIO' using errcode = 'P0001';
  end if;

  -- Trava a semana alvo e todas as posteriores do funcionário.
  perform 1 from public.employee_weeks
  where employee_id = p_employee_id and week_start >= p_week_start
  order by week_start
  for update;

  select * into v_target
  from public.employee_weeks
  where employee_id = p_employee_id and week_start = p_week_start;
  if not found or v_target.status <> 'acertada' then
    raise exception 'SEMANA_NAO_ACERTADA' using errcode = 'P0001';
  end if;

  perform app.set_audit_context(btrim(p_reason), null);

  update public.settlements set
    valid = false,
    invalidated_at = now(),
    invalidated_by = auth.uid(),
    invalidation_reason = case
      when week_start = p_week_start then btrim(p_reason)
      else 'Invalidado pela reabertura da semana de ' || to_char(p_week_start, 'DD/MM/YYYY') || ': ' || btrim(p_reason)
    end
  where employee_id = p_employee_id and valid and week_start >= p_week_start;

  with upd as (
    update public.employee_weeks set
      status = 'aberta',
      settled_at = null,
      settled_by = null,
      version = version + 1
    where employee_id = p_employee_id and week_start >= p_week_start and status = 'acertada'
    returning week_start
  )
  select array_agg(week_start order by week_start) into v_reopened from upd;

  return jsonb_build_object('reopened', to_jsonb(v_reopened));
end;
$$;

-- ---------------------------------------------------------------------------
-- Contas (Administrador)
-- ---------------------------------------------------------------------------

create or replace function app.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if app.require_active() <> 'admin' then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_create_profile(
  p_id uuid,
  p_full_name text,
  p_cpf text,
  p_username text,
  p_role public.user_role,
  p_avatar public.avatar_kind default 'neutro'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  if exists (select 1 from public.profiles where cpf = p_cpf) then
    raise exception 'CPF_DUPLICADO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where username = lower(btrim(p_username))) then
    raise exception 'USUARIO_DUPLICADO' using errcode = 'P0001';
  end if;
  if not app.cpf_valido(p_cpf) then
    raise exception 'CPF_INVALIDO' using errcode = 'P0001';
  end if;

  insert into public.profiles
    (id, full_name, cpf, username, role, avatar, must_change_password, temp_password_expires_at)
  values
    (p_id, btrim(p_full_name), p_cpf, lower(btrim(p_username)), p_role, coalesce(p_avatar, 'neutro'), true,
     now() + make_interval(hours => app.setting_int('senha_temporaria_validade_horas')));
  return jsonb_build_object('id', p_id);
end;
$$;

create or replace function public.admin_update_profile(
  p_id uuid,
  p_full_name text,
  p_cpf text,
  p_username text,
  p_role public.user_role,
  p_avatar public.avatar_kind
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
begin
  perform app.require_admin();
  select * into v_old from public.profiles where id = p_id for update;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  if p_id = auth.uid() and p_role <> 'admin' then
    raise exception 'NAO_REMOVER_PROPRIO_ADMIN' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where cpf = p_cpf and id <> p_id) then
    raise exception 'CPF_DUPLICADO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where username = lower(btrim(p_username)) and id <> p_id) then
    raise exception 'USUARIO_DUPLICADO' using errcode = 'P0001';
  end if;
  if not app.cpf_valido(p_cpf) then
    raise exception 'CPF_INVALIDO' using errcode = 'P0001';
  end if;
  -- Funcionário com lançamentos não muda de papel (histórico financeiro preso ao papel).
  if v_old.role = 'funcionario' and p_role <> 'funcionario'
     and exists (select 1 from public.employee_weeks where employee_id = p_id) then
    raise exception 'PAPEL_COM_HISTORICO' using errcode = 'P0001';
  end if;

  update public.profiles set
    full_name = btrim(p_full_name),
    cpf = p_cpf,
    username = lower(btrim(p_username)),
    role = p_role,
    avatar = p_avatar
  where id = p_id;
  return jsonb_build_object('id', p_id, 'username_changed', v_old.username <> lower(btrim(p_username)));
end;
$$;

create or replace function public.admin_set_active(p_id uuid, p_active boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  if p_id = auth.uid() and not p_active then
    raise exception 'NAO_DESATIVAR_PROPRIA_CONTA' using errcode = 'P0001';
  end if;
  perform app.set_audit_context(nullif(btrim(p_reason), ''), null);
  update public.profiles set
    active = p_active,
    deactivated_at = case when p_active then null else now() end
  where id = p_id;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', p_id, 'active', p_active);
end;
$$;

create or replace function public.admin_get_profile(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.profiles;
begin
  perform app.require_admin();
  select * into v from public.profiles where id = p_id;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'id', v.id, 'full_name', v.full_name, 'cpf', v.cpf, 'username', v.username,
    'role', v.role, 'active', v.active, 'avatar', v.avatar,
    'must_change_password', v.must_change_password,
    'temp_password_expires_at', v.temp_password_expires_at,
    'deactivated_at', v.deactivated_at, 'created_at', v.created_at
  );
end;
$$;

create or replace function public.admin_mark_password_reset(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  perform app.set_audit_context('Senha temporária redefinida', null);
  update public.profiles set
    must_change_password = true,
    temp_password_expires_at = now() + make_interval(hours => app.setting_int('senha_temporaria_validade_horas'))
  where id = p_id;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  return jsonb_build_object('id', p_id);
end;
$$;

create or replace function public.update_own_avatar(p_avatar public.avatar_kind)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_active();
  update public.profiles set avatar = p_avatar where id = auth.uid();
  return jsonb_build_object('avatar', p_avatar);
end;
$$;

create or replace function public.set_own_photo(p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_active();
  if p_path is not null then
    if p_path not like auth.uid()::text || '/%' or p_path like '%..%' then
      raise exception 'ARQUIVO_INVALIDO' using errcode = 'P0001';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = p_path) then
      raise exception 'ARQUIVO_NAO_ENCONTRADO' using errcode = 'P0001';
    end if;
  end if;
  update public.profiles set photo_path = p_path where id = auth.uid();
  return jsonb_build_object('photo_path', p_path);
end;
$$;

-- ---------------------------------------------------------------------------
-- Categorias e configurações (Administrador)
-- ---------------------------------------------------------------------------

create or replace function public.admin_save_category(
  p_id uuid,
  p_name text,
  p_grupo public.expense_group,
  p_active boolean default true,
  p_sort_order int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform app.require_admin();
  if exists (select 1 from public.categories where lower(btrim(name)) = lower(btrim(p_name)) and id <> v_id) then
    raise exception 'CATEGORIA_DUPLICADA' using errcode = 'P0001';
  end if;
  insert into public.categories (id, name, grupo, active, sort_order)
  values (v_id, btrim(p_name), p_grupo, coalesce(p_active, true), coalesce(p_sort_order, 100))
  on conflict (id) do update set
    name = excluded.name,
    grupo = excluded.grupo,
    active = excluded.active,
    sort_order = excluded.sort_order;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  case p_key
    when 'data_inicio_operacao' then
      if extract(isodow from (p_value #>> '{}')::date) <> 1 then
        raise exception 'SEMANA_INVALIDA' using errcode = 'P0001';
      end if;
    when 'anexos_max_por_despesa' then
      if (p_value #>> '{}')::int not between 1 and 10 then
        raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
      end if;
    when 'suporte_duracao_minutos' then
      if (p_value #>> '{}')::int not between 5 and 120 then
        raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
      end if;
    when 'senha_temporaria_validade_horas' then
      if (p_value #>> '{}')::int not between 1 and 168 then
        raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
      end if;
    else
      raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end case;
  update public.app_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

-- ---------------------------------------------------------------------------
-- Suporte "Acessar como funcionário" (Administrador)
-- ---------------------------------------------------------------------------

create or replace function public.start_support_session(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_expires timestamptz := now() + make_interval(mins => app.setting_int('suporte_duracao_minutos'));
begin
  perform app.require_admin();
  if not exists (select 1 from public.profiles where id = p_employee_id and role = 'funcionario' and active) then
    raise exception 'FUNCIONARIO_INVALIDO' using errcode = 'P0001';
  end if;
  update public.support_sessions set ended_at = now()
  where admin_id = auth.uid() and ended_at is null;

  insert into public.support_sessions (admin_id, employee_id, expires_at)
  values (auth.uid(), p_employee_id, v_expires)
  returning id into v_id;

  insert into public.audit_events (actor_id, employee_id, support_session_id, entity, entity_id, action)
  values (auth.uid(), p_employee_id, v_id, 'support_sessions', v_id, 'suporte_iniciado');

  return jsonb_build_object('id', v_id, 'expires_at', v_expires);
end;
$$;

create or replace function public.end_support_session(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp uuid;
begin
  perform app.require_active();
  update public.support_sessions set ended_at = now()
  where id = p_id and admin_id = auth.uid() and ended_at is null
  returning employee_id into v_emp;
  if v_emp is not null then
    insert into public.audit_events (actor_id, employee_id, support_session_id, entity, entity_id, action)
    values (auth.uid(), v_emp, p_id, 'support_sessions', p_id, 'suporte_encerrado');
  end if;
  return jsonb_build_object('id', p_id);
end;
$$;

-- Sessão de suporte ativa do Administrador chamador (validação a cada requisição).
create or replace function public.current_support_session(p_id uuid)
returns table (id uuid, employee_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.employee_id, s.expires_at
  from public.support_sessions s
  join public.profiles e on e.id = s.employee_id and e.active
  where s.id = p_id
    and s.admin_id = auth.uid()
    and app.current_role() = 'admin'
    and s.ended_at is null
    and s.expires_at > now();
$$;

-- ---------------------------------------------------------------------------
-- Funções exclusivas do servidor (service_role)
-- ---------------------------------------------------------------------------

create or replace function public.service_login_allowed(p_username text, p_ip text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.login_attempts
      where username = lower(btrim(p_username)) and not success
        and attempted_at > now() - interval '15 minutes') < 5
    and
    (select count(*) from public.login_attempts
      where ip = p_ip and not success
        and attempted_at > now() - interval '15 minutes') < 30;
$$;

create or replace function public.service_record_login(p_username text, p_ip text, p_success boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.login_attempts (username, ip, success) values (lower(btrim(p_username)), p_ip, p_success);
  delete from public.login_attempts where attempted_at < now() - interval '30 days';
$$;

create or replace function public.service_login_profile(p_username text)
returns table (id uuid, active boolean, must_change_password boolean, temp_password_expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.active, p.must_change_password, p.temp_password_expires_at
  from public.profiles p
  where p.username = lower(btrim(p_username));
$$;

create or replace function public.service_complete_password_change(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.actor', p_user_id::text, true);
  perform set_config('app.reason', 'Troca de senha', true);
  update public.profiles set must_change_password = false, temp_password_expires_at = null
  where id = p_user_id;
end;
$$;

create or replace function public.service_count_admins()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.profiles where role = 'admin';
$$;

-- Primeiro Administrador (bootstrap): só funciona quando não existe nenhum.
create or replace function public.service_bootstrap_admin(
  p_id uuid, p_full_name text, p_cpf text, p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'ADMIN_JA_EXISTE' using errcode = 'P0001';
  end if;
  perform set_config('app.actor', p_id::text, true);
  perform set_config('app.reason', 'Criação do primeiro Administrador', true);
  insert into public.profiles (id, full_name, cpf, username, role, must_change_password, temp_password_expires_at)
  values (p_id, btrim(p_full_name), p_cpf, lower(btrim(p_username)), 'admin', true,
          now() + make_interval(hours => app.setting_int('senha_temporaria_validade_horas')));
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões de execução
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public, anon;

grant execute on function
  public.save_expense(uuid, uuid, date, bigint, uuid, text, public.expense_group, numeric, text, text, text, boolean, uuid),
  public.delete_expense(uuid, uuid),
  public.save_receipt(uuid, uuid, date, bigint, text, date, uuid),
  public.delete_receipt(uuid, uuid),
  public.save_route(uuid, uuid, date, text, text, numeric, text, uuid),
  public.delete_route(uuid, uuid),
  public.register_attachment(uuid, uuid, text, text, uuid),
  public.delete_attachment(uuid, uuid),
  public.week_totals(uuid, date),
  public.admin_employee_weeks(uuid),
  public.settle_week(uuid, date, int),
  public.reopen_week(uuid, date, text),
  public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind),
  public.admin_update_profile(uuid, text, text, text, public.user_role, public.avatar_kind),
  public.admin_set_active(uuid, boolean, text),
  public.admin_get_profile(uuid),
  public.admin_mark_password_reset(uuid),
  public.update_own_avatar(public.avatar_kind),
  public.set_own_photo(text),
  public.admin_save_category(uuid, text, public.expense_group, boolean, int),
  public.admin_set_setting(text, jsonb),
  public.start_support_session(uuid),
  public.end_support_session(uuid),
  public.current_support_session(uuid)
to authenticated;

grant execute on function
  public.service_login_allowed(text, text),
  public.service_record_login(text, text, boolean),
  public.service_login_profile(text),
  public.service_complete_password_change(uuid),
  public.service_count_admins(),
  public.service_bootstrap_admin(uuid, text, text, text)
to service_role;

-- Funções auxiliares usadas dentro das políticas RLS e da função security invoker.
grant execute on all functions in schema app to authenticated, service_role;
