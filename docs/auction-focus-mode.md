# Auction focus mode

## Interface changes

- Replaced the dimming waiting overlay with a small turn banner. Participants can search, inspect players, and edit their own wishlist while others pick.
- The header shows lot progress, availability, personal budget/squad size, and unhealthy connection status. Copy code, backups, readmission, placeholder skip, and leave/cancel controls are in **Room options**. Leave/cancel requires confirmation; the menu closes on Escape or an outside pointer action.
- Auction player rows show photo/initials, rating, position, name and price, with **Pick · price** as the primary action. Details expand to show attributes, positions, club, nationality, foot, weak foot, skill moves and tier. Photos have explicit dimensions, lazy loading, and asynchronous decoding. Other screens retain their existing detailed row presentation.
- Picked players are hidden by default. **Show picked** restores them. Wishlist actions target the signed-in user rather than the current picker.
- The sidebar defaults to **My squad**, with **Teams** and **Activity** as secondary panels. Formation planning, tier/lot price information, Mystery Cards, team budgets, and recent picks remain available. Ordinary picks no longer trigger repetitive room-wide toasts.
- Below 760px the fixed sidebar becomes a native modal dialog, with focus handling/Escape supplied by the browser. A bottom bar shows personal budget/squad size and opens the panel. The main player list occupies the available width. The transfer listing grid also stacks on narrow screens.
- Unknown submission outcomes have persistent **Check status** and **Retry pending action** controls. Unrelated picks are unavailable until resolved. Retries reuse the exact request ID/revision; there are no optimistic local budget/squad changes. Ordinary rejections and stale-state errors have inline feedback.

No gameplay rules, backend authorization, database, or visual theme were replaced. Home navigation, setup defaults, and the large results interface were not redesigned in this pass.

## Follow-up: cleaner new-auction setup

`src/screens/SetupScreen.jsx` now puts auction name, participant count, and budget first. Participant names are no longer required up front: the host occupies the first seat and remaining seats use the existing claimable `Player N` placeholders. Optional exact-username reservations are nested under Invitation settings. Game options, the player pool, tier prices, and invitation settings are collapsed by default; their summaries show the current configuration.

The recommended pool still selects the highest-rated 26 players per participant. Custom selection, select-all/clear, group counts, fixture legs, Mystery Cards, tier prices/colours, code regeneration/copying, and the post-creation sharing flow remain available. Player checkboxes mount only when their section opens, with 40 rows initially and Show more. Dataset failures have a retry control; room-creation failures preserve setup state. Client validation flags duplicate names, invalid budgets/tiers, and empty pools before submission; backend authority is unchanged.

Validation for this follow-up: `npm test` passed 35 tests (the emulator-only test remains separately gated); `npm run build` and `git diff --check` passed. The optional `test:ui:setup` Chromium harness checks open-seat payloads, optional reservations, count/pool/group changes, filters/pagination, validation, creation errors, sharing/continuation, catalogue retry, and 1365px/390px/320px layouts. Run it with the same `PLAYWRIGHT_MODULE` environment convention as the auction harness below. Browser harnesses should run sequentially because they share Vite's dependency cache. No deployment or production-data changes were performed.

## Asset and rendering changes

- Screen modules are loaded with React.lazy/Suspense. Results, awards/OCR, setup, discovery and draw code are not eagerly bundled into the application entry. Awards are also lazy within results.
- The stadium background now uses a 1920px WebP derivative. The original source image is retained, not deleted or overwritten. Reproduction command (requires cwebp):

```sh
cwebp -q 78 -resize 1920 0 src/assets/263832-3840x2160-desktop-4k-football-stadium-wallpaper.jpg -o src/assets/stadium-background.webp
```

- Background cycling stops during draw/auction screens and for reduced-motion preferences. Inactive slides are not all mounted as filtered full-screen layers. Hidden tabs do not advance the carousel.
- Compact player rows render detailed stat nodes only when expanded. Collapsed rows retain a small footprint; the follow-up attribute-panel update deliberately adds readable stat tiles, full labels, and metadata when expanded. This is a progressive-disclosure design, not an FPS or CPU improvement claim.

