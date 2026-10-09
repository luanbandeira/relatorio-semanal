-- Lista de semanas do funcionário com totais neutros (gasto e recebido),
-- sem crédito nem saldo. Executa sob RLS do chamador.
create or replace function public.employee_week_list(p_employee_id uuid)
returns table (week_id uuid, week_start date, status public.week_status, spent_cents bigint, received_cents bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    w.week_start,
    w.status,
    coalesce((select sum(e.amount_cents) from public.expenses e where e.week_id = w.id and e.deleted_at is null), 0)::bigint,
    coalesce((select sum(r.amount_cents) from public.receipts r where r.week_id = w.id and r.deleted_at is null), 0)::bigint
  from public.employee_weeks w
  where w.employee_id = p_employee_id
  order by w.week_start desc;
$$;

revoke execute on function public.employee_week_list(uuid) from public, anon;
grant execute on function public.employee_week_list(uuid) to authenticated;
