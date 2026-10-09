-- Acerto automático das semanas.
--
-- Uma semana aberta é acertada sozinha quando:
--   * já terminou e passou a tolerância (padrão 2 dias: fecha na quarta 00:00);
--   * a empresa não deve nada ao funcionário (C + R − D >= 0);
--   * as semanas anteriores com lançamentos já estão acertadas (ordem do crédito);
--   * não houve alteração nela nos últimos 30 minutos (quem está lançando não é interrompido);
--   * se foi reaberta, já passou o novo prazo de tolerância.
-- Semana com valor a receber fica aberta até o funcionário lançar o recebimento
-- que cobre a diferença; a rotina seguinte (a cada 15 minutos) fecha. O acerto
-- manual continua existindo. Tudo é auditado com o motivo "Acerto automático".

create extension if not exists pg_cron;

alter table public.settlements alter column settled_by drop not null;
alter table public.settlements add column automatic boolean not null default false;
alter table public.settlements add constraint settlements_author_check check (automatic or settled_by is not null);

alter table public.employee_weeks add column last_activity_at timestamptz;
alter table public.employee_weeks add column auto_settle_after timestamptz;

insert into public.app_settings (key, value) values ('acerto_automatico_tolerancia_dias', to_jsonb(2))
on conflict (key) do nothing;

-- Toda alteração de lançamento registra a última atividade da semana.
create or replace function app.guard_week_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.week_status;
  v_emp uuid;
  v_check_new boolean := false;
begin
  if tg_op = 'DELETE' then
    update public.employee_weeks set version = version + 1, last_activity_at = now()
    where id = old.week_id
    returning status into v_status;
    if v_status <> 'aberta' then
      raise exception 'SEMANA_ACERTADA' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.employee_id <> old.employee_id then
      raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
    end if;
    update public.employee_weeks set version = version + 1, last_activity_at = now()
    where id = old.week_id
    returning status into v_status;
    if v_status <> 'aberta' then
      raise exception 'SEMANA_ACERTADA' using errcode = 'P0001';
    end if;
    if new.week_id <> old.week_id then
      v_check_new := true;
    end if;
  else
    v_check_new := true; -- INSERT
  end if;

  if v_check_new then
    update public.employee_weeks set version = version + 1, last_activity_at = now()
    where id = new.week_id
    returning status, employee_id into v_status, v_emp;
    if v_status is null then
      raise exception 'SEMANA_INVALIDA' using errcode = 'P0001';
    end if;
    if v_status <> 'aberta' then
      raise exception 'SEMANA_ACERTADA' using errcode = 'P0001';
    end if;
    if v_emp <> new.employee_id then
      raise exception 'SEMANA_INVALIDA' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- Acerto automático de um funcionário, em ordem cronológica. Devolve quantas
-- semanas foram acertadas.
create or replace function app.auto_settle_employee(p_employee_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tol int := coalesce(app.setting_int('acerto_automatico_tolerancia_dias'), 2);
  v_today date := app.today_local();
  v_prev_reason text := current_setting('app.reason', true);
  w record;
  v_c bigint;
  v_r bigint;
  v_d bigint;
  v_s bigint;
  v_n int := 0;
begin
  perform set_config('app.reason', 'Acerto automático', true);

  for w in
    select * from public.employee_weeks
    where employee_id = p_employee_id and status = 'aberta'
    order by week_start
    for update
  loop
    exit when v_today < w.week_start + 7 + v_tol;                                  -- ainda na tolerância
    exit when w.auto_settle_after is not null and now() < w.auto_settle_after;      -- reaberta há pouco
    exit when w.last_activity_at is not null and w.last_activity_at > now() - interval '30 minutes';
    exit when exists (
      select 1 from public.employee_weeks x
      where x.employee_id = p_employee_id and x.week_start > w.week_start and x.status = 'acertada'
    );

    v_c := app.credit_before(p_employee_id, w.week_start);
    select coalesce(sum(amount_cents), 0) into v_r from public.receipts where week_id = w.id and deleted_at is null;
    select coalesce(sum(amount_cents), 0) into v_d from public.expenses where week_id = w.id and deleted_at is null;
    v_s := v_c + v_r - v_d;
    exit when v_s < 0; -- empresa deve: aguarda o recebimento (e segura as semanas seguintes)

    insert into public.settlements
      (week_id, employee_id, week_start, credit_before_cents, received_cents, spent_cents, balance_cents,
       settled_by, automatic)
    values
      (w.id, p_employee_id, w.week_start, v_c, v_r, v_d, v_s, null, true);

    update public.employee_weeks set
      status = 'acertada',
      settled_at = now(),
      settled_by = null,
      auto_settle_after = null,
      version = version + 1
    where id = w.id;
    v_n := v_n + 1;
  end loop;

  perform set_config('app.reason', coalesce(v_prev_reason, ''), true);
  return v_n;
end;
$$;

-- Rotina agendada: todos os funcionários.
create or replace function public.run_auto_settlement()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_total int := 0;
begin
  for e in select id from public.profiles where role = 'funcionario' loop
    v_total := v_total + app.auto_settle_employee(e.id);
  end loop;
  return v_total;
end;
$$;

-- Reabertura: devolve a edição e dá um novo prazo antes do acerto automático.
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
  v_tol int := coalesce(app.setting_int('acerto_automatico_tolerancia_dias'), 2);
begin
  if v_role not in ('gestor', 'admin') then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    raise exception 'MOTIVO_OBRIGATORIO' using errcode = 'P0001';
  end if;

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
      version = version + 1,
      last_activity_at = now(),
      auto_settle_after = now() + make_interval(days => greatest(v_tol, 1))
    where employee_id = p_employee_id and week_start >= p_week_start and status = 'acertada'
    returning week_start
  )
  select array_agg(week_start order by week_start) into v_reopened from upd;

  return jsonb_build_object('reopened', to_jsonb(v_reopened));
