-- O funcionário passa a ver o fechamento
-- das próprias semanas (crédito anterior, recebido, gasto e resultado).
-- week_balances: permitido a quem pode consultar o funcionário (o próprio, ou
-- administração conforme RLS). admin_employee_weeks mantém a exigência de papel
-- administrativo e reaproveita o cálculo.

create or replace function public.week_balances(p_employee_id uuid)
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
    p.full_name
  from w
  left join public.settlements s on s.week_id = w.id and s.valid
  left join public.profiles p on p.id = w.settled_by
  order by w.week_start desc;
end;
$$;

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
  return query select * from public.week_balances(p_employee_id);
end;
$$;

revoke execute on function public.week_balances(uuid) from public, anon;
grant execute on function public.week_balances(uuid) to authenticated;
