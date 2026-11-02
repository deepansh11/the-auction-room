# Manual match stats and Ballon d’Or

## Interface

**Enter player stats** opens a compact native dialog from a match row. The squad loads automatically for the selected team. Each player has only two editable fields: **Goals** and **Assists**. Names are read-only, empty inputs mean zero, and players without a contribution stay at zero. There is no photo picker, image paste handler, OCR scan, rating field, POTM selector, arbitrary manual-name row, or scan-validation banner.

The form automatically loads previously saved stats. Save errors retain the draft. Closing or switching teams with unsaved edits requires confirmation. Resaving replaces that team's match stats instead of adding another contribution. The form supports actual squad sizes rather than requiring exactly 16 entries.

Hosts can edit either team in a fixture; other signed-in participants can edit their own team only. Existing shared stats links remain usable without sign-in under their existing token permissions. Scoring explanation and link copying live under **Scoring & sharing** rather than competing with the main form. Public link URLs and legacy API names still contain “upload” for backward compatibility; they now open manual entry.

## Chosen scoring formula

The user explicitly chose to retain the existing hat-trick bonus:

```text
points = total goals + 0.75 × total assists + sum(floor(player goals in each match / 3))
```

- 3 goals + 2 assists in one match: **5.5 points**.
- 6 goals in one match: **8 points** (two existing-style bonuses).
- 2 goals in one match + 1 in another: **3 points**, no hat-trick bonus.
- Match rating, average rating, and POTM do not contribute or break ties.
- Tie-breaks: more goals, then more assists, then player name.

The same formula applies to existing stored goals/assists, so rankings may change. The standings explain that change. Zero-contribution players are omitted from the visible awards table. Duplicate snapshots for the same league/match/team use the latest updated submission, not an additive total.

## Persistence and compatibility

- `backend/shared/ballonDor.js` holds pure stat parsing, roster hydration, and ranking functions. It is inside `backend/` so a backend-root deployment remains self-contained; the frontend imports the same pure module.
- `backend/src/services/performanceSubmission.js` validates/persists signed-in and public submissions through one transaction path. Player names come from the stored squad/previous submission, not client text. Unknown/duplicate player IDs and negative/fractional/non-finite stats reject without writes. The payload must include every current roster and previously saved entry; use zero rather than silently dropping a record.
- Reuse of the existing stable submission document key makes retries/resaves non-additive. The original `createdAt` is retained. A hashed fallback key handles collisions in the older lossy slug IDs.
- Unedited legacy submissions are not migrated or rewritten. On edit, previous scan IDs match current squad rows by ID or normalized exact name; unmatched saved entries remain visibly labeled and editable as historical entries. Sold/listed squad players remain available for historical stats. Ambiguous old duplicate IDs cannot become multiple editable rows.
- Saving edited rows stores only canonical player ID/name/goals/assists, plus `source: manual` and `scoringVersion: goals-assists-hattricks-v1`. Old source metadata may remain on existing documents, but there are no new images or scans. New code does not delete production submissions.
- Existing routes and URL conventions are retained: `.../ballon-dor-submissions`, `.../ballon-dor-upload-link`, and public `.../ballon-dor-upload`. The public token model is unchanged; fixture query parameters are not a new cryptographically fixture-bound token scheme.

## Removed OCR assets

- Removed the Tesseract import and `tesseract.js` dependency/lockfile entries.
- Removed the unused `src/utils/performanceCapture.js` scan/parser code and root `eng.traineddata` asset.
- Removed image previews, preprocessing/recognition code, OCR timeout handling, and global image-paste listeners.
- The Ballon d’Or JS chunk changed from **59.82 kB / 18.76 kB gzip** to approximately **11.75 kB / 4.36 kB gzip**, plus about 3.13 kB CSS. These are build sizes, not measured browser/WAN latency.

## Validation

- `npm test`: 42 unit/socket tests passed; the emulator test remains separately gated.
- `npm run test:firestore`: passed against a local demo Firestore emulator, including canonical name enforcement, legacy editing, resave, signed-in host/owner access, unrelated-user rejection, invalid numbers/IDs, and valid/invalid public tokens.
- `npm run build`: passed.
- Optional `test:ui:stats` Chromium fixture harness passed: goals/assists-only inputs, automatic legacy hydration, native dialog dirty-close protection, save failure/retry, team isolation, no image/OCR/wasm requests, shared-link save, updated scoring, and desktop/390px/320px layouts.
- Existing results browser checks are also exercised, including opening the actual stats dialog from a match row.

Run the browser harness sequentially with the other Vite-based UI harnesses:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs npm run test:ui:stats
```

The frontend fixture harness intercepts loopback API requests; the integration test uses a loopback demo-only emulator. No production traffic or data writes were performed. These checks are not a full production security audit or cross-browser certification.

## Deployment and remaining concerns

Deploy frontend and backend together, include `backend/shared/`, and have old clients reload. Old OCR/manual-name payloads can now be rejected because they don't contain canonical roster IDs. Run `npm ci` in the relevant frontend/backend directories as normal. No data migration is required, and no deployment was performed here.

`npm uninstall` reported 14 dependency-audit findings (3 moderate, 7 high, 4 critical) in the remaining frontend dependency tree. No broad/forced dependency upgrades were applied during this feature change; those findings need a separate dependency audit.

Historical OCR mistakes cannot be automatically proven correct. They remain visible for manual correction; the revised formula does not repair previously entered goal/assist values. Simultaneous editors for the same team/match remain last-writer-wins, although each complete submission is transactionally validated and replaced. A future revision-conflict workflow can be added if concurrent stat editing is common.
