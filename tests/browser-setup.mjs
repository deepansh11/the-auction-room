/** Optional loopback-only setup UI harness. Never calls a real backend or Firebase.
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:ui:setup
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

assert(process.env.PLAYWRIGHT_MODULE, "Set PLAYWRIGHT_MODULE to an installed Playwright module");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const csv = "player_id,overall,short_name,player_positions\n" + Array.from({ length: 300 }, (_, i) => `${i + 1},${80 + i % 15},Test Player ${i + 1},${i % 5 === 0 ? "GK" : "CM"}`).join("\n");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#070b12;color:white}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/__setup-entry.jsx"></script></body></html>`;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SetupScreen} from '/src/screens/SetupScreen.jsx';
window.startCalls=[]; window.failCreate=true; window.finishCalls=[];
createRoot(document.getElementById('root')).render(React.createElement(SetupScreen,{user:{username:'testhost'},onBackToDiscover:()=>{},onStart:async(spec,options)=>{
  if(options?.skipCreate){window.finishCalls.push({spec,options});return spec;}
  window.startCalls.push({spec,options});
  if(window.failCreate)throw new Error('Test creation unavailable');
  return {...spec,status:'draw',participants:spec.participantNames.map(name=>({name,budget:spec.budgetPerBidder,squad:[]}))};
}}));`;
const vite = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "setup-test",
  resolveId(id) { if (id === "/__setup-entry.jsx") return "\0setup-entry"; },
  load(id) { if (id === "\0setup-entry") return entry; },
  configureServer(server) { server.middlewares.use((request, response, next) => {
    if (!request.url.startsWith("/__setup-test")) return next();
    server.transformIndexHtml(request.url, html).then(page => { response.setHeader("Content-Type", "text/html"); response.end(page); });
  }); },
}] });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let csvCalls = 0;
  let failCatalogue = false;
  await page.route("**/data/*.csv", route => {
    csvCalls++;
    return route.fulfill({ status: failCatalogue ? 503 : 200, body: failCatalogue ? "Unavailable" : csv, contentType: "text/csv" });
  });
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/__setup-test`;
  await page.goto(url);
  const create = page.getByRole("button", { name: "Create room →", exact: true });
  await create.waitFor();
  assert.equal(await page.locator("details[open]").count(), 0);
  assert.equal(await page.locator(".setup-pool-row").count(), 0);
  assert.equal(await page.getByLabel("Participant 2", { exact: true }).isVisible(), false);
  await page.getByText("5 participants · 130 players", { exact: true }).waitFor();
  if (process.env.FOCUS_SCREENSHOT_DIR) {
    await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/setup-default-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/setup-default-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1365, height: 1000 });
  }
  const options = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Game options/ }) });
  await options.locator("summary").click();
  assert.equal(await page.getByLabel("Fixture legs", { exact: true }).locator("option").count(), 3);
  await page.getByLabel("Fixture legs", { exact: true }).selectOption("triple");
  await page.getByLabel("Participants", { exact: true }).selectOption("2");
  assert.equal(await page.getByLabel("Number of groups", { exact: true }).inputValue(), "1");
  await page.getByText("2 participants · 52 players", { exact: true }).waitFor();
  await page.getByLabel("Participants", { exact: true }).selectOption("10");
  await page.getByText("10 participants · 260 players", { exact: true }).waitFor();
  await page.getByLabel("Participants", { exact: true }).selectOption("5");
  const pool = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Player pool/ }) });
  await pool.locator("summary").click();
  await page.locator(".setup-pool-row").first().waitFor();
  assert.equal(await page.locator(".setup-pool-row").count(), 40);
  await page.getByRole("button", { name: /Show more/ }).click();
  assert.equal(await page.locator(".setup-pool-row").count(), 80);
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByText("5 participants · 300 players", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await create.click();
  await page.getByRole("alert").filter({ hasText: "Select at least one player" }).waitFor();
  assert.equal(await page.evaluate(() => window.startCalls.length), 0);
  await page.getByRole("button", { name: "Use recommended pool", exact: true }).click();
  await page.getByLabel("Search player pool", { exact: true }).fill("Test Player 1");
  assert(await page.locator(".setup-pool-row").count() > 0);
  await page.getByLabel("Search player pool", { exact: true }).fill("");
  await pool.locator("summary").click();
  await page.waitForFunction(() => document.querySelectorAll(".setup-pool-row").length === 0);
  assert.equal(await page.locator(".setup-pool-row").count(), 0);
  const prices = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Tier prices/ }) });
  await prices.locator("summary").click();
  await page.getByLabel("A Price (M)", { exact: true }).fill("0");
  await create.click();
  await page.getByRole("alert").filter({ hasText: "price greater than zero" }).waitFor();
  await page.getByLabel("A Price (M)", { exact: true }).fill("13");
  const invitation = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Invitation settings/ }) });
  await invitation.locator(":scope > summary").click();
  await page.getByText("Reserve seats by username (optional)", { exact: true }).click();
  const host = page.getByLabel("You · Host", { exact: true });
  assert.equal(await host.getAttribute("readonly"), "");
  await page.getByLabel("Participant 2", { exact: true }).fill("TESTHOST");
  await create.click();
  await page.getByRole("alert").filter({ hasText: "Participant names must be unique" }).waitFor();
  await page.getByLabel("Participant 2", { exact: true }).fill("friend-one");
  await page.getByLabel("Budget per participant (M)", { exact: true }).fill("300");
  const oldCode = await page.locator(".setup-room-code").textContent();
  await page.getByRole("button", { name: "Generate new code", exact: true }).click();
  assert.notEqual(await page.locator(".setup-room-code").textContent(), oldCode);
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/setup-${width}.png`, fullPage: true });
  }
  await create.click();
  await page.getByRole("alert").filter({ hasText: "Test creation unavailable" }).waitFor();
  assert.equal(await page.getByLabel("Budget per participant (M)", { exact: true }).inputValue(), "300");
  await page.evaluate(() => { window.failCreate = false; });
  await create.click();
  await page.getByText(/SHARE\s*YOUR ROOM/).waitFor();
  const call = (await page.evaluate(() => window.startCalls)).at(-1);
  assert.equal(call.spec.participantNames[0], "testhost");
  assert.equal(call.spec.participantNames[1], "friend-one");
  assert.equal(call.spec.selectedPlayers.length, 130);
  assert.equal(call.spec.budgetPerBidder, 300);
  assert.equal(call.spec.tiers.A.price, 13);
  assert.equal(call.spec.fixtureLeg, "triple");
  assert.equal(call.options.deferNavigation, true);
  await page.getByRole("button", { name: "✓ CONTINUE TO AUCTION", exact: true }).click();
  assert.equal((await page.evaluate(() => window.finishCalls))[0].options.skipCreate, true);
  // Catalogue failure is independently retryable and does not create an empty room.
  failCatalogue = true;
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "Could not load" }).waitFor();
  assert.equal(await create.isEnabled(), false);
  failCatalogue = false;
  await page.getByRole("button", { name: "Try loading again", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent === "Create room →" && !button.disabled));
  assert.equal(await create.isEnabled(), true);
  await page.evaluate(() => { window.failCreate = false; });
  await create.click();
  await page.getByText(/SHARE\s*YOUR ROOM/).waitFor();
  const defaultCall = (await page.evaluate(() => window.startCalls)).at(-1);
  assert.deepEqual(defaultCall.spec.participantNames, ["testhost", "Player 2", "Player 3", "Player 4", "Player 5"]);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ["collapsed options and unmounted catalogue", "participant count/default pool/group limits", "pool search/select/clear/recommended/pagination", "tier/name validation", "preserved creation error state", "payload and share continuation", "catalogue failure/retry", "1365/390/320px layout"], csvCalls, scope: "synthetic loopback setup UI; no Firebase or production" }));
} finally { await browser?.close(); await vite.close(); }
