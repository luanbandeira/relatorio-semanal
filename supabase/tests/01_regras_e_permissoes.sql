-- Testes de banco: regras financeiras, bloqueio após acerto, RLS e autorização.
-- Tudo roda dentro de um único bloco que termina com a exceção TESTS_OK, o que
-- desfaz todas as alterações (nenhum dado de teste permanece no banco).
-- Falha: exceção TEST_FAILED com o nome do caso.
--
-- Executar: npm run test:db (usa DATABASE_URL) ou colar no SQL editor.

do $tests$
declare
  -- Pessoas fictícias
  v_sup uuid := '00000000-0000-4000-8000-000000000001';
  v_ges uuid := '00000000-0000-4000-8000-000000000002';
  v_vis uuid := '00000000-0000-4000-8000-000000000003';
  v_ana uuid := '00000000-0000-4000-8000-000000000010';
  v_bia uuid := '00000000-0000-4000-8000-000000000011';
  v_cai uuid := '00000000-0000-4000-8000-000000000012'; -- será desativado
  v_cat_comb uuid;
  v_cat_alim uuid;
  v_cat_inativa uuid;
  -- Semanas (segundas-feiras)
  w1 date := '2026-08-31';
  w2 date := '2026-09-07';
  w3 date := '2026-09-14';
  w4 date := '2026-09-21';
  v_id uuid;
  v_id2 uuid;
  v_res jsonb;
  v_n bigint;
  v_n2 bigint;
  v_txt text;
  v_passed int := 0;
  v_session uuid;
