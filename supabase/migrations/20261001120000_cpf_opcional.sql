-- CPF deixa de ser obrigatório no cadastro.
-- Quando informado, continua validado e único. Vazio é gravado como null.

alter table public.profiles alter column cpf drop not null;

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
    (id, full_name, cpf, username, role, avatar, must_change_password, temp_password_expires_at)
  values
    (p_id, btrim(p_full_name), v_cpf, lower(btrim(p_username)), p_role, coalesce(p_avatar, 'neutro'), true,
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
  -- Funcionário com lançamentos não muda de papel (histórico financeiro preso ao papel).
  if v_old.role = 'funcionario' and p_role <> 'funcionario'
     and exists (select 1 from public.employee_weeks where employee_id = p_id) then
    raise exception 'PAPEL_COM_HISTORICO' using errcode = 'P0001';
  end if;

  update public.profiles set
    full_name = btrim(p_full_name),
    cpf = v_cpf,
    username = lower(btrim(p_username)),
    role = p_role,
    avatar = p_avatar
  where id = p_id;
  return jsonb_build_object('id', p_id, 'username_changed', v_old.username <> lower(btrim(p_username)));
end;
$$;

-- create or replace mantém as permissões; reforça por segurança.
revoke execute on function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind) from public, anon;
revoke execute on function public.admin_update_profile(uuid, text, text, text, public.user_role, public.avatar_kind) from public, anon;
grant execute on function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text, text, public.user_role, public.avatar_kind) to authenticated;