end;
$$;

-- Configuração da tolerância (0 a 14 dias).
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
    when 'acerto_automatico_tolerancia_dias' then
      if (p_value #>> '{}')::int not between 0 and 14 then
        raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
      end if;
    else
      raise exception 'VALOR_INVALIDO' using errcode = 'P0001';
  end case;
  update public.app_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;

-- Fechamento das semanas com a indicação de acerto automático.
drop function public.admin_employee_weeks(uuid);
drop function public.week_balances(uuid);

create function public.week_balances(p_employee_id uuid)
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
  settled_by_name text,
  settled_automatically boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.can_read_employee(p_employee_id) then
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
    p.full_name,
    coalesce(s.automatic, false)
  from w
  left join public.settlements s on s.week_id = w.id and s.valid
  left join public.profiles p on p.id = w.settled_by
  order by w.week_start desc;
end;
$$;

create function public.admin_employee_weeks(p_employee_id uuid)
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
  settled_by_name text,
  settled_automatically boolean
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
  return query select * from public.week_balances(p_employee_id);
end;
$$;

-- Valor que a empresa deve a cada funcionário (semanas já terminadas e abertas
-- com resultado negativo), para o aviso nos cartões.
create or replace function public.admin_owed_summary()
returns table (employee_id uuid, owed_cents bigint, weeks int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin_reader() then
    raise exception 'SEM_PERMISSAO' using errcode = 'P0001';
  end if;
  return query
  with ow as (
    select w.employee_id,
      app.credit_before(w.employee_id, w.week_start)
        + coalesce((select sum(r.amount_cents) from public.receipts r where r.week_id = w.id and r.deleted_at is null), 0)
        - coalesce((select sum(e.amount_cents) from public.expenses e where e.week_id = w.id and e.deleted_at is null), 0)
        as s
    from public.employee_weeks w
    where w.status = 'aberta'
      and w.week_start + 6 < app.today_local()
      and app.can_read_employee(w.employee_id)
  )
  select ow.employee_id, sum(-ow.s)::bigint, count(*)::int
  from ow where ow.s < 0
  group by ow.employee_id;
end;
$$;

revoke execute on function public.run_auto_settlement() from public, anon, authenticated;
revoke execute on function app.auto_settle_employee(uuid) from public, anon, authenticated;
revoke execute on function public.week_balances(uuid) from public, anon;
revoke execute on function public.admin_employee_weeks(uuid) from public, anon;
revoke execute on function public.admin_owed_summary() from public, anon;
grant execute on function public.week_balances(uuid) to authenticated;
grant execute on function public.admin_employee_weeks(uuid) to authenticated;
grant execute on function public.admin_owed_summary() to authenticated;

-- A cada 15 minutos.
select cron.schedule('acerto-automatico', '*/15 * * * *', 'select public.run_auto_settlement()');
