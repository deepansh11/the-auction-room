import { createHash } from "node:crypto";
import { BALLON_DOR_SCORING_VERSION, manualStatRows, statCount } from "../../shared/ballonDor.js";

export function normalizeManualPlayers(input, team, previousSubmission) {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) throw Object.assign(new Error("Submit between 1 and 100 player entries."), { status: 400 });
  const allowed = new Map(manualStatRows(team, previousSubmission).map(player => [String(player.id), player]));
  const seen = new Set();
  const players = input.map(player => {
    const id = String(player?.id ?? "");
    const canonical = allowed.get(id);
    if (!canonical) throw Object.assign(new Error("Select players from the team's squad or its previously saved match entries."), { status: 400 });
    if (seen.has(id)) throw Object.assign(new Error("Duplicate player entries are not allowed."), { status: 400 });
    seen.add(id);
    const goals = statCount(player.goals);
    const assists = statCount(player.assists);
    if (goals === null || assists === null) throw Object.assign(new Error("Goals and assists must be non-negative whole numbers."), { status: 400 });
    return { id, name: canonical.name, goals, assists };
  });
  if (seen.size !== allowed.size) throw Object.assign(new Error("Include all squad players and previously saved entries. Use zero for players without a contribution."), { status: 400 });
  return players;
}

const idPart = value => String(value || "").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();

export async function saveManualSubmission({ db, auctionResultId, submission, username, publicToken = "", requestedFixtureId = "" }) {
  const fixtureId = String(submission?.fixtureId || "").trim();
  const teamName = String(submission?.mappedParticipantName || "").trim();
  if (!fixtureId || !teamName) throw Object.assign(new Error("Select a team and match before saving."), { status: 400 });
  if (requestedFixtureId && requestedFixtureId !== fixtureId) throw Object.assign(new Error("This link is for a different match."), { status: 403 });
  const legacyId = [auctionResultId, fixtureId, teamName].map(idPart).join("__");
  const resultRef = db.collection("auctionResults").doc(auctionResultId);
  const legacyRef = db.collection("auctionPerformanceSubmissions").doc(legacyId);
  // Keep the existing document key for compatible resaves, but detect lossy slug collisions.
  const collisionId = createHash("sha256").update(JSON.stringify([auctionResultId, fixtureId, teamName])).digest("hex");
  const collisionRef = db.collection("auctionPerformanceSubmissions").doc(`stats-${collisionId}`);
  return db.runTransaction(async transaction => {
    const [resultSnap, legacySnap, collisionSnap] = await Promise.all([transaction.get(resultRef), transaction.get(legacyRef), transaction.get(collisionRef)]);
    if (!resultSnap.exists) throw Object.assign(new Error("Result not found"), { status: 404 });
    const result = resultSnap.data();
    if (publicToken) {
      if (result.ballonDorUploadToken !== publicToken) throw Object.assign(new Error("Stats link is invalid or expired"), { status: 403 });
    } else if (!username || (username !== result.host && username !== teamName)) {
      throw Object.assign(new Error("You can only enter stats for your own team."), { status: 403 });
    }
    const fixture = Object.values(result.fixtures || {}).flatMap(group => Array.isArray(group) ? group : []).find(fixture => String(fixture?.id) === fixtureId);
    if (!fixture) throw Object.assign(new Error("Match not found"), { status: 404 });
    if (![fixture.home, fixture.away].includes(teamName)) throw Object.assign(new Error("Team is not part of this match."), { status: 400 });
    const team = (result.participants || []).find(team => team.name === teamName);
    if (!team) throw Object.assign(new Error("Team not found"), { status: 404 });
    const belongsToRequest = data => data.auctionResultId === auctionResultId && data.fixtureId === fixtureId && data.mappedParticipantName === teamName;
    const useCollision = legacySnap.exists && !belongsToRequest(legacySnap.data());
    const ref = useCollision ? collisionRef : legacyRef;
    const previous = (useCollision ? collisionSnap : legacySnap).data();
    const players = normalizeManualPlayers(submission.players, team, previous);
    const now = Date.now();
    const payload = {
      auctionResultId, fixtureId, fixtureLabel: `${fixture.home} vs ${fixture.away}`, mappedParticipantName: teamName,
      players, source: "manual", scoringVersion: BALLON_DOR_SCORING_VERSION,
      submittedBy: publicToken ? "shared-stats-link" : username,
      validation: { status: "ready", warnings: [], detectedPlayerCount: players.length },
      createdAt: previous?.createdAt || now, updatedAt: now,
    };
    // Merge preserves historical source/rating metadata; replacing players intentionally drops
    // ratings/POTM from edited entries. Unedited legacy submissions remain untouched.
    transaction.set(ref, payload, { merge: true });
    return { id: ref.path.split("/").at(-1), ...payload };
  });
}
