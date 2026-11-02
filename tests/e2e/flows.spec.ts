import { expect, test, type Page } from "@playwright/test";
import { questionsFor } from "../../src/lib/domain/nil-eligibility";

async function login(page: Page) {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toHaveValue("demo@compte.example"); // demo creds prefilled in DEMO_MODE
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/");
}

async function answerClean(page: Page, rt: "GSTR1" | "GSTR3B") {
  for (const q of questionsFor(rt, "MONTHLY")) {
    await page.locator(`button[data-q="${q.id}"][data-a="${q.disqualifyOn === "YES" ? "NO" : "YES"}"]`).click();
  }
  await page.getByTestId("declaration").check();
  await page.getByRole("button", { name: "Check eligibility" }).click();
}

test("Flow A: natural-language (Hindi) invoice → confirmation → PDF → ledger → return preparation", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: /Create invoice/ }).first().click();
  await page.getByRole("button", { name: "हिंदी example" }).click();
  await page.getByRole("button", { name: "Prepare draft" }).click();
  await page.waitForURL(/\/invoices\/[a-z0-9]+$/);
  await expect(page.getByText("Compte rules (offline)")).toBeVisible();
  await expect(page.getByTestId("grand-total")).toHaveText("₹11,800.00");
  await expect(page.getByText(/Confirm the place of supply \(it was suggested/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm & issue invoice" })).toBeDisabled();
  await page.getByLabel("I confirm the place of supply").check();
  await expect(page.getByText("Draft saved")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & issue invoice" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Issue invoice", exact: true }).click();
  await expect(page.getByRole("heading", { name: /DMT\/26-27\/\d{4}/ })).toBeVisible();
  const invoiceNumber = (await page.getByRole("heading", { name: /DMT\/26-27\/\d{4}/ }).textContent())!.trim();
  await expect(page.getByText("Intra-state · CGST + SGST")).toBeVisible();
  // PDF really downloads
  const id = page.url().split("/").pop()!;
  const pdf = await page.request.get(`/api/invoices/${id}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // Ledger
  await page.goto("/invoices?status=ISSUED");
  await expect(page.getByText(invoiceNumber)).toBeVisible();
  // Return preparation for the invoice's period
  await page.goto(`/invoices/${id}`);
  await page.getByRole("link", { name: /return preparation/ }).click();
  await expect(page.getByRole("link", { name: invoiceNumber })).toBeVisible();
  await expect(page.getByText("Internal draft — not portal upload-ready")).toBeVisible();
});

test("Flow A2: SMS simulator BILL → CONFIRM issues an invoice; GSTN commands are refused", async ({ page }) => {
  await login(page);
  await page.goto("/invoices/new");
  await page.getByRole("tab", { name: "SMS simulator" }).click();
  await page.getByLabel("SMS text").fill("BILL RAMESH 20 BOX 500 GST18");
  await page.getByRole("button", { name: "Send SMS" }).click();
  await expect(page.getByText(/Total ₹11,800\.00\. Reply CONFIRM/)).toBeVisible();
  await page.getByRole("button", { name: "Send SMS" }).click(); // field now holds CONFIRM <ref>
  await expect(page.getByText(/DMT\/26-27\/\d{4} issued/)).toBeVisible();
  await page.getByLabel("SMS text").fill("CNF R1 123456");
  await page.getByRole("button", { name: "Send SMS" }).click();
  await expect(page.getByText(/This looks like a GSTN filing SMS/)).toBeVisible();
});

test("Flow B [SIMULATED GSTN]: nil GSTR-1 eligibility → official SMS instructions → simulated government reply → ARN recorded as UNVERIFIED", async ({ page }) => {
  await login(page);
  await page.goto("/returns/092026/nil");
  await expect(page.getByRole("heading", { name: /Nil return filing — September 2026/ })).toBeVisible();
  await page.getByRole("button", { name: "Run demo simulation" }).first().click();
  await page.waitForURL(/\/nil\/gstr1\?demo=1/);
  await expect(page.getByText("DEMO — NOT GOVERNMENT FILED").first()).toBeVisible();
  await answerClean(page, "GSTR1");
  await expect(page.getByTestId("outcome")).toHaveAttribute("data-outcome", "ELIGIBLE_SELF_DECLARED");
  const showSms = page.getByRole("button", { name: "Show the SMS to send" });
  await expect(showSms).toBeDisabled();
  await page.getByTestId("irreversible").check();
  await showSms.click();
  await expect(page.getByTestId("sms-to")).toHaveText("14409");
  await expect(page.getByTestId("sms-body")).toHaveText(/^NIL R1 27ZZZFZ0001Z1Z. 092026$/);
  await expect(page.getByRole("link", { name: "Open SMS app" })).toHaveAttribute("href", /^sms:14409(\?|&)body=NIL%20R1%20/);
  await page.getByRole("button", { name: "Simulate sending (DEMO)" }).click();
  await expect(page.getByTestId("cnf-template")).toHaveText("CNF R1 <6-digit code>");
  await expect(page.getByText(/DEMO: \d{6} is the CODE for Nil filing of R1/)).toBeVisible();
  await page.getByRole("button", { name: "Simulate CNF reply (DEMO)" }).click();
  await expect(page.getByLabel("ARN (Application Reference Number)")).toHaveValue(/^DEMO-AA27/);
  await page.getByRole("button", { name: "Record ARN" }).click();
  await expect(page.getByTestId("arn-value")).toHaveText(/^DEMO-AA27/);
  await expect(page.getByText("Not verified by Compte")).toBeVisible();
  await expect(page.getByText("ARN recorded — not verified").first()).toBeVisible();
  await expect(page.getByText("Filed (verified)")).toHaveCount(0);
  const href = await page.locator("a", { hasText: "Download filing activity report" }).first().getAttribute("href");
  const report = await page.request.get(href!);
  expect(report.headers()["content-type"]).toBe("application/pdf");
});

test("Flow C: ineligible nil filings are blocked (sales in Aug → GSTR-1; purchases in May → GSTR-3B)", async ({ page }) => {
  await login(page);
  await page.goto("/returns/082026/nil");
  await expect(page.getByText(/books show activity in this period, so a nil GSTR-1 is not possible/)).toBeVisible();
  await page.getByRole("button", { name: "Run demo simulation" }).first().click();
  await page.waitForURL(/\/nil\/gstr1/);
  await answerClean(page, "GSTR1");
  await expect(page.getByTestId("outcome")).toHaveAttribute("data-outcome", "INELIGIBLE");
  await expect(page.getByText("Nil filing is not available for this period").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Show the SMS to send" })).toHaveCount(0);
  await expect(page.getByTestId("sms-body")).toHaveCount(0);

  await page.goto("/returns/052026/nil");
  await page.getByRole("button", { name: "Run demo simulation" }).nth(1).click();
  await page.waitForURL(/\/nil\/gstr3b/);
  await expect(page.getByText(/purchase record\(s\) in this period/)).toBeVisible();
  await answerClean(page, "GSTR3B");
  await expect(page.getByTestId("outcome")).toHaveAttribute("data-outcome", "INELIGIBLE");
  await expect(page.getByRole("button", { name: "Show the SMS to send" })).toHaveCount(0);
});

test("Unauthenticated access is redirected and cross-origin writes are refused", async ({ page, request }) => {
  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/login/);
  const r = await request.post("/api/invoices/extract", { data: { text: "x" } });
  expect(r.status()).toBe(401);
  const x = await request.post("/api/auth/login", { data: { email: "a@b.c", password: "x" }, headers: { origin: "https://evil.example" } });
  expect(x.status()).toBe(403);
});
