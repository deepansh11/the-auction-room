/** Optional manual-stats UI checks. Synthetic loopback API fixtures; no production writes. */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

assert(process.env.PLAYWRIGHT_MODULE, "Set PLAYWRIGHT_MODULE to an installed Playwright module");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
process.env.VITE_API_BASE_URL = "http://127.0.0.1:49198";
const teams = [
  { name: "Alpha", squad: [{ id: 1, name: "K. Mbappé", pos: "ST" }, { id: 2, name: "Rodri", pos: "CDM" }] },
  { name: "Beta", squad: [{ id: 3, name: "Saka", pos: "RW" }] },
];
const fixtures = [{ id: "match-1", home: "Alpha", away: "Beta" }];
let submissions = [{ id: "league__match-1__alpha", auctionResultId: "league", fixtureId: "match-1", fixtureLabel: "Alpha vs Beta", mappedParticipantName: "Alpha", createdAt: 1, updatedAt: 1,
  players: [{ id: "scan-123", name: "K. Mbappe", goals: 3, assists: 2, rating: 9.5, isPlayerOfTheMatch: true }, { id: "old-player", name: "Former Player", goals: 1, assists: 0 }] }];
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:12px;background:#070b12;color:white}*{box-sizing:border-box;margin:0}</style></head><body><div id="root"></div><script type="module" src="/__stats-entry.jsx"></script></body></html>`;
const entry = `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BallonDorPanel} from '/src/components/BallonDorPanel.jsx';
const params=new URLSearchParams(location.search); const publicPage=params.has('public'); const username=params.get('user')||'Alpha';
function Demo(){const [mode,setMode]=React.useState('entry');return React.createElement(BallonDorPanel,{auctionResultId:'league',participants:${JSON.stringify(teams)},fixtures:${JSON.stringify(fixtures)},user:publicPage?null:{username,token:'test-token'},mode,modal:!publicPage&&mode==='entry',publicAccessToken:publicPage?'shared-token':'',leagueName:'Friends League',selectedFixtureId:'match-1',canGenerateLink:!publicPage&&username==='Alpha',allowedTeamNames:['Alpha','Beta'],onClose:()=>setMode('standings')});}
createRoot(document.getElementById('root')).render(React.createElement(Demo));`;
const vite = await createServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0 }, plugins: [{ name: "stats-test",
  resolveId(id) { if (id === "/__stats-entry.jsx") return "\0stats-entry"; },
  load(id) { if (id === "\0stats-entry") return entry; },
  configureServer(server) { server.middlewares.use((request, response, next) => {
    if (!request.url.startsWith("/__stats-test")) return next();
    server.transformIndexHtml(request.url, html).then(page => { response.setHeader("Content-Type", "text/html"); response.end(page); });
  }); },
}] });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const errors = [];
  let posts = [];
  let failNext = true;
  await context.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/ballon-dor-upload")) return route.fulfill({ json: { participants: teams, participantNames: ["Alpha", "Beta"], fixtures, fixedFixtureId: "match-1", submissions, leagueName: "Friends League" } });
    if (request.method() === "POST") {
      const { submission } = request.postDataJSON();
      posts.push(submission);
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { error: "Test save unavailable" } }); }
      const saved = { id: `league__match-1__${submission.mappedParticipantName.toLowerCase()}`, auctionResultId: "league", ...submission, createdAt: 1, updatedAt: Date.now() };
      submissions = [saved, ...submissions.filter(previous => previous.id !== saved.id)];
      return route.fulfill({ json: { submission: saved } });
    }
    return route.fulfill({ json: { submissions } });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/__stats-test`;
  await page.goto(url);
  const modal = page.getByRole("dialog", { name: "Player match stats", exact: true });
  await modal.waitFor();
  await page.waitForFunction(() => !document.querySelector('.match-stats fieldset')?.disabled);
  assert.equal(await modal.locator('input[type="file"]').count(), 0);
  assert.equal(await modal.locator('input:not([type="number"])').count(), 0);
  assert.equal(await page.getByLabel("Stats team").inputValue(), "Alpha");
  assert.equal(await page.getByLabel("K. Mbappé goals", { exact: true }).inputValue(), "3");
  assert.equal(await modal.getByText("Former Player", { exact: true }).count(), 1);
  await page.getByLabel("K. Mbappé goals", { exact: true }).fill("4");
  page.once("dialog", dialog => dialog.dismiss());
  await page.keyboard.press("Escape");
  assert.equal(await modal.isVisible(), true);
  await modal.getByRole("button", { name: "Save goals & assists", exact: true }).click();
  await modal.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("K. Mbappé goals", { exact: true }).inputValue(), "4");
  await modal.getByRole("button", { name: "Save goals & assists", exact: true }).click();
  await modal.getByText(/Stats saved\./).waitFor();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].players[0].id, "1");
  assert.equal(posts[1].players[0].goals, 4);
  assert.equal(posts[1].players[0].rating, undefined);
  assert.equal(posts[1].players[0].isPlayerOfTheMatch, undefined);
  await page.getByLabel("Stats team").selectOption("Beta");
  await page.getByLabel("Saka goals", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Saka goals", { exact: true }).inputValue(), "0");
  for (const width of [1365, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const centered = await modal.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2 && Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2;
    });
    assert(centered, "Stats dialog must be centered even under a global margin reset");
    assert(await modal.evaluate(element => element.scrollWidth <= element.clientWidth));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/manual-stats-${width}.png`, fullPage: true });
  }
  await modal.getByRole("button", { name: "Close ✕", exact: true }).click();
  await page.getByRole("region", { name: "Ballon d’Or standings", exact: true }).waitFor();
  const leader = page.locator(".awards-table__row").first();
  await leader.getByText("K. Mbappé", { exact: true }).waitFor();
  assert.equal(await leader.locator(".awards-table__points strong").textContent(), "6.5");
  assert.equal(await page.getByText("RR", { exact: true }).count(), 0);
  assert(!requests.some(request => /tesseract|traineddata|\.wasm/.test(request)));
  await page.goto(`${url}?user=Beta`);
  await page.waitForFunction(() => document.querySelector('select[aria-label="Stats team"]')?.value === 'Beta');
  assert.equal(await page.getByLabel("Stats team").locator("option[value=Alpha]").count(), 0);
  await page.goto(`${url}?public=1`);
  await page.getByRole("heading", { name: "Player match stats", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('select[aria-label="Stats team"]')?.value === 'Alpha');
  await page.getByLabel("Stats team").selectOption("Beta");
  await page.getByLabel("Saka assists", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save goals & assists", exact: true }).click();
  await page.getByText(/Stats saved\./).waitFor();
  assert.equal(posts.at(-1).mappedParticipantName, "Beta");
  assert.equal(posts.at(-1).players[0].assists, 2);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, checks: ["goals/assists-only inputs", "saved legacy hydration", "dirty/Escape protection", "failed save/retry", "canonical player IDs", "team isolation", "resave scoring with hat-trick bonus", "public stats link", "no OCR requests", "1365/390/320px layout"], scope: "synthetic loopback UI, no Firebase/production" }));
} finally { await browser?.close(); await vite.close(); }