### Readable player attributes

Expanded bidding rows now use a full-width panel with club, nation, and positions; six labeled attribute tiles with large numeric values and supporting rating bars; and a separate preferred-foot / weak-foot / skill-move / price-tier summary. Weak foot and skill moves use explicit ratings out of five. Goalkeepers show diving, handling, kicking, reflexes, speed, and positioning rather than outfield attributes. Missing values display a dash or “Not available,” never an invented zero. At phone widths the six stats become a three-column, two-row grid. Attribute panels are only mounted when expanded; collapsed rows and picking rules are unchanged.

### Build measurements

| Asset | Before focus mode | After focus mode |
| --- | --- | --- |
| Main entry JS, minified | 518.70 kB | 186.50 kB |
| Main entry JS, gzip | 150.83 kB | 59.81 kB |
| Stadium image | 4,141.69 kB JPG | 642.12 kB WebP |

Additional screen/shared chunks are downloaded when needed; total application JavaScript has not disappeared. The new bidding chunk is approximately 51.46 kB minified / 15.87 kB gzip plus shared dependencies. The final build has no >500 kB chunk warning. No WAN download-time, FPS, or production rendering-latency claim is made.

## Files

Main changes: `src/screens/BiddingScreen.jsx`, `src/components/PlayerRow.jsx`, `src/components/BudgetSidebar.jsx`, `src/components/AuctionRoomMenu.jsx`, `src/components/ResponsiveAuctionPanel.jsx`, `src/styles/auction.css`, `src/app/App.jsx`, `src/screens/ResultsScreen.jsx`, `src/components/BackgroundCarousel.jsx`, and `src/assets/stadium-background.webp`.

Pending-action lifecycle is exposed through `src/lib/socketManager.js`, `src/lib/realtime.js`, and `src/lib/useSessionRealtime.js`. Regression coverage was extended in `tests/manager-retry.test.mjs` and `tests/socket.test.mjs`, with a new optional `tests/browser-focus.mjs` browser harness.

## Validation

Executed:

- `npm test`: 27 tests passed; the emulator-only test is intentionally skipped by this command. No backend transaction behavior was changed in this focus-mode pass.
- `npm run build`: passed, screen chunks emitted, no large-chunk warning.
- `git diff --check`: passed.
- Real Chromium browser regression checks: passed at 1365px desktop, 390px mobile, and 320px narrow widths, with no horizontal document overflow in the tested fixture or browser page errors.

The browser test exercises progressive player details, picked filtering, room confirmation/Escape, unknown-outcome recovery without local financial mutation, personal wishlist behavior while waiting, native mobile dialog tabs/close/Escape, and actual App/StrictMode resume without loading inactive results/awards/discovery modules.

### Run the optional browser harness

The repository does not gain a Playwright runtime dependency. Supply an existing Playwright installation and its Chromium browser, or install them in a separate tooling directory:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:ui
```

Optional `FOCUS_SCREENSHOT_DIR=/existing/directory` saves desktop and mobile captures. The harness launches synthetic Socket.IO state and Vite on loopback, injects test HTTP responses for application resume, and never invokes Firebase or production APIs. Its API URL overrides the local environment for that process only.

These are functional/layout checks with synthetic players—not comprehensive accessibility certification, cross-browser testing, heap profiling, real-device performance measurements, or a full user acceptance auction.

## Deployment / follow-up

Deploy the rebuilt frontend through the existing pipeline. This builds on the authoritative backend changes and pending-action protocol; keep frontend/backend revisions coordinated as described in the engineering report. No production deployment was performed.

Recommended next validation: a short staged auction with friends on actual phones/laptops, checking whether details are discoverable, Mystery Cards are easy to find, and Room options are understandable. Record a Chrome Performance trace for long tasks and image decoding before adding virtualization or more memoization. Broader setup/home/results simplification remains a separate follow-up.
