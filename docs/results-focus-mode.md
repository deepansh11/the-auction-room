# Results screen cleanup

## Interface

- Results now open on the signed-in user's **Squad**, showing one team at a time through a team selector, full player names, purchase prices, remaining budget, download, and formation/planning access.
- A compact league title and one line of context replace the large “League Centre” introduction, explanatory paragraphs, and repeated summary cards.
- Navigation is **Squads / Standings / Matches / Transfers / Awards**. Standings and matches are omitted when no league was configured. The read-only player catalogue is accessible through **Browse all players** in Squads, rather than combining catalogue browsing and transfer administration.
- Standings show rank, team, played, goal difference, and points by default. **Detailed stats** reveals wins/draws/losses, goals, form, and placement labels. Point deductions and the cup bracket are collapsed disclosures. Host cup controls are scoped to league views; transfer opening lives in Transfers.
- Matches use compact team/score rows. Opening one reveals the authorized score editor and **Enter player stats** action. Player stats now use the [manual goals/assists form](manual-match-stats.md), not photo uploads or OCR. Team and leg filters share one compact control row. Removed repeated “Synced” indicators, duplicate fixture labels, and per-match explanatory/status blocks.
- Transfers default to the user's own players, with optional owner selection. Squad players and listed players are separate categories. Unpurchased catalogue entries remain in player browsing. Advanced position/tier filters, deadline settings, and all-team budget breakdowns are collapsed.
- Player lists render 25 entries initially, with **Show more**. Removed redundant count cards, rank numbers, tier badges, “owner only” badges on every row, and unavailable transfer buttons. Only eligible owner actions appear.
- Awards and upload tools retain existing functionality and load behind local Suspense boundaries, preserving the header/navigation while loading.

## Score-saving change

Editing a score no longer sends HTTP requests after each keystroke. An explicit **Save result** submits both scores to the existing targeted score endpoint for hosts and participants. Authorization remains enforced on the backend.

- Standings update after successful persistence, not while typing.
- Failed saves retain the input, show an inline error, and allow retry.
- Both scores must be entered, or both cleared to remove a result. Clear score prepares an empty draft; **Save result** commits it.
- Unsaved changes are labeled. Closing an editor or changing views without saving discards that editor's draft.
- Removed the old shared debounce timer, which could cancel another fixture's queued save, and its unconditional “Synced” display.

No backend mutation rules, scoring/ranking formula, cup format, auction rules, or award calculation changed. Existing fixture-score concurrency semantics remain unchanged; this is not a new real-time result synchronization protocol.

## Additional corrections

- Stable default metadata objects prevent local transfer state from repeatedly resetting when optional metadata is omitted.
- Non-hosts initially see their own matches, but can now intentionally select **All teams** without an effect forcing the filter back.
- Squad spend is calculated from stored player acquisition prices instead of assuming every auction starts with 240M.
- Player catalogue loading is deferred until browsing players or transfers; it still uses the shared CSV cache.
- Penalty save calls are wrapped so a React click event cannot accidentally become the penalties payload.

## Files

- `src/screens/ResultsScreen.jsx`
- `src/components/ResultMatchRow.jsx`
- `src/styles/results.css`
- `tests/browser-results.mjs`
- `tests/firestore.test.mjs` (targeted score-route coverage)
- `package.json` (`test:ui:results`)

## Validation executed

- `npm test`: 27 tests passed; the emulator test is intentionally run separately.
- `npm run test:firestore`: passed against a loopback demo Firestore emulator. Includes host and participant targeted score saves, a zero-zero score, score clearing, and rejection of an unrelated participant.
- `npm run build`: passed.
- `git diff --check`: passed.
- Real Chromium fixture harness passed: default squad/selector, compact/detailed standings, collapsed penalties, explicit save/no request while typing, failure/retry, list/unlist, 25-row pagination, read-only catalogue, awards loading, host/non-host permissions, no-league results, and mobile layouts at 390px/320px. Expanded deadline settings were also checked for overflow at 390px.
- Existing auction Chromium harness was rerun and passed.

Optional UI test (Playwright installed in a separate tooling directory, no new app dependency):

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:ui:results
```

`FOCUS_SCREENSHOT_DIR=/existing/directory` optionally saves screenshots. The harness uses local Vite with synthetic HTTP fixtures; no production traffic or data is touched. Emulator tests use the separate demo-only configuration.

These are functional/layout checks, not full accessibility certification, cross-browser coverage, or production performance measurements. No deployment was performed. A staged user trial should verify that score saving, advanced host tools, transfer listing, and player browsing remain discoverable.
