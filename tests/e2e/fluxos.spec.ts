import { expect, test, type Browser, type Page } from "@playwright/test";
import { loadState, sql, type Person } from "./fixtures";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function login(page: Page, p: Person, password = p.password) {
  await page.goto("/login");
  await page.getByLabel("Usuário").fill(p.username);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function asUser(browser: Browser, p: Person) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, p);
  await page.waitForURL(/\/(inicio|admin)/);
  return page;
}

async function addExpense(page: Page, amount: string, category: string, description: string) {
  await page.goto("/lancar/despesa");
  await page.getByLabel("Valor (R$)").fill(amount);
  await page.getByLabel("Categoria").selectOption({ label: category });
  await page.getByLabel("Descrição").fill(description);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForURL(/\/inicio/);
}

async function addReceipt(page: Page, amount: string, description = "") {
  await page.goto("/lancar/recebimento");
  await page.getByLabel("Valor (R$)").fill(amount);
  if (description) await page.getByLabel("Descrição (opcional)").fill(description);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await page.waitForURL(/\/inicio/);
}

async function noHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

const s = () => loadState();

test.describe.serial("Relatório Semanal", () => {
  test("login: senha errada, limite de tentativas e mensagem simples", async ({ page }) => {
    await login(page, s().ana, "senha-errada-1");
    await expect(page.getByText("Usuário ou senha incorretos.")).toBeVisible();
    const ghost = { id: "", username: "teste.e2e.bloqueio", password: "x", name: "" };
    for (let i = 0; i < 5; i++) {
      await login(page, ghost, `errada-${i}`);
      await expect(page.getByText("Usuário ou senha incorretos.")).toBeVisible();
    }
    await login(page, ghost, "outra");
    await expect(page.getByText(/Muitas tentativas/)).toBeVisible();
  });

  test("CA15: primeiro acesso exige troca de senha", async ({ page }) => {
    const novo = s().novo;
    await login(page, novo);
    await page.waitForURL(/\/trocar-senha/);
    // Não consegue pular a troca
    await page.goto("/inicio");
    await page.waitForURL(/\/trocar-senha/);
    await page.getByLabel("Nova senha", { exact: true }).fill("curta");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(page.getByText(/pelo menos 8 caracteres/)).toBeVisible();
    await page.getByLabel("Nova senha", { exact: true }).fill("novaSenha123");
    // Pode ver o que digitou
    await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Mostrar senha" }).first().click();
    await expect(page.getByLabel("Nova senha", { exact: true })).toHaveAttribute("type", "text");
    await expect(page.getByLabel("Nova senha", { exact: true })).toHaveValue("novaSenha123");
    await page.getByLabel("Repita a nova senha").fill("novaSenha123");
    await page.getByRole("button", { name: "Salvar nova senha" }).click();
    await page.waitForURL(/\/inicio/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const [row] = await sql<{ must_change_password: boolean }>(
      "select must_change_password from public.profiles where id = $1",
      [novo.id],
    );
    expect(row.must_change_password).toBe(false);
  });

  test("CA01/CA02/CA06: funcionário lança despesas e recebimentos; totais conferem", async ({ browser }) => {
    const page = await asUser(browser, s().ana);
    await expect(page.getByText("Semana atual").first()).toBeVisible();
    await expect(page.getByText("Olá, Ana!")).toBeVisible();
    // Esboço de carregamento aparece logo ao trocar de tela (resposta atrasada de propósito)
    await page.route("**/semanas**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.getByRole("link", { name: "Semanas anteriores" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Carregando" })).toBeAttached();
    await page.waitForURL(/\/semanas/);
    await page.unroute("**/semanas**");
    await addExpense(page, "150,00", "Combustível", "Abastecimento posto");
    await addExpense(page, "35,50", "Alimentação", "Almoço");
    await addExpense(page, "20", "Alimentação", "Lanche");
    await addReceipt(page, "150,00", "Transferência");
    await addReceipt(page, "50,00", "Cartão benefício");

    await expect(page.getByText("R$ 205,50").first()).toBeVisible(); // total gasto
    await expect(page.getByText("R$ 200,00").first()).toBeVisible(); // total recebido
    // Dois gastos no mesmo dia aparecem separados
    await expect(page.getByText("Almoço")).toBeVisible();
    await expect(page.getByText("Lanche")).toBeVisible();
    // Fechamento visível ao funcionário: 0 + 200 − 205,50
    await expect(page.getByText("Crédito da semana anterior")).toBeVisible();
    await expect(page.getByText("A receber da empresa")).toBeVisible();
    await expect(page.getByText("R$ 5,50").first()).toBeVisible();
    await page.context().close();
  });

  test("CA13: comprovante com foto e PDF; anexo acessível só a quem pode ver", async ({ browser }) => {
    const ana = await asUser(browser, s().ana);
    await ana.goto("/lancar/despesa");
    await ana.getByLabel("Valor (R$)").fill("12,00");
    await ana.getByLabel("Categoria").selectOption({ label: "Estacionamento e pedágio" });
    await ana.getByLabel("Descrição").fill("Estacionamento com comprovante");
    await ana.getByRole("radio", { name: "Sim" }).click();
    await expect(ana.getByText("Anexe o comprovante aqui")).toBeVisible();
    await ana.locator("#files").setInputFiles([
      { name: "recibo.png", mimeType: "image/png", buffer: PNG },
      { name: "nota.pdf", mimeType: "application/pdf", buffer: PDF },
    ]);
    await ana.getByRole("button", { name: "Salvar", exact: true }).click();
    await ana.waitForURL(/\/inicio/);
    const link = ana.getByRole("link", { name: "anexo 1" });
    await expect(link).toBeVisible();
    await expect(ana.getByRole("link", { name: "anexo 2" })).toBeVisible();
    const href = (await link.getAttribute("href"))!;

    const own = await ana.request.get(href, { maxRedirects: 0 });
    expect(own.status()).toBe(302);
    expect(own.headers()["location"]).toContain("/storage/v1/object/sign/comprovantes/");

    const bia = await asUser(browser, s().bia);
    const other = await bia.request.get(href, { maxRedirects: 0 });
    expect(other.status()).toBe(404);

    // "Sim" sem anexo também salva
    await ana.goto("/lancar/despesa");
    await ana.getByLabel("Valor (R$)").fill("8,00");
    await ana.getByLabel("Categoria").selectOption({ label: "Impressão" });
    await ana.getByLabel("Descrição").fill("Impressão sem anexo");
    await ana.getByRole("radio", { name: "Sim" }).click();
    await ana.getByRole("button", { name: "Salvar", exact: true }).click();
    await ana.waitForURL(/\/inicio/);
    await expect(ana.getByText("Impressão sem anexo")).toBeVisible();
    await ana.context().close();
    await bia.context().close();
  });

  test("CA14: falha de rede preserva o formulário e reenvio não duplica", async ({ browser }) => {
    const page = await asUser(browser, s().bia);
    await page.goto("/lancar/despesa");
    await page.getByLabel("Valor (R$)").fill("77,70");
    await page.getByLabel("Categoria").selectOption({ label: "Alimentação" });
    await page.getByLabel("Descrição").fill("Teste sem internet");
    await page.route("**/lancar/despesa**", (route) =>
      route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
    );
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Não salvou")).toBeVisible();
    await expect(page.getByLabel("Valor (R$)")).toHaveValue("77,70");
    await expect(page.getByLabel("Descrição")).toHaveValue("Teste sem internet");
    await page.unroute("**/lancar/despesa**");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await page.waitForURL(/\/inicio/);
    const rows = await sql("select id from public.expenses where employee_id = $1 and description = 'Teste sem internet'", [
      s().bia.id,
    ]);
    expect(rows).toHaveLength(1);
    await page.context().close();
  });

  test("CA08/CA09: acerto bloqueado com diferença, liberado após complemento; semana encerrada fica só leitura; reabertura com motivo", async ({
    browser,
  }) => {
    const ana = s().ana;
    const gestor = await asUser(browser, s().gestor);
    await gestor.goto(`/admin/funcionarios/${ana.id}`);
    await expect(gestor.getByText("A acertar")).toBeVisible();
    await expect(gestor.getByText("R$ 25,50").first()).toBeVisible(); // 200 - 225,50
    await expect(gestor.getByRole("button", { name: "Acertar semana" })).toBeDisabled();

    const func = await asUser(browser, ana);
    await addReceipt(func, "25,50", "Complemento");

    await gestor.reload();
    await gestor.getByRole("button", { name: "Acertar semana" }).click();
    await gestor.getByRole("button", { name: "Confirmar acerto" }).click();
    await expect(gestor.getByText("Acertada em")).toBeVisible();

    await func.goto("/inicio");
    await expect(func.getByText("Encerrada", { exact: true })).toBeVisible();
    await expect(func.getByRole("link", { name: /Adicionar despesa/ })).toHaveCount(0);
    await expect(func.getByRole("link", { name: /Editar despesa/ })).toHaveCount(0);
    await func.goto("/lancar/despesa");
    await func.getByLabel("Valor (R$)").fill("1,00");
    await func.getByLabel("Categoria").selectOption({ label: "Outros" });
    await func.getByLabel("Descrição").fill("Depois do acerto");
    await func.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(func.getByText("Esta semana já foi encerrada e não pode ser alterada.")).toBeVisible();

    await gestor.getByRole("button", { name: "Reabrir semana" }).click();
    await gestor.getByLabel("Motivo (obrigatório)").fill("Funcionária precisa corrigir um valor");
    await gestor.getByRole("button", { name: "Reabrir", exact: true }).click();
    await expect(gestor.getByRole("button", { name: "Acertar semana" })).toBeVisible();

    await func.goto("/inicio");
    await expect(func.getByRole("link", { name: /Adicionar despesa/ })).toBeVisible();
    const audit = await sql(
      "select 1 from public.audit_events where employee_id = $1 and reason = 'Funcionária precisa corrigir um valor' and actor_id = $2",
      [ana.id, s().gestor.id],
    );
    expect(audit.length).toBeGreaterThan(0);
    await gestor.context().close();
    await func.context().close();
  });

  test("CA11/CA12: desativação derruba sessão aberta; Visualizador não vê desativados; Gestor vê histórico", async ({ browser }) => {
    const caio = s().caio;
    const caioPage = await asUser(browser, caio);
    await addExpense(caioPage, "10,00", "Outros", "Gasto do Caio");

    const sup = await asUser(browser, s().admin);
    await sup.goto(`/admin/contas/${caio.id}`);
    await sup.getByRole("button", { name: "Desativar conta" }).click();
    await sup.getByRole("button", { name: "Desativar", exact: true }).click();
    await expect(sup.getByRole("button", { name: "Reativar conta" })).toBeVisible();

    await caioPage.goto("/inicio");
    await caioPage.waitForURL(/\/login/);

    const vis = await asUser(browser, s().visual);
    await expect(vis.getByText(s().ana.name)).toBeVisible();
    await expect(vis.getByText(caio.name)).toHaveCount(0);
    const direct = await vis.goto(`/admin/funcionarios/${caio.id}`);
    expect(direct?.status()).toBe(404);
    await expect(vis.getByText("Gasto do Caio")).toHaveCount(0);
    await expect(vis.getByRole("button", { name: "Acertar semana" })).toHaveCount(0);

    const ges = await asUser(browser, s().gestor);
    await ges.goto(`/admin/funcionarios/${caio.id}`);
    await expect(ges.getByText("Conta desativada")).toBeVisible();

    // Funcionário não acessa painel nem dados de outro
    const bia = await asUser(browser, s().bia);
    await bia.goto(`/admin/funcionarios/${s().ana.id}`);
    await bia.waitForURL(/\/inicio/);
    for (const p of [caioPage, sup, vis, ges, bia]) await p.context().close();
  });

  test("CA15: Administrador cria conta com senha temporária e usa modo de suporte auditado", async ({ browser }) => {
    const sup = await asUser(browser, s().admin);
    await sup.goto("/admin/contas/nova");
    await sup.getByLabel("Nome completo").fill("Conta Criada E2E");
    // CPF é opcional
    await sup.getByLabel("Usuário de acesso").fill("teste.e2e.criado");
    await sup.getByLabel("Unidade (opcional)").fill("Unidade E2E");
    await sup.getByRole("button", { name: "Criar conta" }).click();
    await expect(sup.getByText("Senha temporária", { exact: true })).toBeVisible();
    const temp = (await sup.locator("p.font-mono").textContent())!.trim();
    expect(temp).toMatch(/^\d{6}$/);

    // Conta criada já com senha definida: entra direto, sem trocar
    await sup.goto("/admin/contas/nova");
    await sup.getByLabel("Nome completo").fill("Senha Definida E2E");
    await sup.getByLabel("Usuário de acesso").fill("teste.e2e.definida");
    await sup.getByRole("radio", { name: /Definir a senha agora/ }).click();
    await sup.getByLabel("Senha", { exact: true }).fill("curta");
    await sup.getByRole("button", { name: "Criar conta" }).click();
    await expect(sup.getByText(/pelo menos 8 caracteres/)).toBeVisible();
    await sup.getByLabel("Senha", { exact: true }).fill("Definida123");
    await sup.getByLabel("Repita a senha").fill("Definida123");
    await sup.getByRole("button", { name: "Criar conta" }).click();
    await expect(sup.getByText("Conta criada")).toBeVisible();
    await expect(sup.locator("p.font-mono")).toHaveCount(0); // nenhuma senha temporária exibida
    {
      const c2 = await browser.newContext();
      const p2 = await c2.newPage();
      await login(p2, { id: "", username: "teste.e2e.definida", password: "Definida123", name: "" });
      await p2.waitForURL(/\/inicio/);
      await c2.close();
    }

    // CPF duplicado é recusado
    await sup.goto("/admin/contas/nova");
    await sup.getByLabel("Nome completo").fill("Duplicado");
    await sup.getByLabel("CPF (opcional)").fill("52601815906"); // CPF da conta fictícia "ana"
    await sup.getByLabel("Usuário de acesso").fill("teste.e2e.dup");
    await sup.getByRole("button", { name: "Criar conta" }).click();
    await expect(sup.getByText("Já existe uma conta com este CPF.").first()).toBeVisible();

    // Selo da unidade no cartão do painel
    await sup.goto("/admin");
    const card = sup.getByRole("link", { name: /Conta Criada E2E/ });
    await expect(card.getByText("Unidade E2E", { exact: true })).toBeVisible();

    const ctx = await browser.newContext();
    const created = await ctx.newPage();
    await login(created, { id: "", username: "teste.e2e.criado", password: temp, name: "" });
    await created.waitForURL(/\/trocar-senha/);
    await ctx.close();

    // Suporte
    await sup.goto(`/admin/funcionarios/${s().bia.id}`);
    await sup.getByRole("button", { name: "Acessar como funcionário" }).click();
    await sup.waitForURL(/\/inicio/);
    await expect(sup.getByText("Modo de suporte:")).toBeVisible();
    await addExpense(sup, "9,90", "Outros", "Lançado pelo suporte E2E");
    await sup.getByRole("button", { name: "Sair do modo de suporte" }).click();
    await sup.waitForURL(/\/admin\/funcionarios\//);

    const rows = await sql<{ actor_id: string; support_session_id: string | null }>(
      `select a.actor_id, a.support_session_id from public.audit_events a
       join public.expenses e on e.id = a.entity_id
       where e.description = 'Lançado pelo suporte E2E' and a.action = 'criado'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(s().admin.id);
    expect(rows[0].support_session_id).not.toBeNull();
    await sup.context().close();
  });

  test("CA16: exportação PDF e Excel respeita permissão", async ({ browser }) => {
    const ges = await asUser(browser, s().gestor);
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
    await ges.goto(`/admin/relatorios?mes=${month}&funcionario=${s().ana.id}`);
    await expect(ges.getByText("Total registrado no mês (despesas)")).toBeVisible();
    const xlsx = await ges.request.get(`/api/exportar?formato=xlsx&mes=${month}&funcionario=${s().ana.id}`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    const pdf = await ges.request.get(`/api/exportar?formato=pdf&mes=${month}`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const ana = await asUser(browser, s().ana);
    const denied = await ana.request.get(`/api/exportar?formato=xlsx&mes=${month}`);
    expect(denied.status()).toBe(403);
    await ges.context().close();
    await ana.context().close();
  });

  test("CA17: sem rolagem horizontal em 360, 390, 768 e 1366 px", async ({ browser }) => {
    const func = await asUser(browser, s().bia);
    const ges = await asUser(browser, s().gestor);
    for (const width of [360, 390, 768, 1366]) {
      for (const [page, url] of [
        [func, "/inicio"],
        [func, "/lancar/despesa"],
        [func, "/lancar/recebimento"],
        [func, "/semanas"],
        [ges, "/admin"],
        [ges, `/admin/funcionarios/${s().ana.id}`],
        [ges, "/admin/relatorios"],
      ] as const) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(url);
        expect(await noHorizontalScroll(page), `${url} em ${width}px`).toBe(true);
      }
    }
    // Ação principal visível no celular
    await func.setViewportSize({ width: 360, height: 740 });
    await func.goto("/lancar/despesa");
    await expect(func.getByRole("button", { name: "Salvar", exact: true })).toBeInViewport();
    // Teclado: foco chega aos campos do login com Tab
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto("/login");
    await p.keyboard.press("Tab");
    await expect(p.getByLabel("Usuário")).toBeFocused();
    await ctx.close();
    await func.context().close();
    await ges.context().close();
  });
});
