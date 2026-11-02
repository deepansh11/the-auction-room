# FC 26 clubs, fixture legs, and modal positioning

## Club association

Each squad header now has an **FC 26 · ISL club** dropdown. All 14 clubs listed in the checked FC 26 databases are available, including SC Delhi (Hyderabad FC in older squad updates) and United Tigers SC. This is the game roster, not the current real-world ISL season.

Sources checked November 2, 2026:

- https://fifaindex.com/leagues/2149-indian-super-league-1/fc26
- https://www.fifacm.com/26/league/2149/indian-super-league-1

The bundled elite-player CSV contains no ISL teams, so dropdown choices use a small checked, versioned list in `backend/shared/islClubs.js`; there are no runtime web requests. Installed FC 26 squad updates may use different names for a club.

Choices persist as `auctionResults/{resultId}.clubSelections`, keyed by the authenticated account name. Users can choose or clear their own squad's club, not another user's. Club selection is an association, not an account rename or an exclusive reservation: duplicate club selections are allowed, with owner names retained to distinguish fixtures.

Fixture rows and league standings display the club name with the original owner underneath. Match filtering, ownership checks, score writes, stat submissions, and squad identities continue using the original account names. Other participants pick up choices when entering a result view or refreshing scores. This is not a new real-time result-room subscription.

Selections are transactionally merged, so simultaneous choices don't overwrite each other. An active transfer session receives the metadata and a revision update; completed transfer results carry the association forward. API routes:

- `GET /api/results/:id/club-selections`
- `PUT /api/results/:id/club-selection` with `{clubId}` (empty string clears)

Both require the existing bearer JWT. No client-supplied username determines which squad is updated.

## Fixture customization

New-auction **Game options → Fixture legs** supports:

- Single: one match per pair.
- Double: home and away.
- Triple: three matches per pair; the third leg repeats the first leg's orientation.

The schema, both document normalizers, setup, backend/frontend generators, result filters, and persistence recognize `fixtureLeg: "triple"`. Group sizes still use the existing equalization/padding behavior. Additional balancing matches are displayed separately instead of being silently hidden by leg filters.

Shared leg-expansion helpers retain existing single/double fixture IDs. A third leg uses a distinct ID namespace, so old score/stat references do not move.

## Requested stored auction update: R430WD

The explicitly requested completed auction was found at `auctionResults/session:1793470575589` (room `R430WD`). It had one group of eight teams, 56 double-leg fixtures, and no entered match scores at inspection.

After local tests and a dry run, the maintenance command was applied:

- Set `fixtureLeg` to `triple`.
- Preserved all original 56 fixture records, including IDs and any score metadata.
- Appended 28 new third-leg records.
- Verified **84 unique fixtures**, **28 unique pairings**, **3 matches per pair**, **21 matches per team**, and **21 rounds** by reading the stored document back.
- Did not alter squads, budgets, participant names, stat submissions, or unrelated auctions.

A pre-change full-result backup was saved with restrictive permissions outside the repository at:

```text
/private/var/folders/75/r81rg93j1_l2pc1t14fzyzrh0000gp/T/opencode/R430WD-before-third-leg-20261102.json
```

That local backup may contain private result metadata and must not be committed or uploaded casually. Move it to secure durable storage if needed; the temporary directory is not a long-term backup service.

`scripts/update-room-fixture-legs.mjs` defaults to read-only/dry run and requires the exact room and result IDs. Applying also requires `--apply` and an external `--backup` path. It aborts if the document changes after the backup, refuses non-round-robin layouts, preserves original records, and is repeat-safe. Do not run it against other production records without explicit authorization.

## Stats dialog centering

The native stats dialog now explicitly sets `position: fixed; inset: 0; margin: auto`. Previously it depended on the browser's default dialog margins, which a global CSS reset could remove and leave it at the top-left. The browser test includes a global `* { margin: 0 }` reset and verifies both horizontal and vertical centering at desktop, 390px, and 320px widths.

## Validation and deployment

- 46 unit/socket tests passed (emulator-only integration test runs separately).
- Real Firestore emulator integration passed, including triple-leg room creation, club validation/ownership, saved canonical identities, and manual stats regressions.
- Chromium result checks passed for club selection, reload persistence, read-only other squads, updated fixture labels, and third-leg filtering.
- Setup Chromium checks passed with all three leg options and a triple-leg creation payload.
- Stats Chromium checks passed with explicit centering assertions under the margin reset.
- Production frontend build and diff checks passed.

Tests used loopback fixtures/emulators. The R430WD maintenance operation above was the **only intentional production-data mutation in this pass**. No frontend or backend deployment was performed. Deploy both together so the club routes and triple-leg normalizers are available; old clients may display the new schedule without proper leg labels until reloaded on the new version.
