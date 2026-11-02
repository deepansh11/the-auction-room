/** Optional real-browser UI regression test. Install Playwright outside the app if needed.
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser-focus.mjs
 * Uses loopback-only Vite + synthetic Socket.IO state. Never calls Firebase or production.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import { emitSessionUpdate, initRealtime } from "../backend/src/services/realtime.js";
import { processSessionAction } from "../backend/src/services/sessionActions.js";
import { fixture, MemoryFirestore, testUser } from "./helpers.mjs";

assert(process.env.PLAYWRIGHT_MODULE, "Set PLAYWRIGHT_MODULE to an installed Playwright module; no app dependency is required");
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE));
const session = fixture(2);
const initiallyOwned = session.playerPool.find(player => player.lot === 1);
session.participants[0].squad.push({ ...initiallyOwned, purchasePrice: 12, pickedAt: 1 });
const db = new MemoryFirestore();
db.write(`sessions/${session.id}`, session);
const catalogue = new Map(session.playerPool.map(player => [player.id, player]));
const http = createServer();
let failAction = true;
const io = initRealtime(http, {
  verifyToken: token => { assert(token === "test-0" || token === "test-1"); return testUser(token); },
  readSession: async id => (await db.collection("sessions").doc(id).get()).data(),
  executeAction: args => {
    if (failAction) { failAction = false; throw Object.assign(new Error("Synthetic service interruption"), { status: 503 }); }
    return processSessionAction({ ...args, db, catalog: catalogue });
  },
});
http.listen(0, "127.0.0.1");
await once(http, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${http.address().port}`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;background:#04060a;color:white}*{box-sizing:border-box}</style></head>
<body><div id="root"></div><script type="module" src="/__focus-entry.jsx"></script></body></html>`;
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BiddingScreen} from '/src/screens/BiddingScreen.jsx';
import {PlayerRow} from '/src/components/PlayerRow.jsx';
const user = new URLSearchParams(location.search).get('user') || 'test-0';
const session = ${JSON.stringify(session)};
window.wishlistCalls=[]; window.leaveCalls=0;
const detailPlayers = [
  {id:999,name:'K. Mbappé',rating:91,pos:'ST',positions:['ST','LW','LM'],club:'Real Madrid',nation:'France',preferredFoot:'Right',weakFoot:4,skillMoves:5,pace:97,shooting:90,dribbling:92,passing:81,physic:76,defending:37},
  {id:998,name:'Test Keeper',rating:88,pos:'GK',club:'Example Club',nation:'Example Nation',gkDiving:89,gkHandling:85,gkKicking:79,gkReflexes:91,gkSpeed:0,gkPositioning:null}
];
window.pickCalls=[];
createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('details')
  ? React.createElement('div',{style:{maxWidth:1000,margin:'20px auto',padding:12}},detailPlayers.map(player=>React.createElement(PlayerRow,{key:player.id,player,compact:true,onPick:player=>window.pickCalls.push(player.id),onWishlist:()=>{}})))
  : React.createElement(BiddingScreen, {session,user:{username:user,token:user},wishlists:{},onWishlist:(...args)=>window.wishlistCalls.push(args),onEnd:()=>{},onAbandon:()=>window.leaveCalls++}));
`;
const vite = await createViteServer({ configFile: false, root: process.cwd(), server: { host: "127.0.0.1", port: 0 },
  plugins: [{ name: "synthetic-focus-harness",
    resolveId(id) { if (id === "/__focus-entry.jsx") return "\0focus-entry"; },
    load(id) { if (id === "\0focus-entry") return entry; },
    configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (!request.url.startsWith("/__focus-test")) return next();
      server.transformIndexHtml(request.url, html).then(page => { response.setHeader("Content-Type", "text/html"); response.end(page); });
    });
  } }] });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  const errors = [];
  page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/__focus-test`;
  await page.goto(url);
  await page.getByText("Your turn — choose a player", { exact: true }).waitFor();
  await page.waitForFunction(() => !document.body.innerText.includes("RECONNECTING"));
  const lotSize = session.playerPool.filter(player => player.lot === 1).length;
  assert.equal(await page.locator(".auction-player-row").count(), lotSize - 1);
  const row = page.locator(".auction-player-row").first();
  const collapsedNodes = await row.locator("*").count();
  assert.equal(await row.getByText("Preferred foot", { exact: true }).count(), 0);
  await row.getByRole("button", { name: /Show details/ }).click();
  await row.getByText("Preferred foot", { exact: true }).waitFor();
  const expandedNodes = await row.locator("*").count();
  assert(expandedNodes > collapsedNodes);
  await row.getByRole("button", { name: /Hide details/ }).click();
  await page.getByLabel("Show picked", { exact: true }).check();
  assert.equal(await page.locator(".auction-player-row").count(), lotSize);
  await page.getByLabel("Show picked", { exact: true }).uncheck();
  await page.getByText("Room options", { exact: true }).click();
  await page.getByRole("button", { name: "Cancel auction…", exact: true }).click();
  assert.equal(await page.evaluate(() => window.leaveCalls), 0);
  await page.getByRole("button", { name: "Keep playing", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".auction-room-menu").getAttribute("open"), null);
  if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/focus-desktop.png` });
  await page.getByRole("button", { name: /^Pick .* for 12M$/ }).first().click();
  await page.getByRole("button", { name: "Retry pending action", exact: true }).waitFor();
  assert.equal((await db.collection("sessions").doc(session.id).get()).data().participants[0].budget, 240);
  assert.equal(await page.getByRole("button", { name: /^Pick .* for/ }).count(), 0);
  await page.getByRole("button", { name: "Retry pending action", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".auction-personal")?.textContent.includes("228M"));
  assert.equal(await page.getByRole("button", { name: "Retry pending action", exact: true }).count(), 0);
  assert.equal(await page.getByText("WAITING FOR PICKER", { exact: true }).count(), 0);
  await page.getByRole("searchbox").fill("no-such-player");
  await page.getByText(/No available players match/).waitFor();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: /^Add .* to wishlist$/ }).first().click();
  assert.equal((await page.evaluate(() => window.wishlistCalls))[0][0], "test-0");
  const desktop = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert(desktop.width <= desktop.viewport);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Squad & room", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Pick order", exact: true }).click();
  await dialog.getByText("240M", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false);
  await page.getByRole("button", { name: "Squad & room", exact: true }).click();
  await dialog.getByRole("button", { name: "Activity", exact: true }).click();
  await dialog.getByLabel("Recent picks").waitFor();
  await dialog.getByRole("button", { name: "Close panel ✕", exact: true }).click();
  await page.getByRole("button", { name: "Squad & room", exact: true }).click();
  await dialog.getByRole("button", { name: "My squad", exact: true }).click();
  await dialog.getByRole("button", { name: "Formation & planner", exact: true }).click();
  await page.locator(".auction-analyser-panel").waitFor();
  assert.equal(await dialog.isVisible(), false);
  assert(await page.locator(".auction-analyser-panel").evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.getByRole("button", { name: "CLOSE ✕", exact: true }).click();
  const mobile = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert(mobile.width <= mobile.viewport);
  if (process.env.FOCUS_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/focus-mobile.png` });
  await page.setViewportSize({ width: 320, height: 740 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole("button", { name: "Squad & room", exact: true }).click();
  await dialog.getByRole("button", { name: "Pick order", exact: true }).click();
  const orderNames = () => dialog.locator("ol li").evaluateAll(rows => rows.map(row => row.dataset.participant));
  assert.deepEqual(await orderNames(), ["test-0", "test-1"]);
  assert.equal(await dialog.getByText("LIVE", { exact: true }).count(), 0);
  const latest = (await db.collection("sessions").doc(session.id).get()).data();
  const nextLot = { ...latest, revision: latest.revision + 1, updatedAt: Date.now(), lotIdx: 1, sequence: ["test-1", "test-0"], turnIdx: 0, passedThisLot: [], lotOpen: false, lotClosing: false };
  await db.collection("sessions").doc(session.id).set(nextLot);
  emitSessionUpdate(nextLot);
  await dialog.getByRole("list", { name: "Lot 2 pick order", exact: true }).waitFor();
  assert.deepEqual(await orderNames(), ["test-1", "test-0"]);
  assert.equal(await dialog.locator('li[aria-current="step"]').count(), 0);
  const picking = { ...nextLot, revision: nextLot.revision + 1, updatedAt: Date.now(), lotOpen: true };
  await db.collection("sessions").doc(session.id).set(picking);
  emitSessionUpdate(picking);
  await page.waitForFunction(() => document.querySelector('dialog li[aria-current="step"]')?.dataset.participant === "test-1");
  const passed = { ...picking, revision: picking.revision + 1, updatedAt: Date.now(), passedThisLot: ["test-1"] };
  await db.collection("sessions").doc(session.id).set(passed);
  emitSessionUpdate(passed);
  await dialog.getByText("DONE", { exact: true }).waitFor();
  assert.deepEqual(await orderNames(), ["test-1", "test-0"]);
  assert.equal(await dialog.locator('li[aria-current="step"]').getAttribute("data-participant"), "test-0");
  await dialog.getByRole("button", { name: "Close panel ✕", exact: true }).click();
  // Smoke-test actual App/StrictMode navigation and lazy loading, with HTTP fixtures.
  const appPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const appModules = [];
  appPage.on("pageerror", error => errors.push(error.message));
  appPage.on("request", request => { if (request.url().includes("/src/")) appModules.push(request.url()); });
  await appPage.addInitScript(() => localStorage.setItem("fc:currentUserLocal", JSON.stringify({ username: "test-0", token: "test-0", wishlists: {} })));
  await appPage.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const latest = (await db.collection("sessions").doc(session.id).get()).data();
    const data = path === "/api/users/me" ? { user: { username: "test-0", wishlists: {} } }
      : path === "/api/sessions" ? { sessions: [latest] }
      : path.startsWith("/api/sessions/") ? { session: latest } : {};
    await route.fulfill({ json: data });
  });
  await appPage.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`);
  await appPage.getByRole("main", { name: "Player draft" }).waitFor();
  await appPage.waitForFunction(() => !document.body.innerText.includes("RECONNECTING"));
  assert(!appModules.some(url => /ResultsScreen|BallonDorPanel|PlayerDiscovery/.test(url)), "Inactive screens must not load during resume");
  await appPage.close();
  const detailsPage = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  detailsPage.on("pageerror", error => errors.push(error.message));
  await detailsPage.goto(`${url}?details=1`);
  await detailsPage.getByRole("button", { name: "Show details for K. Mbappé", exact: true }).click();
  const attributes = detailsPage.getByRole("region", { name: "Attributes for K. Mbappé", exact: true });
  await attributes.waitFor();
  assert.equal(await attributes.locator(".player-attribute").count(), 6);
  await attributes.getByLabel("Pace: 97", { exact: true }).waitFor();
  await attributes.getByText("Real Madrid", { exact: true }).waitFor();
  await attributes.getByText("ST, LW, LM", { exact: true }).waitFor();
  assert.equal(await attributes.locator(".player-attributes__metadata dd").nth(1).textContent(), "4 / 5 ★");
  await detailsPage.getByRole("button", { name: "Show details for Test Keeper", exact: true }).click();
  const keeper = detailsPage.getByRole("region", { name: "Attributes for Test Keeper", exact: true });
  await keeper.getByLabel("Speed: 0", { exact: true }).waitFor();
  await keeper.getByLabel("Positioning: not available", { exact: true }).waitFor();
  assert.equal(await keeper.getByText("Skill moves", { exact: true }).count(), 0);
  for (const width of [1365, 390, 320]) {
    await detailsPage.setViewportSize({ width, height: 900 });
    assert(await detailsPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.FOCUS_SCREENSHOT_DIR) await detailsPage.screenshot({ path: `${process.env.FOCUS_SCREENSHOT_DIR}/player-attributes-${width}.png`, fullPage: true });
  }
  await detailsPage.getByRole("button", { name: "Hide details for K. Mbappé", exact: true }).focus();
  await detailsPage.keyboard.press("Enter");
  assert.equal(await attributes.count(), 0);
  await detailsPage.getByRole("button", { name: "Pick K. Mbappé for 22M", exact: true }).click();
  assert.deepEqual(await detailsPage.evaluate(() => window.pickCalls), [999]);
  await detailsPage.close();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, playerRowNodes: { collapsed: collapsedNodes, expanded: expandedNodes }, checks: ["desktop/mobile/320px layout", "progressive player details", "picked filter", "room-menu confirmation/Escape", "unknown-outcome retry and unchanged budget", "personal wishlist while waiting", "mobile native-dialog tabs/Escape/close", "actual App/StrictMode resume without inactive screen modules", "no page errors"], scope: "synthetic loopback UI, no Firebase/production" }));
} finally {
  await browser?.close();
  await vite.close();
  await new Promise(resolve => io.close(resolve));
}
