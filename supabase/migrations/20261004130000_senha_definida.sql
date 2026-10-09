-- O Administrador pode criar a conta já com a
-- senha definitiva (sem troca obrigatória no primeiro acesso). O padrão continua
-- sendo senha temporária com troca obrigatória; contas existentes não mudam.
-- A senha em si fica só no Supabase Auth; aqui só se registra se a troca é exigida.

drop function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text);

create function public.admin_create_profile(
  p_id uuid,
  p_full_name text,
  p_cpf text,
  p_username text,
  p_role public.user_role,
  p_avatar public.avatar_kind default 'neutro',
  p_unit text default null,
  p_must_change_password boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cpf text := nullif(btrim(coalesce(p_cpf, '')), '');
  v_must boolean := coalesce(p_must_change_password, true);
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

  perform set_config('app.reason',
    case when v_must then 'Conta criada com senha temporária' else 'Conta criada com senha definida pelo Administrador' end, true);

  insert into public.profiles
    (id, full_name, cpf, username, role, avatar, unit, must_change_password, temp_password_expires_at)
  values
    (p_id, btrim(p_full_name), v_cpf, lower(btrim(p_username)), p_role, coalesce(p_avatar, 'neutro'),
     app.normalize_unit(p_unit), v_must,
     case when v_must then now() + make_interval(hours => app.setting_int('senha_temporaria_validade_horas')) end);
  return jsonb_build_object('id', p_id);
end;
$$;

revoke execute on function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text, boolean) from public, anon;
grant execute on function public.admin_create_profile(uuid, text, text, text, public.user_role, public.avatar_kind, text, boolean) to authenticated;
