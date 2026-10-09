-- Unidade de cada pessoa (ex.: NRT, SUL),
-- exibida como selo nos cartões. Texto livre e opcional; ao gravar, se já
-- existir a mesma unidade com outra grafia (maiúsculas/minúsculas/espaços),
-- reaproveita a grafia existente para manter o padrão.

alter table public.profiles
  add column unit text check (unit is null or char_length(unit) between 1 and 40);

grant select (unit) on public.profiles to authenticated;

create or replace function app.normalize_unit(p_unit text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select nullif(regexp_replace(btrim(coalesce(p_unit, '')), '\s+', ' ', 'g'), '') as name)
  select coalesce(
    (select p.unit from public.profiles p, v
      where v.name is not null and lower(p.unit) = lower(v.name)
      order by p.created_at limit 1),
    (select name from v)
  );
$$;

-- As funções ganham o parâmetro p_unit; as versões antigas são removidas
-- para não haver ambiguidade nas chamadas por nome.
drop function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind);
drop function public.admin_update_profile(uuid, text, text, text, public.user_role, public.avatar_kind);

create function public.admin_create_profile(
  p_id uuid,
  p_full_name text,
  p_cpf text,
  p_username text,
  p_role public.user_role,
  p_avatar public.avatar_kind default 'neutro',
  p_unit text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cpf text := nullif(btrim(coalesce(p_cpf, '')), '');
begin
  perform app.require_admin();
  if v_cpf is not null and not app.cpf_valido(v_cpf) then
    raise exception 'CPF_INVALIDO' using errcode = 'P0001';
  end if;
  if v_cpf is not null and exists (select 1 from public.profiles where cpf = v_cpf) then
    raise exception 'CPF_DUPLICADO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where username = lower(btrim(p_username))) then
    raise exception 'USUARIO_DUPLICADO' using errcode = 'P0001';
  end if;

  insert into public.profiles
    (id, full_name, cpf, username, role, avatar, unit, must_change_password, temp_password_expires_at)
  values
    (p_id, btrim(p_full_name), v_cpf, lower(btrim(p_username)), p_role, coalesce(p_avatar, 'neutro'),
     app.normalize_unit(p_unit), true,
     now() + make_interval(hours => app.setting_int('senha_temporaria_validade_horas')));
  return jsonb_build_object('id', p_id);
end;
$$;

create function public.admin_update_profile(
  p_id uuid,
  p_full_name text,
  p_cpf text,
  p_username text,
  p_role public.user_role,
  p_avatar public.avatar_kind,
  p_unit text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.profiles;
  v_cpf text := nullif(btrim(coalesce(p_cpf, '')), '');
begin
  perform app.require_admin();
  select * into v_old from public.profiles where id = p_id for update;
  if not found then
    raise exception 'REGISTRO_INVALIDO' using errcode = 'P0001';
  end if;
  if p_id = auth.uid() and p_role <> 'admin' then
    raise exception 'NAO_REMOVER_PROPRIO_ADMIN' using errcode = 'P0001';
  end if;
  if v_cpf is not null and not app.cpf_valido(v_cpf) then
    raise exception 'CPF_INVALIDO' using errcode = 'P0001';
  end if;
  if v_cpf is not null and exists (select 1 from public.profiles where cpf = v_cpf and id <> p_id) then
    raise exception 'CPF_DUPLICADO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where username = lower(btrim(p_username)) and id <> p_id) then
    raise exception 'USUARIO_DUPLICADO' using errcode = 'P0001';
  end if;
  if v_old.role = 'funcionario' and p_role <> 'funcionario'
     and exists (select 1 from public.employee_weeks where employee_id = p_id) then
    raise exception 'PAPEL_COM_HISTORICO' using errcode = 'P0001';
  end if;

  update public.profiles set
    full_name = btrim(p_full_name),
    cpf = v_cpf,
    username = lower(btrim(p_username)),
    role = p_role,
    avatar = p_avatar,
    unit = app.normalize_unit(p_unit)
  where id = p_id;
  return jsonb_build_object('id', p_id, 'username_changed', v_old.username <> lower(btrim(p_username)));
end;
$$;

-- admin_get_profile passa a devolver a unidade.
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
    'role', v.role, 'active', v.active, 'avatar', v.avatar, 'unit', v.unit,
    'must_change_password', v.must_change_password,
    'temp_password_expires_at', v.temp_password_expires_at,
    'deactivated_at', v.deactivated_at, 'created_at', v.created_at
  );
end;
$$;

revoke execute on function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text) from public, anon;
revoke execute on function public.admin_update_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text) from public, anon;
revoke execute on function app.normalize_unit(text) from public, anon;
grant execute on function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text) to authenticated;
grant execute on function app.normalize_unit(text) to authenticated;