begin
  -- -------------------------------------------------------------------------
  -- Infraestrutura de teste (desfeita no final)
  -- -------------------------------------------------------------------------
  create schema tests_tmp;
  grant usage on schema tests_tmp to authenticated, anon;

  create function tests_tmp.login(p_uid uuid) returns void language plpgsql as $f$
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $f$;

  create function tests_tmp.logout() returns void language plpgsql as $f$
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  end $f$;

  create function tests_tmp.expect_error(p_sql text, p_code text, p_name text) returns void
  language plpgsql as $f$
  begin
    begin
      execute p_sql;
    exception when others then
      if position(p_code in sqlerrm) = 0 then
        raise exception 'TEST_FAILED [%]: esperado erro % mas veio: %', p_name, p_code, sqlerrm;
      end if;
      return;
    end;
    raise exception 'TEST_FAILED [%]: esperado erro % mas a operação foi aceita', p_name, p_code;
  end $f$;

  create function tests_tmp.check(p_ok boolean, p_name text) returns void language plpgsql as $f$
  begin
    if p_ok is not true then
      raise exception 'TEST_FAILED [%]', p_name;
    end if;
  end $f$;

  grant execute on all functions in schema tests_tmp to authenticated, anon;

  -- Início da operação antecipado só nesta transação para permitir histórico.
  update public.app_settings set value = to_jsonb('2026-08-31'::text) where key = 'data_inicio_operacao';

  insert into auth.users (id, email) values
    (v_sup, 't-sup@teste.invalid'), (v_ges, 't-ges@teste.invalid'), (v_vis, 't-vis@teste.invalid'),
    (v_ana, 't-ana@teste.invalid'), (v_bia, 't-bia@teste.invalid'), (v_cai, 't-cai@teste.invalid');

  insert into public.profiles (id, full_name, cpf, username, role, must_change_password) values
    (v_sup, 'Teste Administrador', '52601815906', 'teste.admin', 'admin', false),
    (v_ges, 'Teste Gestor', '08301661305', 'teste.gestor', 'gestor', false),
    (v_vis, 'Teste Visualizador', '18609139034', 'teste.visual', 'visualizador', false),
    (v_ana, 'Ana Teste', '99603082430', 'teste.ana', 'funcionario', false),
    (v_bia, 'Bia Teste', '62819482112', 'teste.bia', 'funcionario', false),
    (v_cai, 'Caio Teste', '99351819019', 'teste.caio', 'funcionario', false);

  select id into v_cat_comb from public.categories where name = 'Combustível';
  select id into v_cat_alim from public.categories where name = 'Alimentação';
  insert into public.categories (name, grupo, active) values ('Teste inativa', 'outras', false)
  returning id into v_cat_inativa;

  -- -------------------------------------------------------------------------
  -- CA01 / CA02 / CA03: gastos individuais, soma diária e semanal
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_ana);
  perform public.save_expense(gen_random_uuid(), v_ana, w1, 15000, v_cat_comb, 'Abastecimento');
  perform public.save_expense(gen_random_uuid(), v_ana, w1 + 1, 3550, v_cat_alim, 'Almoço');
  perform public.save_expense(gen_random_uuid(), v_ana, w1 + 1, 2000, v_cat_alim, 'Lanche');

  select count(*) into v_n from public.expenses where employee_id = v_ana and occurred_on = w1 + 1;
  perform tests_tmp.check(v_n = 2, 'CA01 dois gastos no mesmo dia ficam separados');
  select sum(amount_cents) into v_n from public.expenses where employee_id = v_ana and occurred_on = w1 + 1;
  perform tests_tmp.check(v_n = 5550, 'CA01 soma diária');
  select spent_cents into v_n from public.week_totals(v_ana, w1);
  perform tests_tmp.check(v_n = 20550, 'CA01 soma semanal conta cada gasto uma vez');
  select count(*) into v_n from public.expenses where employee_id = v_ana and category_id = v_cat_comb;
  select coalesce(sum(amount_cents), 0) into v_n2 from public.expenses where employee_id = v_ana and occurred_on = w1 + 2;
  perform tests_tmp.check(v_n = 1 and v_n2 = 0, 'CA02 abastecimento não replica nos dias seguintes');
  select spent_cents into v_n from public.week_totals(v_ana, w3);
  perform tests_tmp.check(v_n = 0, 'CA03 semana/dia vazio soma zero');
  v_passed := v_passed + 5;

  -- -------------------------------------------------------------------------
  -- CA04: data do fato independe do momento do preenchimento; auditoria
  -- -------------------------------------------------------------------------
  v_id := gen_random_uuid();
  perform public.save_expense(v_id, v_ana, w2, 1000, v_cat_alim, 'Preenchido depois');
  select occurred_on into v_txt from public.expenses where id = v_id;
  perform tests_tmp.check(v_txt::date = w2, 'CA04 data do fato preservada');
  perform tests_tmp.logout();
  select count(*) into v_n from public.audit_events
  where entity = 'expenses' and entity_id = v_id and action = 'criado' and actor_id = v_ana
    and occurred_at is not null;
  perform tests_tmp.check(v_n = 1, 'CA04 auditoria registra ator e horário do preenchimento');
  v_passed := v_passed + 2;

  -- -------------------------------------------------------------------------
  -- CA06: vários recebimentos na semana
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_bia);
  perform public.save_receipt(gen_random_uuid(), v_bia, w1, 20000, 'Transferência');
  perform public.save_receipt(gen_random_uuid(), v_bia, w1 + 2, 10000, 'Cartão benefício');
  perform public.save_receipt(gen_random_uuid(), v_bia, w1 + 4, 5050, null);
  select received_cents into v_n from public.week_totals(v_bia, w1);
  perform tests_tmp.check(v_n = 35050, 'CA06 recebimentos da semana somam');
  v_passed := v_passed + 1;

  -- Recebimento com semana de referência diferente da data
  v_id := gen_random_uuid();
  v_res := public.save_receipt(v_id, v_bia, w2 + 1, 700, 'Reembolso semana anterior', w1);
  perform tests_tmp.check((v_res ->> 'week_start')::date = w1, 'Recebimento aceita semana de referência');
  perform public.delete_receipt(v_id);
  v_passed := v_passed + 1;

  -- -------------------------------------------------------------------------
  -- Deduplicação: mesmo id enviado duas vezes não duplica
  -- -------------------------------------------------------------------------
  v_id := gen_random_uuid();
  perform public.save_expense(v_id, v_bia, w1, 999, v_cat_alim, 'Duplo clique');
  v_res := public.save_expense(v_id, v_bia, w1, 999, v_cat_alim, 'Duplo clique');
  select count(*) into v_n from public.expenses where id = v_id;
  perform tests_tmp.check(v_n = 1 and (v_res ->> 'created')::boolean = false, 'CA14 reenvio não duplica');
  perform public.delete_expense(v_id);
  select count(*) into v_n from public.expenses where id = v_id;
  perform tests_tmp.check(v_n = 0, 'Exclusão lógica oculta o registro');
  v_passed := v_passed + 2;

  -- -------------------------------------------------------------------------
  -- Datas
  -- -------------------------------------------------------------------------
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)',
      v_bia, app.week_start(app.today_local()) + 7, v_cat_alim, 'x'),
    'DATA_FUTURA', 'Data após a semana atual é recusada');
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)',
      v_bia, '2026-08-30', v_cat_alim, 'x'),
    'DATA_ANTES_INICIO', 'Data antes do início da operação é recusada');
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 0, %L, %L)', v_bia, w1, v_cat_alim, 'x'),
    'check', 'Valor zero é recusado');
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_bia, w1, v_cat_alim, '   '),
    'check', 'Descrição vazia é recusada');
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_bia, w1, v_cat_inativa, 'x'),
    'CATEGORIA_INATIVA', 'Categoria inativa não aceita novos gastos');
  v_passed := v_passed + 5;

  -- -------------------------------------------------------------------------
  -- CA11: isolamento entre funcionários e papéis sem escrita
  -- -------------------------------------------------------------------------
  select count(*) into v_n from public.expenses where employee_id = v_ana;
  perform tests_tmp.check(v_n = 0, 'CA11 funcionário não consulta outro funcionário');
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_ana, w1, v_cat_alim, 'x'),
    'SEM_PERMISSAO', 'CA11 funcionário não grava para outro');
  perform tests_tmp.expect_error(
    format('insert into public.expenses (week_id, employee_id, occurred_on, amount_cents, category_id, grupo, description, created_by) values (gen_random_uuid(), %L, %L, 1, %L, %L, %L, %L)',
      v_bia, w1, v_cat_alim, 'outras', 'direto', v_bia),
    'permission denied', 'CA09 inserção direta na tabela é negada');
  perform tests_tmp.expect_error(
    'select cpf from public.profiles', 'permission denied', 'CPF não é legível por consulta direta');
  select count(*) into v_n from public.settlements;
  perform tests_tmp.check(v_n = 0, 'Funcionário não vê acertos/saldos');
  perform tests_tmp.expect_error(
    format('select * from public.admin_employee_weeks(%L)', v_bia),
    'SEM_PERMISSAO', 'Funcionário não acessa a função administrativa');
  select count(*) into v_n from public.week_balances(v_bia);
  perform tests_tmp.check(v_n > 0, 'Funcionário vê o fechamento das próprias semanas');
  perform tests_tmp.expect_error(
    format('select * from public.week_balances(%L)', v_ana),
    'SEM_PERMISSAO', 'Funcionário não vê o fechamento de outro funcionário');
  perform tests_tmp.expect_error(
    format('select public.settle_week(%L, %L)', v_bia, w1), 'SEM_PERMISSAO', 'Funcionário não acerta semana');
  v_passed := v_passed + 9;

  perform tests_tmp.login(v_ges);
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_ana, w1, v_cat_alim, 'x'),
    'SEM_PERMISSAO', 'CA11 Gestor não cria despesas');
  perform tests_tmp.expect_error(
    format('select public.save_receipt(gen_random_uuid(), %L, %L, 100)', v_ana, w1),
    'SEM_PERMISSAO', 'CA11 Gestor não cria recebimentos');
  select count(*) into v_n from public.expenses where employee_id = v_ana;
  perform tests_tmp.check(v_n > 0, 'Gestor consulta lançamentos');
  perform tests_tmp.expect_error(
    format('select public.admin_create_profile(gen_random_uuid(), %L, %L, %L, %L)', 'X Y Z', '93786579741', 'novo.user', 'funcionario'),
    'SEM_PERMISSAO', 'Gestor não gerencia contas');
  v_passed := v_passed + 4;

  perform tests_tmp.login(v_vis);
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_ana, w1, v_cat_alim, 'x'),
    'SEM_PERMISSAO', 'CA11 Visualizador não altera lançamentos');
  perform tests_tmp.expect_error(
    format('select public.settle_week(%L, %L)', v_ana, w1), 'SEM_PERMISSAO', 'Visualizador não acerta');
  select count(*) into v_n from public.expenses where employee_id = v_ana;
  perform tests_tmp.check(v_n > 0, 'Visualizador consulta funcionário ativo');
  v_passed := v_passed + 3;

  -- -------------------------------------------------------------------------
  -- CA07: crédito entre semanas (R$300 - R$250 = 50; 50 + 200 - 230 = 20)
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_cai);
  perform public.save_receipt(gen_random_uuid(), v_cai, w1, 30000, 'Transferência');
  perform public.save_expense(gen_random_uuid(), v_cai, w1, 25000, v_cat_comb, 'Gastos semana 1');
  perform public.save_receipt(gen_random_uuid(), v_cai, w2, 20000, 'Transferência');
  perform public.save_expense(gen_random_uuid(), v_cai, w2, 23000, v_cat_comb, 'Gastos semana 2');

  perform tests_tmp.login(v_ges);
  v_res := public.settle_week(v_cai, w1);
  perform tests_tmp.check((v_res ->> 'balance_cents')::bigint = 5000, 'CA07 primeira semana encerra com crédito 50');
  v_res := public.settle_week(v_cai, w2);
  perform tests_tmp.check((v_res ->> 'credit_before_cents')::bigint = 5000
    and (v_res ->> 'balance_cents')::bigint = 2000, 'CA07 crédito 50 + 200 - 230 = 20');
  select count(*) into v_n from public.admin_employee_weeks(v_cai) where status = 'acertada';
  perform tests_tmp.check(v_n = 2, 'Visão financeira mostra semanas acertadas');
  perform tests_tmp.login(v_cai);
  select balance_cents into v_n from public.week_balances(v_cai) where week_start = w2;
  perform tests_tmp.check(v_n = 2000, 'Funcionário vê crédito final igual ao acerto (50 + 200 - 230 = 20)');
  v_passed := v_passed + 4;

  -- -------------------------------------------------------------------------
  -- CA09: bloqueio após acerto, inclusive por requisição direta
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_cai);
  select id into v_id from public.expenses where employee_id = v_cai and occurred_on = w1 limit 1;
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_cai, w1 + 3, v_cat_alim, 'x'),
    'SEMANA_ACERTADA', 'CA09 nova despesa em semana acertada');
  perform tests_tmp.expect_error(
    format('select public.save_expense(%L, %L, %L, 100, %L, %L)', v_id, v_cai, w1, v_cat_alim, 'x'),
    'SEMANA_ACERTADA', 'CA09 edição de despesa em semana acertada');
  perform tests_tmp.expect_error(
    format('select public.delete_expense(%L)', v_id), 'SEMANA_ACERTADA', 'CA09 exclusão em semana acertada');
  perform tests_tmp.expect_error(
    format('select public.save_receipt(gen_random_uuid(), %L, %L, 100)', v_cai, w1 + 1),
    'SEMANA_ACERTADA', 'CA09 recebimento em semana acertada');
  perform tests_tmp.expect_error(
    format('select public.save_route(gen_random_uuid(), %L, %L, %L, %L)', v_cai, w1 + 1, 'São Paulo', 'Campinas'),
    'SEMANA_ACERTADA', 'CA09 percurso em semana acertada');
  -- Mover despesa de semana aberta para semana acertada
  v_id2 := gen_random_uuid();
  perform public.save_expense(v_id2, v_cai, w3, 100, v_cat_alim, 'Semana aberta');
  perform tests_tmp.expect_error(
    format('select public.save_expense(%L, %L, %L, 100, %L, %L)', v_id2, v_cai, w1, v_cat_alim, 'mover'),
    'SEMANA_ACERTADA', 'Mover lançamento exige semana de destino aberta');
  perform public.delete_expense(v_id2);
  v_passed := v_passed + 6;

  -- Administrador também não altera semana acertada sem reabrir
  perform tests_tmp.login(v_sup);
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_cai, w1, v_cat_alim, 'x'),
    'SEMANA_ACERTADA', 'Administrador precisa reabrir antes de alterar');
  v_passed := v_passed + 1;

  -- -------------------------------------------------------------------------
  -- CA10: reabrir semana antiga invalida acertos posteriores (explícito e auditado)
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_ges);
  perform tests_tmp.expect_error(
    format('select public.reopen_week(%L, %L, %L)', v_cai, w1, 'ok'),
    'MOTIVO_OBRIGATORIO', 'Reabertura exige motivo');
  v_res := public.reopen_week(v_cai, w1, 'Correção de valor informado');
  perform tests_tmp.check(jsonb_array_length(v_res -> 'reopened') = 2, 'CA10 reabertura devolve semanas afetadas');
  select count(*) into v_n from public.employee_weeks where employee_id = v_cai and status = 'acertada';
  perform tests_tmp.check(v_n = 0, 'CA10 semanas posteriores voltam a aberta');
  select count(*) into v_n from public.settlements where employee_id = v_cai and not valid;
  perform tests_tmp.check(v_n = 2, 'CA10 acertos afetados ficam invalidados, não apagados');

  perform tests_tmp.login(v_cai);
  perform public.save_expense(gen_random_uuid(), v_cai, w1 + 3, 1000, v_cat_alim, 'Correção');
  perform tests_tmp.check(true, 'CA09 reabertura devolve edição');

  perform tests_tmp.login(v_ges);
  perform tests_tmp.expect_error(
    format('select public.settle_week(%L, %L)', v_cai, w2), 'SEMANA_ANTERIOR_PENDENTE',
    'Acerto em sequência: semana anterior pendente bloqueia');
  v_res := public.settle_week(v_cai, w1);
  perform tests_tmp.check((v_res ->> 'balance_cents')::bigint = 4000, 'Recalcula crédito após reabertura');
  v_res := public.settle_week(v_cai, w2);
  perform tests_tmp.check((v_res ->> 'balance_cents')::bigint = 1000, 'Semana seguinte recalculada');

  perform tests_tmp.logout();
  select count(*) into v_n from public.audit_events
  where employee_id = v_cai and reason = 'Correção de valor informado' and actor_id = v_ges;
  perform tests_tmp.check(v_n >= 3, 'CA09 reabertura registra motivo e autor');
  select count(*) into v_n from public.audit_events
  where employee_id = v_cai and entity = 'settlements' and action = 'acerto_invalidado';
  perform tests_tmp.check(v_n = 2, 'CA10 invalidação auditada');
  v_passed := v_passed + 9;

  -- -------------------------------------------------------------------------
  -- CA08: diferença negativa impede acerto sem bloquear a semana seguinte
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_ana);
  perform public.save_receipt(gen_random_uuid(), v_ana, w4, 30000, 'Transferência');
  perform public.save_expense(gen_random_uuid(), v_ana, w4, 35000, v_cat_comb, 'Viagem');

  perform tests_tmp.login(v_ges);
  -- Ana tem lançamentos abertos em w1 e w2: acerte-os primeiro (sem diferença).
  perform tests_tmp.login(v_ana);
  perform public.save_receipt(gen_random_uuid(), v_ana, w1, 20550, 'Acerto w1');
  perform public.save_receipt(gen_random_uuid(), v_ana, w2, 1000, 'Acerto w2');
  perform tests_tmp.login(v_ges);
  perform public.settle_week(v_ana, w1);
  perform public.settle_week(v_ana, w2);

  perform tests_tmp.expect_error(
    format('select public.settle_week(%L, %L)', v_ana, w4), 'SALDO_NEGATIVO', 'CA08 saldo negativo impede acerto');
  perform tests_tmp.login(v_ana);
  perform public.save_expense(gen_random_uuid(), v_ana, w4 + 7, 1200, v_cat_alim, 'Semana seguinte');
  perform tests_tmp.check(true, 'CA08 semana seguinte continua liberada');
  perform public.save_receipt(gen_random_uuid(), v_ana, w4 + 3, 5000, 'Complemento');
  perform tests_tmp.login(v_ges);
  v_res := public.settle_week(v_ana, w4);
  perform tests_tmp.check((v_res ->> 'balance_cents')::bigint = 0, 'CA08 após complemento encerra com saldo zero');
  v_passed := v_passed + 3;

  -- Controle otimista: versão desatualizada impede acerto com números antigos
  select version into v_n from public.employee_weeks where employee_id = v_bia and week_start = w1;
  perform tests_tmp.login(v_bia);
  perform public.save_expense(gen_random_uuid(), v_bia, w1, 100, v_cat_alim, 'Chegou depois');
  perform tests_tmp.login(v_ges);
  perform tests_tmp.expect_error(
    format('select public.settle_week(%L, %L, %s)', v_bia, w1, v_n), 'VERSAO_DESATUALIZADA',
    'Acerto recusa versão desatualizada');
  v_passed := v_passed + 1;

  -- -------------------------------------------------------------------------
  -- CA12: desativação bloqueia operações imediatamente e preserva histórico
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_sup);
  perform public.admin_set_active(v_cai, false, 'Desligamento');
  perform tests_tmp.login(v_cai);
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_cai, w3, v_cat_alim, 'x'),
    'NAO_AUTENTICADO', 'CA12 conta desativada não grava com sessão aberta');
  select count(*) into v_n from public.expenses;
  perform tests_tmp.check(v_n = 0, 'CA12 conta desativada não consulta');
  perform tests_tmp.login(v_vis);
  select count(*) into v_n from public.expenses where employee_id = v_cai;
  perform tests_tmp.check(v_n = 0, 'CA11 Visualizador não acessa desativados');
  select count(*) into v_n from public.profiles where id = v_cai;
  perform tests_tmp.check(v_n = 0, 'Visualizador não vê cartão de desativado');
  perform tests_tmp.login(v_ges);
  select count(*) into v_n from public.expenses where employee_id = v_cai;
  perform tests_tmp.check(v_n > 0, 'CA12 histórico preservado e visível ao Gestor');
  v_passed := v_passed + 5;

  -- -------------------------------------------------------------------------
  -- Administrador: alteração auditada e sessão de suporte
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_sup);
  v_res := public.start_support_session(v_bia);
  v_session := (v_res ->> 'id')::uuid;
  v_id := gen_random_uuid();
  perform public.save_expense(v_id, v_bia, w3, 4500, v_cat_alim, 'Lançado pelo suporte',
    p_support_session => v_session);
  perform tests_tmp.logout();
  select count(*) into v_n from public.audit_events
  where entity_id = v_id and actor_id = v_sup and support_session_id = v_session and employee_id = v_bia;
  perform tests_tmp.check(v_n = 1, 'CA15 suporte registra o Administrador como autor');
  update public.support_sessions set expires_at = now() - interval '1 minute' where id = v_session;
  perform tests_tmp.login(v_sup);
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L, p_support_session => %L)',
      v_bia, w3, v_cat_alim, 'x', v_session),
    'SUPORTE_EXPIRADO', 'Sessão de suporte expirada é recusada');
  select count(*) into v_n from public.current_support_session(v_session);
  perform tests_tmp.check(v_n = 0, 'Sessão expirada não é considerada ativa');
  perform tests_tmp.login(v_ges);
  perform tests_tmp.expect_error(
    format('select public.start_support_session(%L)', v_bia), 'SEM_PERMISSAO', 'Somente Administrador inicia suporte');
  v_passed := v_passed + 4;

  -- -------------------------------------------------------------------------
  -- CPF opcional: vazio vira null; se informado, validado e único
  -- -------------------------------------------------------------------------
  perform tests_tmp.logout();
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000020', 't-semcpf1@teste.invalid'),
    ('00000000-0000-4000-8000-000000000021', 't-semcpf2@teste.invalid'),
    ('00000000-0000-4000-8000-000000000022', 't-cpfdup@teste.invalid');
  perform tests_tmp.login(v_sup);
  perform public.admin_create_profile('00000000-0000-4000-8000-000000000020', 'Sem Cpf Um', '', 'teste.semcpf1', 'funcionario');
  perform public.admin_create_profile('00000000-0000-4000-8000-000000000021', 'Sem Cpf Dois', null, 'teste.semcpf2', 'funcionario');
  perform tests_tmp.logout();
  select count(*) into v_n from public.profiles where username in ('teste.semcpf1', 'teste.semcpf2') and cpf is null;
  perform tests_tmp.check(v_n = 2, 'Contas sem CPF são aceitas (vazio vira null)');
  perform tests_tmp.login(v_sup);
  perform tests_tmp.expect_error(
    format('select public.admin_create_profile(%L, %L, %L, %L, %L)',
      '00000000-0000-4000-8000-000000000022', 'Cpf Duplicado', '62819482112', 'teste.cpfdup', 'funcionario'),
    'CPF_DUPLICADO', 'CPF informado continua único');
  perform tests_tmp.expect_error(
    format('select public.admin_create_profile(%L, %L, %L, %L, %L)',
      '00000000-0000-4000-8000-000000000022', 'Cpf Invalido', '12345678900', 'teste.cpfdup', 'funcionario'),
    'CPF_INVALIDO', 'CPF informado continua validado');
  perform public.admin_update_profile('00000000-0000-4000-8000-000000000020', 'Sem Cpf Um', '54323194897', 'teste.semcpf1', 'funcionario', 'neutro');
  perform public.admin_update_profile('00000000-0000-4000-8000-000000000020', 'Sem Cpf Um', '', 'teste.semcpf1', 'funcionario', 'neutro');
  perform tests_tmp.logout();
  select count(*) into v_n from public.profiles where username = 'teste.semcpf1' and cpf is null;
  perform tests_tmp.check(v_n = 1, 'CPF pode ser incluído e removido na edição');
  v_passed := v_passed + 4;

  -- -------------------------------------------------------------------------
  -- Unidade: opcional; grafia padronizada pela primeira cadastrada
  -- -------------------------------------------------------------------------
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-000000000023', 't-emp1@teste.invalid'),
    ('00000000-0000-4000-8000-000000000024', 't-emp2@teste.invalid');
  perform tests_tmp.login(v_sup);
  perform public.admin_create_profile('00000000-0000-4000-8000-000000000023', 'Unidade Um', null, 'teste.uni1', 'funcionario', 'neutro', '  Unidade   Teste E2E ');
  perform public.admin_create_profile('00000000-0000-4000-8000-000000000024', 'Unidade Dois', null, 'teste.uni2', 'funcionario', 'neutro', 'UNIDADE TESTE e2e');
  perform public.admin_update_profile('00000000-0000-4000-8000-000000000020', 'Sem Cpf Um', '', 'teste.semcpf1', 'funcionario', 'neutro', '');
  perform tests_tmp.logout();
  select count(*) into v_n from public.profiles where username in ('teste.uni1', 'teste.uni2') and unit = 'Unidade Teste E2E';
  perform tests_tmp.check(v_n = 2, 'Unidade: espaços normalizados e grafia existente reaproveitada');
  select count(*) into v_n from public.profiles where username = 'teste.semcpf1' and unit is null;
  perform tests_tmp.check(v_n = 1, 'Unidade vazia fica sem unidade');
  perform tests_tmp.login(v_vis);
  select count(*) into v_n from public.profiles where username = 'teste.uni1' and unit is not null;
  perform tests_tmp.check(v_n = 1, 'Unidade visível no cartão para a administração');
  perform tests_tmp.logout();
  v_passed := v_passed + 3;

  -- Conta criada com senha definida pelo Administrador: sem troca obrigatória
  insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000025', 't-senhadef@teste.invalid');
  perform tests_tmp.login(v_sup);
  perform public.admin_create_profile('00000000-0000-4000-8000-000000000025', 'Senha Definida', null, 'teste.senhadef',
    'funcionario', 'neutro', null, false);
  perform tests_tmp.logout();
  select count(*) into v_n from public.profiles
  where username = 'teste.senhadef' and not must_change_password and temp_password_expires_at is null;
  perform tests_tmp.check(v_n = 1, 'Senha definida: sem troca obrigatória nem validade temporária');
  select count(*) into v_n from public.profiles
  where username = 'teste.uni1' and must_change_password and temp_password_expires_at is not null;
  perform tests_tmp.check(v_n = 1, 'Padrão continua sendo senha temporária com troca obrigatória');
  select count(*) into v_n from public.audit_events
  where entity_id = '00000000-0000-4000-8000-000000000025' and reason = 'Conta criada com senha definida pelo Administrador' and actor_id = v_sup;
  perform tests_tmp.check(v_n = 1, 'Criação com senha definida é auditada');
  v_passed := v_passed + 3;

  -- -------------------------------------------------------------------------
  -- Anexos
  -- -------------------------------------------------------------------------
  perform tests_tmp.login(v_bia);
  v_id := gen_random_uuid();
  perform public.save_expense(v_id, v_bia, w3, 2500, v_cat_alim, 'Com comprovante', p_has_receipt => true);
  select count(*) into v_n from public.expenses where id = v_id and has_receipt;
  perform tests_tmp.check(v_n = 1, 'CA13 comprovante "sim" sem anexo permite salvar');
  perform tests_tmp.expect_error(
    format('select public.register_attachment(gen_random_uuid(), %L, %L)', v_id, v_bia || '/' || v_id || '/a.jpg'),
    'ARQUIVO_NAO_ENCONTRADO', 'Anexo exige arquivo enviado');
  perform tests_tmp.expect_error(
    format('select public.register_attachment(gen_random_uuid(), %L, %L)', v_id, v_ana || '/' || v_id || '/a.jpg'),
    'ARQUIVO_INVALIDO', 'Caminho de anexo fora da pasta do lançamento');
  perform tests_tmp.logout();
  insert into storage.objects (bucket_id, name, metadata)
  values ('comprovantes', v_bia || '/' || v_id || '/a.jpg', '{"mimetype":"image/jpeg","size":2048}'),
         ('comprovantes', v_bia || '/' || v_id || '/b.exe', '{"mimetype":"application/x-msdownload","size":2048}');
  perform tests_tmp.login(v_bia);
  v_id2 := gen_random_uuid();
  perform public.register_attachment(v_id2, v_id, v_bia || '/' || v_id || '/a.jpg', 'foto.jpg');
  perform public.register_attachment(v_id2, v_id, v_bia || '/' || v_id || '/a.jpg', 'foto.jpg');
  select count(*) into v_n from public.attachments where expense_id = v_id;
  perform tests_tmp.check(v_n = 1, 'Registro de anexo é idempotente');
  perform tests_tmp.expect_error(
    format('select public.register_attachment(gen_random_uuid(), %L, %L)', v_id, v_bia || '/' || v_id || '/b.exe'),
    'TIPO_ARQUIVO_INVALIDO', 'Tipo de arquivo validado no servidor');
  perform tests_tmp.login(v_ana);
  select count(*) into v_n from public.attachments where expense_id = v_id;
  perform tests_tmp.check(v_n = 0, 'CA13 anexo não visível a outro funcionário');
  v_passed := v_passed + 6;

  -- -------------------------------------------------------------------------
  -- Acerto automático
  -- -------------------------------------------------------------------------
  perform tests_tmp.logout();
  insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000030', 't-dan@teste.invalid');
  insert into public.profiles (id, full_name, username, role, must_change_password)
  values ('00000000-0000-4000-8000-000000000030', 'Dan Teste', 'teste.dan', 'funcionario', false);
  perform tests_tmp.login('00000000-0000-4000-8000-000000000030');
  -- w1: 300 - 250 = 50 (crédito)  | w2: 50 + 100 - 180 = -30 (empresa deve) | w3: +100 - 40
  perform public.save_receipt(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w1, 30000, 'r');
  perform public.save_expense(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w1, 25000, v_cat_comb, 'g');
  perform public.save_receipt(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w2, 10000, 'r');
  perform public.save_expense(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w2, 18000, v_cat_comb, 'g');
  perform public.save_receipt(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w3, 10000, 'r');
  perform public.save_expense(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w3, 4000, v_cat_alim, 'g');
  perform tests_tmp.logout();

  -- Alterada há menos de 30 minutos: não fecha (não interrompe quem está lançando)
  perform tests_tmp.check(app.auto_settle_employee('00000000-0000-4000-8000-000000000030') = 0,
    'Acerto automático espera 30 min sem alterações');
  update public.employee_weeks set last_activity_at = now() - interval '2 hours'
  where employee_id = '00000000-0000-4000-8000-000000000030';

  perform tests_tmp.login(v_ges);
  select owed_cents into v_n from public.admin_owed_summary() where employee_id = '00000000-0000-4000-8000-000000000030';
  perform tests_tmp.check(v_n = 8000, 'Resumo mostra quanto a empresa deve (w2: 0 + 100 - 180 = -80; w3 positivo)');
  perform tests_tmp.logout();

  perform tests_tmp.check(app.auto_settle_employee('00000000-0000-4000-8000-000000000030') = 1,
    'Acerta sozinha a semana com crédito e para na que tem valor a receber');
  select count(*) into v_n from public.settlements
  where employee_id = '00000000-0000-4000-8000-000000000030' and week_start = w1 and valid and automatic
    and settled_by is null and balance_cents = 5000;
  perform tests_tmp.check(v_n = 1, 'Acerto automático grava instantâneo (crédito 50) sem autor humano');
  select count(*) into v_n from public.employee_weeks
  where employee_id = '00000000-0000-4000-8000-000000000030' and status = 'aberta' and week_start in (w2, w3);
  perform tests_tmp.check(v_n = 2, 'Semana com valor a receber segura as seguintes (ordem do crédito)');
  select count(*) into v_n from public.audit_events
  where employee_id = '00000000-0000-4000-8000-000000000030' and reason = 'Acerto automático' and actor_id is null;
  perform tests_tmp.check(v_n >= 2, 'Acerto automático é auditado');

  -- Funcionário lança o recebimento que cobre a diferença -> fecha em cadeia
  perform tests_tmp.login('00000000-0000-4000-8000-000000000030');
  perform public.save_receipt(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', w2 + 2, 3000, 'complemento', w2);
  perform tests_tmp.logout();
  update public.employee_weeks set last_activity_at = now() - interval '2 hours'
  where employee_id = '00000000-0000-4000-8000-000000000030';
  perform tests_tmp.check(app.auto_settle_employee('00000000-0000-4000-8000-000000000030') = 2,
    'Recebimento lançado: semana pendente e a seguinte fecham sozinhas');
  select balance_cents into v_n from public.settlements
  where employee_id = '00000000-0000-4000-8000-000000000030' and week_start = w3 and valid;
  perform tests_tmp.check(v_n = 6000, 'Crédito encadeado correto (0 + 100 - 40 = 60)');

  -- Semana atual (dentro da tolerância) não fecha
  perform tests_tmp.login('00000000-0000-4000-8000-000000000030');
  perform public.save_receipt(gen_random_uuid(), '00000000-0000-4000-8000-000000000030', app.today_local(), 1000, 'r');
  perform tests_tmp.logout();
  update public.employee_weeks set last_activity_at = now() - interval '2 hours'
  where employee_id = '00000000-0000-4000-8000-000000000030';
  perform tests_tmp.check(app.auto_settle_employee('00000000-0000-4000-8000-000000000030') = 0,
    'Semana atual não fecha antes da tolerância');

  -- Reaberta pelo gestor: ganha novo prazo antes de fechar de novo
  perform tests_tmp.login(v_ges);
  perform public.reopen_week('00000000-0000-4000-8000-000000000030', w3, 'Correção solicitada pelo funcionário');
  perform tests_tmp.logout();
  update public.employee_weeks set last_activity_at = now() - interval '2 hours'
  where employee_id = '00000000-0000-4000-8000-000000000030';
  perform tests_tmp.check(app.auto_settle_employee('00000000-0000-4000-8000-000000000030') = 0,
    'Semana reaberta não é fechada de novo antes do novo prazo');
  perform tests_tmp.login(v_bia);
  perform tests_tmp.expect_error('select public.run_auto_settlement()', 'permission denied',
    'Usuário não dispara a rotina de acerto automático');
  perform tests_tmp.expect_error('select * from public.admin_owed_summary()', 'SEM_PERMISSAO',
    'Funcionário não vê o resumo de valores devidos');
  perform tests_tmp.logout();
  v_passed := v_passed + 12;

  -- -------------------------------------------------------------------------
  -- anon não acessa nada
  -- -------------------------------------------------------------------------
  perform tests_tmp.logout();
  execute 'set local role anon';
  perform tests_tmp.expect_error('select count(*) from public.expenses', 'permission denied', 'anon sem acesso a despesas');
  perform tests_tmp.expect_error(
    format('select public.save_expense(gen_random_uuid(), %L, %L, 100, %L, %L)', v_ana, w1, v_cat_alim, 'x'),
    'permission denied', 'anon não executa RPC');
  execute 'reset role';
  v_passed := v_passed + 2;

  raise exception 'TESTS_OK % casos aprovados', v_passed;
end
$tests$;
