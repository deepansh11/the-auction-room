/** Optional Chromium regression checks for results UI; loopback fixtures, no real data.
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser-results.mjs
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { fixture } from "./helpers.mjs";

assert(process.env.PLAYWRIGHT_MODULE, "Set PLAYWRIGHT_MODULE to an installed Playwright module");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
process.env.VITE_API_BASE_URL = "http://127.0.0.1:49199"; // All API requests intercepted below.
const source = fixture(4);
source.participants.forEach((p, index) => {
  p.squad = source.playerPool.slice(index * 16, index * 16 + 16).map(player => ({ ...player, purchasePrice: 12 }));
  p.budget = 48;
});
const fixtures = { A: [
  { id: "A-0", round: 1, home: "test-0", away: "test-1", homeGoals: null, awayGoals: null },
  { id: "A-1", round: 1, home: "test-2", away: "test-3", homeGoals: 2, awayGoals: 1 },
  { id: "A-2", round: 4, home: "test-1", away: "test-0", homeGoals: null, awayGoals: null },
  { id: "A-leg3-0", round: 7, leg: 3, home: "test-0", away: "test-2", homeGoals: null, awayGoals: null },
] };
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#070b12;color:white}*{box-sizing:border-box}</style></head><body><div id="root"></div><script type="module" src="/__results-entry.jsx"></script></body></html>`;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {ResultsScreen} from '/src/screens/ResultsScreen.jsx';
const source=${JSON.stringify(source)}; const fixtures=${JSON.stringify(fixtures)}; const params=new URLSearchParams(location.search); const username=params.get('user')||'test-0';
createRoot(document.getElementById('root')).render(React.createElement(ResultsScreen,{participants:source.participants,players:source.playerPool,tiers:source.tiers,wishlists:{},selectedName:username,auctionResultId:'result-test',user:{username,token:username},host:'test-0',groupsEnabled:params.get('groups')!=='0',groups:{A:source.participantNames},fixtures,fixtureLeg:params.get('legs')||'double',seasonInfo:{seasonNumber:1,leagueName:'Friends League'},onBackToDiscover:()=>{},onStartTransferWindow:()=>{}}));`;
const vite = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "results-test",
  resolveId(id) { if (id === "/__results-entry.jsx") return "\0results-entry"; },
  load(id) { if (id === "\0results-entry") return entry; },
  configureServer(server) { server.middlewares.use((request, response, next) => {
    if (!request.url.startsWith("/__results-test")) return next();
    server.transformIndexHtml(request.url, html).then(page => { response.setHeader("Content-Type", "text/html"); response.end(page); });
  }); },
}] });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const errors = [];
  let scoreSaves = 0;
  let clubSelections = {};
  let failNextScore = true;
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/club-selections")) return route.fulfill({ json: { clubSelections } });
    if (url.pathname.endsWith("/club-selection")) {
      clubSelections["test-0"] = route.request().postDataJSON().clubId;
      return route.fulfill({ json: { clubSelections } });
    }
    if (url.pathname.endsWith("/score")) {
      scoreSaves++;
      if (failNextScore) { failNextScore = false; return route.fulfill({ status: 503, json: { error: "Test save unavailable" } }); }
      return route.fulfill({ json: { success: true } });
    }
    if (url.pathname.endsWith("/transfer-listings")) {
      const { playerId, listed } = route.request().postDataJSON();
      const next = structuredClone(source.participants);
      const own = next[0];
      if (listed) {
        const player = own.squad.find(p => p.id === playerId);
        own.squad = own.squad.filter(p => p.id !== playerId);
        own.soldPlayers = [{ ...player, salePrice: 12, soldInTransferWindow: true }];
        own.budget += 12;
      }
      return route.fulfill({ json: { result: { participants: next, transferWindow: {} } } });
    }
    return route.fulfill({ json: url.pathname.endsWith("/fixtures") ? { fixtures } : { submissions: [], points: [], result: { transferWindow: {} } } });
  });
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/__results-test`;
  await page.goto(url);
  await page.getByRole("heading", { name: "Friends League", exact: true }).waitFor();
  assert.equal(await page.locator(".results-squad").count(), 1);
  assert.equal(await page.locator(".results-squad-list li").count(), 16);
  if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/results-squads-desktop.png`, fullPage: true });
  assert.equal(await page.getByText("League Centre", { exact: true }).count(), 0);
  assert.equal(await page.getByText("HOST CUP CONTROLS", { exact: true }).count(), 0);
  await page.getByLabel("Team", { exact: true }).selectOption("test-2");
  await page.locator(".results-squad").getByText("test-2", { exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Standings", exact: true }).click();
  assert.equal(await page.getByRole("columnheader", { name: "GF", exact: true }).isVisible(), false);
  await page.getByLabel("Detailed stats", { exact: true }).check();
  assert.equal(await page.getByRole("columnheader", { name: "GF", exact: true }).isVisible(), true);
  const penalties = page.locator("details").filter({ has: page.locator("summary", { hasText: /^Point deductions$/ }) });
  assert.equal(await penalties.getAttribute("open"), null);
  await penalties.locator("summary").click();
  assert(await penalties.getByRole("spinbutton").count() > 0);
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Matches", exact: true }).click();
  assert.equal(await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Matches", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.getByRole("spinbutton").count(), 0);
  if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/results-matches-desktop.png`, fullPage: true });
  const match = page.locator(".result-match").filter({ has: page.getByRole("button", { name: /^test-0 vs test-1:/ }) });
  await match.getByRole("button", { name: "test-0 vs test-1: not played", exact: true }).click();
  await match.getByLabel("test-0 goals").fill("3");
  await match.getByLabel("test-1 goals").fill("1");
  assert.equal(scoreSaves, 0); // Editing alone is not a network request.
  await match.getByRole("button", { name: "Save result", exact: true }).click();
  await match.getByRole("alert").waitFor();
  assert.equal(await match.getByLabel("test-0 goals").inputValue(), "3");
  await match.getByRole("button", { name: "Save result", exact: true }).click();
  await match.getByRole("button", { name: "test-0 vs test-1: 3–1", exact: true }).waitFor();
  assert.equal(scoreSaves, 2);
  await match.getByRole("button", { name: "test-0 vs test-1: 3–1", exact: true }).click();
  await match.getByRole("button", { name: "Enter player stats", exact: true }).click();
  const statsDialog = page.getByRole("dialog", { name: "Player match stats", exact: true });
  await statsDialog.waitFor();
  await page.waitForFunction(() => !document.querySelector('.match-stats fieldset')?.disabled);
  assert.equal(await statsDialog.locator('input[type="file"]').count(), 0);
  assert.equal(await statsDialog.getByRole("spinbutton").count(), 32);
  await statsDialog.getByRole("button", { name: "Close ✕", exact: true }).click();
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Transfers", exact: true }).click();
  assert.equal(await page.getByLabel("Listing deadline date").isVisible(), false);
  assert.equal(await page.getByLabel("Player owner").inputValue(), "test-0");
  await page.getByLabel("Player owner").selectOption("ALL");
  const transferRows = page.locator(".results-player-row");
  assert.equal(await transferRows.count(), 25);
  await page.getByRole("button", { name: /Show more/ }).click();
  assert.equal(await transferRows.count(), 50);
  await page.getByRole("button", { name: /^List for transfer:/ }).first().click();
  await page.getByText("Player added to transfer listings.", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Listed \(/ }).click();
  await page.getByRole("button", { name: /^Unlist:/ }).click();
  await page.getByText("Player removed from transfer listings.", { exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Squads", exact: true }).click();
  await page.getByRole("button", { name: "Browse all players", exact: true }).click();
  assert.equal(await page.getByText("Manage listing deadline", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /^List for transfer:/ }).count(), 0);
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Awards", exact: true }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("Loading awards…"));
  assert.equal(await page.getByRole("navigation", { name: "Auction results" }).isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const view of ["Squads", "Standings", "Matches", "Transfers"]) {
    await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: view, exact: true }).click();
    if (view === "Standings") await page.getByLabel("Detailed stats", { exact: true }).uncheck();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Mobile overflow in ${view}`);
    if (view === "Transfers") {
      await page.getByText("Manage listing deadline", { exact: true }).click();
      assert.equal(await page.getByLabel("Listing deadline date").isVisible(), true);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Expanded deadline must not overflow");
    }
    if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/results-${view.toLowerCase()}-mobile.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 320, height: 740 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.goto(`${url}?user=test-1`);
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Matches", exact: true }).click();
  await page.getByLabel("Show matches for", { exact: true }).selectOption("ALL");
  const unrelated = page.locator(".result-match").filter({ has: page.getByRole("button", { name: "test-2 vs test-3: 2–1", exact: true }) });
  await unrelated.getByRole("button").click();
  assert.equal(await unrelated.getByRole("spinbutton").count(), 0);
  assert.equal(await page.getByText("Host cup controls", { exact: true }).count(), 0);
  await page.goto(`${url}?groups=0`);
  await page.getByRole("heading", { name: "Friends League", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Standings", exact: true }).count(), 0);
  assert.equal(await page.locator(".results-squad").count(), 1);
  await page.getByLabel("ISL club for test-0", { exact: true }).selectOption("113298");
  await page.waitForFunction(() => document.querySelector('select[aria-label="ISL club for test-0"]')?.value === '113298');
  assert.equal(await page.getByLabel("ISL club for test-0", { exact: true }).locator("option").count(), 15);
  await page.goto(`${url}?legs=triple`);
  await page.waitForFunction(() => document.querySelector('select[aria-label="ISL club for test-0"]')?.value === '113298');
  await page.getByLabel("Team", { exact: true }).selectOption("test-2");
  assert.equal(await page.getByLabel("ISL club for test-2", { exact: true }).isEnabled(), false);
  await page.getByRole("navigation", { name: "Auction results" }).getByRole("button", { name: "Matches", exact: true }).click();
  await page.getByLabel("Fixture leg", { exact: true }).selectOption("FIXTURE_3");
  await page.getByRole("button", { name: "FC Goa (test-0) vs test-2: not played", exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ["squad default/selector", "compact/expanded standings", "collapsed penalties", "explicit match save and failed-save retry", "transfer list/unlist", "25-row pagination", "read-only catalogue", "lazy awards", "host/participant controls", "390px/320px layout", "no-league results"], scope: "synthetic Chromium fixtures; no production or Firebase data" }));
} finally { await browser?.close(); await vite.close(); }
