-- Correção: PL/pgSQL não garante curto-circuito em expressões booleanas.
-- audit_row acessava old.status em tabelas sem essa coluna; guard_week_open
-- passa a separar os ramos de INSERT e UPDATE.

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
  if tg_table_name = 'employee_weeks' and tg_op = 'UPDATE' then
    if (v_old ->> 'status') is not distinct from (v_new ->> 'status') then
      return null; -- incremento de versão apenas
    end if;
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
    update public.employee_weeks set version = version + 1
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
    update public.employee_weeks set version = version + 1
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
    update public.employee_weeks set version = version + 1
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
