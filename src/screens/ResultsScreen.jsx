import React from "react";
import { BallonDorPanel } from "../components/BallonDorPanel.jsx";
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { loadPlayersFromCsv } from "../data/players.js";
import { BUDGET, PCOLORS, SQUAD_MIN, SQUAD_MAX, TIERS, getTierData, getTierKey } from "../game/constants.js";
import { computeGroupTable, computeKnockoutMatchups } from "../game/groupsFixtures.js";
import { apiGetFixtures, apiGetSession, apiSaveFixtureScore, apiSaveFixtures, apiUpdateResultTransferListing, apiUpdateResultTransferWindow, apiUpdateSession } from "../lib/api.js";
import { downloadSquadImage } from "../utils/squadImage.js";
import { BTN } from "../utils/styles.js";
import { trackEvent } from "../lib/analytics.js";

function KnockoutBracket({
  groups,
  fixturesState,
  knockoutScores,
  nameMap = {},
  isHost,
  onScoreChange,
  onPublish,
  publishing,
  published,
  onRefresh,
  refreshing,
  knockoutFormat = "quarterFinal",
}) {
  const groupLabels = Object.keys(groups || {}).sort();
  const matchups = computeKnockoutMatchups(groupLabels, knockoutFormat);
  const isQF = knockoutFormat === "quarterFinal";
  const isFinalOnly = knockoutFormat === "finalOnly";

  function resolveSeed(key) {
    const pos = parseInt(key[0], 10) - 1;
    const grpLabel = key.slice(1);
    const rawTeams = (groups[grpLabel] || []).map((name) => nameMap[name] || name);
    const rawFixtures = (fixturesState[grpLabel] || []).map((fixture) => ({
      ...fixture,
      home: nameMap[fixture.home] || fixture.home,
      away: nameMap[fixture.away] || fixture.away,
    }));
    const table = computeGroupTable(rawTeams, rawFixtures);
    return table[pos]?.name || key;
  }

  const sfMatches = isQF
    ? [
        { id: "SF-0", homeKey: matchups[0] ? `W:${matchups[0].id}` : null, awayKey: matchups[1] ? `W:${matchups[1].id}` : null },
        { id: "SF-1", homeKey: matchups[2] ? `W:${matchups[2].id}` : null, awayKey: matchups[3] ? `W:${matchups[3].id}` : null },
      ]
    : [];
  const matchRegistry = {};
  matchups.forEach((matchup) => {
    matchRegistry[matchup.id] = matchup;
  });
  sfMatches.forEach((matchup) => {
    matchRegistry[matchup.id] = matchup;
  });

  function resolveTeam(key) {
    if (!key) return "";
    if (key.startsWith("W:")) {
      const refId = key.slice(2);
      const match = matchRegistry[refId];
      if (!match) return key;
      const home = resolveTeam(match.homeKey);
      const away = resolveTeam(match.awayKey);
      return getWinner(refId, home, away) || key;
    }
    return resolveSeed(key);
  }

  function getWinner(matchId, homeTeam, awayTeam) {
    const score = knockoutScores[matchId] || {};
    const h1 = Number(score.homeGoals);
    const a1 = Number(score.awayGoals);
    const h2 = Number(score.leg2HomeGoals);
    const a2 = Number(score.leg2AwayGoals);
    if (!Number.isFinite(h1) || !Number.isFinite(a1) || !Number.isFinite(h2) || !Number.isFinite(a2)) return null;
    const homeAgg = h1 + a2;
    const awayAgg = a1 + h2;
    return homeAgg > awayAgg ? homeTeam : awayAgg > homeAgg ? awayTeam : null;
  }

  function ScoreInput({ matchId, side, value }) {
    if (!isHost) {
      return React.createElement("div", {
        style: {
          width: 34,
          background: "#05070d",
          border: "1px solid #1e2028",
          borderRadius: 4,
          color: "#FFD700",
          fontFamily: "'Bebas Neue'",
          fontSize: 13,
          textAlign: "center",
          padding: "2px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 24,
        }
      }, value ?? "–");
    }

    return React.createElement("input", {
      type: "number",
      min: 0,
      value: value ?? "",
      onChange: (e) => onScoreChange?.(matchId, side, e.target.value),
      style: {
        width: 34,
        background: "#05070d",
        border: "1px solid #1e2028",
        borderRadius: 4,
        color: "#FFD700",
        fontFamily: "'Bebas Neue'",
        fontSize: 13,
        textAlign: "center",
        padding: "2px 0",
      },
    });
  }

  function MatchBox({ matchId, homeKey, awayKey, label, minWidth = 200 }) {
    const home = homeKey ? resolveTeam(homeKey) : null;
    const away = awayKey ? resolveTeam(awayKey) : null;
    const homeTBD = !home || home.startsWith("W:");
    const awayTBD = !away || away.startsWith("W:");
    const score = knockoutScores[matchId] || {};
    const winner = !homeTBD && !awayTBD ? getWinner(matchId, home, away) : null;
    const h1 = Number(score.homeGoals);
    const a1 = Number(score.awayGoals);
    const h2 = Number(score.leg2HomeGoals);
    const a2 = Number(score.leg2AwayGoals);
    const hasAgg = !homeTBD && !awayTBD && Number.isFinite(h1) && Number.isFinite(a1) && Number.isFinite(h2) && Number.isFinite(a2);
    const rowStyle = (team, tbd) => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: !tbd && winner === team ? "#FFD70015" : "#0d0f16",
      border: `1px solid ${!tbd && winner === team ? "#FFD70044" : "#1e2028"}`,
      borderRadius: 6,
      padding: "5px 8px",
      marginBottom: 2,
    });
    const legLabel = (text) => React.createElement("div", {
      style: {
        fontFamily: "'Bebas Neue'",
        fontSize: 8,
        color: "#444",
        letterSpacing: 2,
        marginBottom: 2,
        marginTop: 4,
      }
    }, text);

    return React.createElement("div", { style: { minWidth } },
      label && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 4 } }, label),
      legLabel("LEG 1"),
      React.createElement("div", { style: rowStyle(home, homeTBD) },
        React.createElement("span", {
          style: {
            flex: 1,
            fontFamily: "'Exo 2'",
            fontSize: 12,
            color: homeTBD ? "#333" : winner === home ? "#FFD700" : "#ccc",
            fontWeight: winner === home ? 700 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }
        }, homeTBD ? "TBD" : home),
        !homeTBD && React.createElement(ScoreInput, { matchId, side: "homeGoals", value: score.homeGoals })
      ),
      React.createElement("div", { style: rowStyle(away, awayTBD) },
        React.createElement("span", {
          style: {
            flex: 1,
            fontFamily: "'Exo 2'",
            fontSize: 12,
            color: awayTBD ? "#333" : winner === away ? "#FFD700" : "#ccc",
            fontWeight: winner === away ? 700 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }
        }, awayTBD ? "TBD" : away),
        !awayTBD && React.createElement(ScoreInput, { matchId, side: "awayGoals", value: score.awayGoals })
      ),
      legLabel("LEG 2"),
      React.createElement("div", { style: rowStyle(away, awayTBD) },
        React.createElement("span", {
          style: {
            flex: 1,
            fontFamily: "'Exo 2'",
            fontSize: 12,
            color: awayTBD ? "#333" : winner === away ? "#FFD700" : "#ccc",
            fontWeight: winner === away ? 700 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }
        }, awayTBD ? "TBD" : away),
        !awayTBD && React.createElement(ScoreInput, { matchId, side: "leg2HomeGoals", value: score.leg2HomeGoals })
      ),
      React.createElement("div", { style: rowStyle(home, homeTBD) },
        React.createElement("span", {
          style: {
            flex: 1,
            fontFamily: "'Exo 2'",
            fontSize: 12,
            color: homeTBD ? "#333" : winner === home ? "#FFD700" : "#ccc",
            fontWeight: winner === home ? 700 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }
        }, homeTBD ? "TBD" : home),
        !homeTBD && React.createElement(ScoreInput, { matchId, side: "leg2AwayGoals", value: score.leg2AwayGoals })
      ),
      hasAgg && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 9, color: "#888", marginTop: 4, letterSpacing: 1, textAlign: "center" } }, `AGG: ${home} ${h1 + a2} – ${a1 + h2} ${away}`),
      winner && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 9, color: "#FFD700", marginTop: 2, letterSpacing: 1 } }, `→ ${winner} advances`)
    );
  }

  function Connector({ side }) {
    const borderSide = side === "left" ? "borderRight" : "borderLeft";
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", flexShrink: 0 } },
      React.createElement("div", { style: { width: 24, height: "50%", borderTop: "1px solid #FFD70044", [borderSide]: "1px solid #FFD70044" } }),
      React.createElement("div", { style: { width: 24, height: "50%", borderBottom: "1px solid #FFD70044", [borderSide]: "1px solid #FFD70044" } })
    );
  }

  const finalLabels = groupLabels;
  const finalHomeKey = isQF ? "W:SF-0" : isFinalOnly ? `1${finalLabels[0] || "A"}` : (matchups[0] ? `W:${matchups[0].id}` : null);
  const finalAwayKey = isQF ? "W:SF-1" : isFinalOnly ? `1${finalLabels[1] || "B"}` : (matchups[matchups.length - 1] ? `W:${matchups[matchups.length - 1].id}` : null);
  const finalHome = finalHomeKey ? resolveTeam(finalHomeKey) : null;
  const finalAway = finalAwayKey ? resolveTeam(finalAwayKey) : null;
  const finalHomeTBD = !finalHome || finalHome.startsWith("W:");
  const finalAwayTBD = !finalAway || finalAway.startsWith("W:");
  const finalScore = knockoutScores.FINAL || {};
  const fh1 = Number(finalScore.homeGoals);
  const fa1 = Number(finalScore.awayGoals);
  const finalWinner = !finalHomeTBD && !finalAwayTBD && Number.isFinite(fh1) && Number.isFinite(fa1)
    ? (fh1 > fa1 ? finalHome : fa1 > fh1 ? finalAway : null)
    : null;
  const finalRowStyle = (team, tbd) => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    background: !tbd && finalWinner === team ? "#FFD70015" : "transparent",
    borderRadius: 4,
    padding: "2px 4px",
  });

  const centerFinal = React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, minWidth: 200 } },
    React.createElement("img", { src: "/world-cup-trophy.png", alt: "World Cup", style: { width: 80, height: "auto", filter: "drop-shadow(0 0 12px #FFD700aa)" } }),
    React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 13, color: "#FFD700", letterSpacing: 2, marginBottom: 4 } }, "FINAL"),
    React.createElement("div", { style: { background: "#0d0f16", border: "1px solid #FFD70044", borderRadius: 8, padding: "8px 12px", width: "100%" } },
      [
        { team: finalHome, tbd: finalHomeTBD, side: "homeGoals" },
        { team: finalAway, tbd: finalAwayTBD, side: "awayGoals" },
      ].map(({ team, tbd, side }) =>
        React.createElement("div", { key: side, style: finalRowStyle(team, tbd) },
          React.createElement("span", {
            style: {
              flex: 1,
              fontFamily: "'Exo 2'",
              fontSize: 12,
              color: tbd ? "#333" : finalWinner === team ? "#FFD700" : "#ccc",
              fontWeight: finalWinner === team ? 700 : 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }
          }, tbd ? "TBD" : team),
          !tbd && React.createElement(ScoreInput, { matchId: "FINAL", side, value: finalScore[side] })
        )
      )
    ),
    finalWinner && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 14, color: "#FFD700", letterSpacing: 2, textAlign: "center", textShadow: "0 0 16px #FFD700aa" } }, `🏆 ${finalWinner}`)
  );

  let bracketBody;

  if (isFinalOnly) {
    bracketBody = React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, centerFinal);
  } else if (isQF) {
    const allQFs = [...matchups.slice(0, 2), ...matchups.slice(2, 4)];
    const [sfLeft, sfRight] = sfMatches;
    const borderColor = "#FFD70033";
    const roundLabel = (text) => React.createElement("div", {
      style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#4FC3F7", letterSpacing: 3, marginBottom: 6, textAlign: "center" }
    }, text);

    bracketBody = React.createElement("div", { style: { display: "flex", flexDirection: "column" } },
      roundLabel("QUARTER FINALS"),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 } },
        allQFs.map((matchup) => React.createElement(MatchBox, {
          key: matchup.id,
          matchId: matchup.id,
          homeKey: matchup.homeKey,
          awayKey: matchup.awayKey,
          label: `QF · ${matchup.homeKey} v ${matchup.awayKey}`,
          minWidth: 0,
        }))
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", height: 22 } },
        [0, 1, 2, 3].map((index) => React.createElement("div", {
          key: index,
          style: {
            borderBottom: `1px solid ${borderColor}`,
            [index % 2 === 0 ? "borderRight" : "borderLeft"]: `1px solid ${borderColor}`,
          }
        }))
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", marginBottom: 6, marginTop: 6 } },
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#FFD700", letterSpacing: 2, textAlign: "center" } }, "SEMI-FINAL"),
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#FFD700", letterSpacing: 2, textAlign: "center" } }, "SEMI-FINAL")
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, sfLeft && React.createElement(MatchBox, { matchId: sfLeft.id, homeKey: sfLeft.homeKey, awayKey: sfLeft.awayKey, minWidth: 0 })),
        React.createElement("div", { style: { display: "flex", justifyContent: "center" } }, sfRight && React.createElement(MatchBox, { matchId: sfRight.id, homeKey: sfRight.homeKey, awayKey: sfRight.awayKey, minWidth: 0 }))
      ),
      React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", height: 22 } },
        React.createElement("div", { style: { borderBottom: `1px solid ${borderColor}`, borderRight: `1px solid ${borderColor}` } }),
        React.createElement("div", { style: { borderBottom: `1px solid ${borderColor}`, borderLeft: `1px solid ${borderColor}` } })
      ),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, paddingTop: 4 } },
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 11, color: "#FFD700", letterSpacing: 3 } }, "FINAL"),
        React.createElement("img", { src: "/world-cup-trophy.png", alt: "World Cup", style: { width: 64, height: "auto", filter: "drop-shadow(0 0 10px #FFD700aa)" } }),
        React.createElement("div", { style: { background: "#0d0f16", border: "1px solid #FFD70044", borderRadius: 8, padding: "8px 12px", width: 220 } },
          [
            { team: finalHome, tbd: finalHomeTBD, side: "homeGoals" },
            { team: finalAway, tbd: finalAwayTBD, side: "awayGoals" },
          ].map(({ team, tbd, side }) =>
            React.createElement("div", { key: side, style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } },
              React.createElement("span", {
                style: {
                  flex: 1,
                  fontFamily: "'Exo 2'",
                  fontSize: 12,
                  color: tbd ? "#333" : finalWinner === team ? "#FFD700" : "#ccc",
                  fontWeight: finalWinner === team ? 700 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }
              }, tbd ? "TBD" : team),
              !tbd && React.createElement(ScoreInput, { matchId: "FINAL", side, value: finalScore[side] })
            )
          )
        ),
        finalWinner && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 15, color: "#FFD700", letterSpacing: 2, textAlign: "center", textShadow: "0 0 16px #FFD700aa" } }, `🏆 ${finalWinner}`)
      )
    );
  } else {
    const sfMatchupsFiltered = matchups.filter((matchup) => matchup.round === "R16" || matchup.round === "SF");
    const half = Math.ceil(sfMatchupsFiltered.length / 2);
    const leftSFs = sfMatchupsFiltered.slice(0, half);
    const rightSFs = sfMatchupsFiltered.slice(half);

    bracketBody = React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 0 } },
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, flex: 1 } }, leftSFs.map((matchup) => React.createElement(MatchBox, { key: matchup.id, matchId: matchup.id, homeKey: matchup.homeKey, awayKey: matchup.awayKey, label: `SEMI-FINAL (${matchup.homeKey} v ${matchup.awayKey})` }))),
      React.createElement(Connector, { side: "left" }),
      centerFinal,
      React.createElement(Connector, { side: "right" }),
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, flex: 1 } }, rightSFs.map((matchup) => React.createElement(MatchBox, { key: matchup.id, matchId: matchup.id, homeKey: matchup.homeKey, awayKey: matchup.awayKey, label: `SEMI-FINAL (${matchup.homeKey} v ${matchup.awayKey})` })))
    );
  }

  return React.createElement("div", { style: { background: "#07080f", border: "1px solid #FFD70033", borderRadius: 14, padding: 24, marginTop: 8 } },
    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 } },
      React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 20, color: "#FFD700", letterSpacing: 3 } }, "KNOCKOUT STAGE"),
      isHost
        ? React.createElement("button", {
            onClick: onPublish,
            disabled: publishing || published,
            style: {
              background: published ? "#00FF8822" : "linear-gradient(135deg,#FFD700,#FFA500)",
              color: published ? "#00FF88" : "#000",
              border: published ? "1px solid #00FF8844" : "none",
              borderRadius: 7,
              padding: "6px 16px",
              cursor: publishing || published ? "default" : "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 12,
              letterSpacing: 1,
              opacity: publishing ? 0.7 : 1,
            }
          }, publishing ? "PUBLISHING…" : published ? "✓ PUBLISHED" : "PUBLISH RESULTS")
        : React.createElement("button", {
            onClick: onRefresh,
            disabled: refreshing,
            style: {
              background: "#0d0f16",
              color: "#888",
              border: "1px solid #1e2028",
              borderRadius: 7,
              padding: "6px 14px",
              cursor: refreshing ? "default" : "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 11,
              letterSpacing: 1,
              opacity: refreshing ? 0.6 : 1,
            }
          }, refreshing ? "LOADING…" : "↺ REFRESH")
    ),
    !isHost && React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#444", marginBottom: 12, textAlign: "right" } }, "Results are published by the host"),
    bracketBody
  );
}

function buildNameMap(participants, groups) {
  const realNames = new Set((participants || []).map((participant) => participant.name));
  const nameMap = {};
  Object.values(groups || {}).flat().forEach((name) => {
    if (!realNames.has(name) && /^player\s+\d+$/i.test(String(name || ""))) {
      const match = String(name).match(/\d+/);
      const n = match ? parseInt(match[0], 10) : NaN;
      const real = Number.isFinite(n) ? (participants || [])[n - 1]?.name : null;
      if (real) nameMap[name] = real;
    }
  });
  return nameMap;
}

function getBaseRoundCount(teamCount) {
  if (teamCount < 2) return 0;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

function hasRecordedScoreValue(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function isPlayedFixture(fixture) {
  return hasRecordedScoreValue(fixture?.homeGoals) && hasRecordedScoreValue(fixture?.awayGoals);
}

function formatRelativeTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "Awaiting score";
  const diffMs = Date.now() - value;
  if (diffMs < 60 * 1000) return "Updated just now";
  const mins = Math.round(diffMs / (60 * 1000));
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Updated ${days}d ago`;
}

function buildLeagueTable(teams, fixtures, participantMeta) {
  const tableMap = new Map();
  (teams || []).forEach((team) => {
    tableMap.set(team, {
      name: team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      form: [],
      color: participantMeta.get(team)?.color || "#FFD700",
    });
  });

  [...(fixtures || [])]
    .filter(isPlayedFixture)
    .sort((a, b) => (Number(a.round) || 0) - (Number(b.round) || 0))
    .forEach((fixture) => {
      const home = tableMap.get(fixture.home);
      const away = tableMap.get(fixture.away);
      if (!home || !away) return;
      const homeGoals = Number(fixture.homeGoals);
      const awayGoals = Number(fixture.awayGoals);

      home.played += 1;
      away.played += 1;
      home.gf += homeGoals;
      home.ga += awayGoals;
      away.gf += awayGoals;
      away.ga += homeGoals;

      if (homeGoals > awayGoals) {
        home.won += 1;
        away.lost += 1;
        home.points += 3;
        home.form.push("W");
        away.form.push("L");
      } else if (homeGoals < awayGoals) {
        away.won += 1;
        home.lost += 1;
        away.points += 3;
        home.form.push("L");
        away.form.push("W");
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
        home.form.push("D");
        away.form.push("D");
      }
    });

  return Array.from(tableMap.values())
    .map((entry) => ({ ...entry, gd: entry.gf - entry.ga, form: entry.form.slice(-5) }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });
}

function TeamBadge({ name, color, small = false }) {
  const initials = String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
  const size = small ? 28 : 34;

  return React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: 999,
      background: `radial-gradient(circle at 30% 30%, ${color}cc, #0f1522 75%)`,
      border: `1px solid ${color}77`,
      boxShadow: `0 0 20px ${color}22`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      fontFamily: "'Bebas Neue'",
      fontSize: small ? 13 : 15,
      letterSpacing: 1,
      flexShrink: 0,
    }
  }, initials);
}

function FormChips({ form }) {
  const colors = { W: "#22c55e", D: "#94a3b8", L: "#ef4444" };
  return React.createElement("div", { style: { display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" } },
    (form || []).length === 0
      ? React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#566074" } }, "—")
      : (form || []).map((value, index) => React.createElement("span", {
          key: `${value}-${index}`,
          style: {
            width: 22,
            height: 22,
            borderRadius: 999,
            background: colors[value] || "#334155",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Bebas Neue'",
            fontSize: 11,
          }
        }, value))
  );
}

function LeaguePlacementChip({ index, totalTeams, seasonNumber }) {
  if (seasonNumber <= 1) {
    return React.createElement("span", {
      style: {
        fontFamily: "'Rajdhani'",
        fontSize: 10,
        fontWeight: 700,
        color: "#FFD700",
        background: "#FFD70014",
        border: "1px solid #FFD70033",
        borderRadius: 999,
        padding: "2px 8px",
      }
    }, "ELITE");
  }

  if (index < 5) {
    return React.createElement("span", {
      style: {
        fontFamily: "'Rajdhani'",
        fontSize: 10,
        fontWeight: 700,
        color: "#4FC3F7",
        background: "#4FC3F714",
        border: "1px solid #4FC3F733",
        borderRadius: 999,
        padding: "2px 8px",
      }
    }, "ELITE");
  }

  if (index >= Math.max(totalTeams - 5, 0)) {
    return React.createElement("span", {
      style: {
        fontFamily: "'Rajdhani'",
        fontSize: 10,
        fontWeight: 700,
        color: "#FF6B35",
        background: "#FF6B3514",
        border: "1px solid #FF6B3533",
        borderRadius: 999,
        padding: "2px 8px",
      }
    }, "TITAN");
  }

  return React.createElement("span", {
    style: {
      fontFamily: "'Rajdhani'",
      fontSize: 10,
      fontWeight: 700,
      color: "#94a3b8",
      background: "#94a3b814",
      border: "1px solid #94a3b833",
      borderRadius: 999,
      padding: "2px 8px",
    }
  }, "MID");
}

function StandingsTable({ rows, seasonNumber }) {
  return React.createElement("div", { style: { overflowX: "auto" } },
    React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 920 } },
      React.createElement("thead", null,
        React.createElement("tr", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#718096" } },
          ["#", "TEAM", "PLD", "W", "D", "L", "GF", "GA", "GD", "PTS", "FORM"].map((heading) => React.createElement("th", {
            key: heading,
            style: {
              textAlign: heading === "TEAM" ? "left" : "center",
              padding: "10px 8px",
              borderBottom: "1px solid #1e2230",
              letterSpacing: 1,
            }
          }, heading))
        )
      ),
      React.createElement("tbody", null,
        rows.map((row, index) => React.createElement("tr", {
          key: row.name,
          style: {
            background: index % 2 === 0 ? "#0d1119aa" : "transparent",
            fontFamily: "'Rajdhani'",
            fontSize: 13,
            color: "#d9e1ef",
          }
        },
        React.createElement("td", { style: { textAlign: "center", padding: "12px 8px", fontWeight: 700 } }, index + 1),
        React.createElement("td", { style: { padding: "12px 8px" } },
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            React.createElement(TeamBadge, { name: row.name, color: row.color, small: true }),
            React.createElement("div", { style: { minWidth: 0 } },
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 18, color: "#fff", letterSpacing: 1 } }, row.name),
              React.createElement(LeaguePlacementChip, { index, totalTeams: rows.length, seasonNumber })
            )
          )
        ),
        ["played", "won", "drawn", "lost", "gf", "ga"].map((key) => React.createElement("td", { key, style: { textAlign: "center", padding: "12px 8px" } }, row[key])),
        React.createElement("td", {
          style: {
            textAlign: "center",
            padding: "12px 8px",
            color: row.gd > 0 ? "#22c55e" : row.gd < 0 ? "#ef4444" : "#cbd5e1",
            fontWeight: 700,
          }
        }, row.gd > 0 ? `+${row.gd}` : row.gd),
        React.createElement("td", {
          style: {
            textAlign: "center",
            padding: "12px 8px",
            fontFamily: "'Bebas Neue'",
            fontSize: 20,
            color: "#FFD700",
            letterSpacing: 1,
          }
        }, row.points),
        React.createElement("td", { style: { textAlign: "right", padding: "12px 8px" } }, React.createElement(FormChips, { form: row.form }))))
      )
    )
  );
}

function getFixturesLastUpdated(fixtures) {
  return (fixtures || []).reduce((max, fixture) => Math.max(max, Number(fixture?.scoreUpdatedAt) || 0), 0);
}

function getPlayerAcquisitionPrice(player, tiers = TIERS) {
  const explicitPrice = Number(player?.purchasePrice);
  if (Number.isFinite(explicitPrice)) return explicitPrice;
  const rating = Number(player?.rating);
  return Number(getTierData(rating, tiers)?.price || 0);
}

function toDateTimeLocalValue(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toDateInputValue(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toHourInputValue(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(value);
  return String(date.getHours()).padStart(2, "0");
}

function toMinuteInputValue(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(value);
  return String(date.getMinutes()).padStart(2, "0");
}

function fromDateAndTimeValue(dateValue, hourValue, minuteValue) {
  if (!dateValue || hourValue === "" || minuteValue === "") return null;
  const parsed = new Date(`${dateValue}T${hourValue}:${minuteValue}`);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

const DEADLINE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const DEADLINE_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

function formatCountdown(ms) {
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "00:00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) {
    return `${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function restoreTransferredPlayer(player) {
  if (!player || typeof player !== "object") return player;
  const { soldAt, salePrice, ...restoredPlayer } = player;
  return {
    ...restoredPlayer,
    soldInTransferWindow: false,
  };
}

function filterInventoryPlayers(rows, { search = "", owner = "ALL", pos = "ALL", tier = "ALL", tiers = TIERS } = {}) {
  const needle = String(search || "").trim().toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (owner !== "ALL" && row.owner !== owner) return false;
    if (pos !== "ALL" && row.pos !== pos) return false;
    if (tier !== "ALL" && getTierKey(row.rating, tiers) !== tier) return false;
    if (!needle) return true;
    return String(row.name || "").toLowerCase().includes(needle)
      || String(row.owner || "").toLowerCase().includes(needle);
  });
}

export function ResultsScreen({
  participants,
  wishlists,
  players = [],
  tiers = TIERS,
  selectedName,
  auctionResultId,
  user,
  host = "",
  onRefresh,
  groupsEnabled = false,
  groups = {},
  fixtures = {},
  knockoutFormat = "quarterFinal",
  onStartTransferWindow,
  fixtureLeg = "single",
  seasonInfo = {},
  transferWindow = {},
  onBackToDiscover,
}) {
  React.useLayoutEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    resetScroll();
    const raf = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const isHost = Boolean(host && user?.username && host === user.username);
  const [view, setView] = React.useState("table");
  const [analyserOpen, setAnalyserOpen] = React.useState(false);
  const [selectedUploadFixture, setSelectedUploadFixture] = React.useState(null);
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyOwnerFilter, setHistoryOwnerFilter] = React.useState("ALL");
  const [historyPosFilter, setHistoryPosFilter] = React.useState("ALL");
  const [historyTierFilter, setHistoryTierFilter] = React.useState("ALL");
  const [historySectionFilter, setHistorySectionFilter] = React.useState("ALL");
  const [matchTeamFilter, setMatchTeamFilter] = React.useState("ALL");
  const [matchLegFilter, setMatchLegFilter] = React.useState("ALL");
  const [fixturesState, setFixturesState] = React.useState(() => {
    const next = fixtures || {};
    const { _knockout, ...groupFixtures } = next;
    return groupFixtures;
  });
  const [catalogPlayers, setCatalogPlayers] = React.useState([]);
  const [savingFixtureId, setSavingFixtureId] = React.useState("");
  const [knockoutScores, setKnockoutScores] = React.useState(() => (fixtures || {})._knockout || {});
  const [knockoutPublishing, setKnockoutPublishing] = React.useState(false);
  const [knockoutPublished, setKnockoutPublished] = React.useState(false);
  const [loadingLatest, setLoadingLatest] = React.useState(false);
  const [startingTransferWindow, setStartingTransferWindow] = React.useState(false);
  const [deadlineDateDraft, setDeadlineDateDraft] = React.useState("");
  const [deadlineHourDraft, setDeadlineHourDraft] = React.useState("");
  const [deadlineMinuteDraft, setDeadlineMinuteDraft] = React.useState("");
  const [deadlineSaving, setDeadlineSaving] = React.useState(false);
  const [clockNow, setClockNow] = React.useState(Date.now());
  const [resultTransferState, setResultTransferState] = React.useState({
    participants,
    carriedBudgets: {},
    expectedBudgets: {},
    transferWindow,
  });
  const [transferSessionState, setTransferSessionState] = React.useState(null);
  const [transferSyncLoading, setTransferSyncLoading] = React.useState(false);
  const [transferActionPlayerId, setTransferActionPlayerId] = React.useState("");
  const [transferActionMessage, setTransferActionMessage] = React.useState("");
  const saveFixturesTimerRef = React.useRef(null);
  const nameMap = React.useMemo(() => buildNameMap(participants, groups), [participants, groups]);

  React.useEffect(() => {
    const next = fixtures || {};
    const { _knockout, ...groupFixtures } = next;
    setFixturesState(groupFixtures);
    setKnockoutScores((prev) => Object.keys(prev).length > 0 ? prev : (_knockout || {}));
  }, [fixtures]);

  React.useEffect(() => {
    let cancelled = false;
    loadPlayersFromCsv()
      .then((nextPlayers) => {
        if (!cancelled) {
          setCatalogPlayers(Array.isArray(nextPlayers) ? nextPlayers : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogPlayers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    setResultTransferState({
      participants,
      carriedBudgets: {},
      expectedBudgets: {},
      transferWindow,
    });
  }, [participants, transferWindow]);

  const participantMeta = React.useMemo(() => new Map(
    (participants || []).map((participant, index) => [
      participant.name,
      { color: PCOLORS[index % PCOLORS.length], index },
    ])
  ), [participants]);

  const seasonNumber = Number(seasonInfo?.seasonNumber || 1);
  const leagueName = String(seasonInfo?.leagueName || "Elite League");

  const resolvedGroups = React.useMemo(() => {
    const next = {};
    Object.entries(groups || {}).forEach(([label, teamNames]) => {
      next[label] = (teamNames || []).map((name) => nameMap[name] || name);
    });
    return next;
  }, [groups, nameMap]);

  const resolvedFixturesByGroup = React.useMemo(() => {
    const next = {};
    Object.entries(fixturesState || {}).forEach(([label, groupFixtures]) => {
      next[label] = (groupFixtures || []).map((fixture) => ({
        ...fixture,
        home: nameMap[fixture.home] || fixture.home,
        away: nameMap[fixture.away] || fixture.away,
      }));
    });
    return next;
  }, [fixturesState, nameMap]);

  const allFixtures = React.useMemo(() => Object.values(resolvedFixturesByGroup).flat().sort((a, b) => {
    const roundDiff = (Number(a.round) || 0) - (Number(b.round) || 0);
    if (roundDiff !== 0) return roundDiff;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }), [resolvedFixturesByGroup]);

  const latestFixtureTimestamp = React.useMemo(() => getFixturesLastUpdated(allFixtures), [allFixtures]);
  const totalMatches = allFixtures.length;
  const playedMatches = allFixtures.filter(isPlayedFixture).length;
  const standings = React.useMemo(
    () => buildLeagueTable(participants.map((participant) => participant.name), allFixtures, participantMeta),
    [participants, allFixtures, participantMeta]
  );
  const matchTeamOptions = React.useMemo(
    () => participants.map((participant) => participant.name).filter(Boolean),
    [participants]
  );

  React.useEffect(() => {
    if (matchTeamFilter !== "ALL" && !matchTeamOptions.includes(matchTeamFilter)) {
      setMatchTeamFilter("ALL");
      return;
    }
    if (matchTeamFilter !== "ALL") return;
    if (isHost) return;
    if (selectedName && matchTeamOptions.includes(selectedName)) {
      setMatchTeamFilter(selectedName);
    }
  }, [isHost, matchTeamFilter, matchTeamOptions, selectedName]);

  const groupSections = React.useMemo(() => {
    const splitForLegs = fixtureLeg === "double";
    return Object.entries(resolvedGroups).flatMap(([label, teams]) => {
      const groupFixtures = [...(resolvedFixturesByGroup[label] || [])].sort((a, b) => {
        const roundDiff = (Number(a.round) || 0) - (Number(b.round) || 0);
        if (roundDiff !== 0) return roundDiff;
        return String(a.id || "").localeCompare(String(b.id || ""));
      });
      const firstLegLimit = getBaseRoundCount(teams.length);
      const firstLeg = groupFixtures.filter((fixture) => Number(fixture.round || 0) <= firstLegLimit);
      const secondLeg = groupFixtures.filter((fixture) => Number(fixture.round || 0) > firstLegLimit);
      if (!splitForLegs) {
        return [{ id: `${label}-all`, groupLabel: label, leg: "ALL", title: `Group ${label}`, subtitle: `${teams.length} teams`, fixtures: groupFixtures }];
      }
      const sections = [{ id: `${label}-first`, groupLabel: label, leg: "FIXTURE_1", title: `Group ${label} · Fixture 1`, subtitle: "First set of combinations", fixtures: firstLeg }];
      if (secondLeg.length > 0) {
        sections.push({ id: `${label}-second`, groupLabel: label, leg: "FIXTURE_2", title: `Group ${label} · Fixture 2`, subtitle: "Second set of combinations", fixtures: secondLeg });
      }
      return sections;
    });
  }, [resolvedGroups, resolvedFixturesByGroup, fixtureLeg]);
  const hasFixtureSplit = React.useMemo(
    () => groupSections.some((section) => section.leg === "FIXTURE_1" || section.leg === "FIXTURE_2"),
    [groupSections]
  );
  const filteredGroupSections = React.useMemo(() => {
    const teamFiltered = matchTeamFilter === "ALL"
      ? groupSections
      : groupSections
        .map((section) => ({
          ...section,
          fixtures: section.fixtures.filter((fixture) => fixture.home === matchTeamFilter || fixture.away === matchTeamFilter),
        }))
        .filter((section) => section.fixtures.length > 0);

    if (!hasFixtureSplit || matchLegFilter === "ALL") return teamFiltered;
    return teamFiltered.filter((section) => section.leg === matchLegFilter);
  }, [groupSections, hasFixtureSplit, matchLegFilter, matchTeamFilter]);

  const firstRoundComplete = React.useMemo(() => {
    if (!groupsEnabled || Object.keys(resolvedGroups).length === 0) return false;
    return Object.entries(resolvedGroups).every(([label, teams]) => {
      const firstLegLimit = getBaseRoundCount(teams.length);
      if (firstLegLimit === 0) return false;
      const relevant = (resolvedFixturesByGroup[label] || []).filter((fixture) => Number(fixture.round || 0) <= firstLegLimit);
      return relevant.length > 0 && relevant.every(isPlayedFixture);
    });
  }, [groupsEnabled, resolvedGroups, resolvedFixturesByGroup]);

  const effectiveTransferWindow = transferSessionState?.transferWindow || resultTransferState.transferWindow || transferWindow || {};
  const transferWindowAlreadyOpened = Boolean(transferWindow?.activeSessionId || transferWindow?.openedAt);
  const transferSessionId = String(transferWindow?.activeSessionId || "");
  const listingDeadlineAt = Number(effectiveTransferWindow?.listingDeadlineAt || 0);
  const listingDeadlineValid = Number.isFinite(listingDeadlineAt) && listingDeadlineAt > 0;
  const listingDeadlineRemaining = listingDeadlineValid ? listingDeadlineAt - clockNow : null;
  const listingDeadlinePassed = listingDeadlineValid && listingDeadlineRemaining <= 0;
  const listingDeadlineText = listingDeadlineValid
    ? listingDeadlineRemaining > 0
      ? `Listing deadline in ${formatCountdown(listingDeadlineRemaining)}`
      : "Listing deadline reached"
    : "No listing deadline set";
  const transferListingEditable = Boolean(
    user?.token
    && !listingDeadlinePassed
    && (
      (transferSessionId && transferSessionState && effectiveTransferWindow.phase === "selling")
      || !transferSessionId
    )
  );

  const loadTransferSession = React.useCallback(async () => {
    if (!transferSessionId || !user?.token) {
      setTransferSessionState(null);
      return;
    }
    setTransferSyncLoading(true);
    try {
      const latest = await apiGetSession(transferSessionId, user.token);
      setTransferSessionState(latest || null);
    } catch (_err) {
      setTransferSessionState(null);
    } finally {
      setTransferSyncLoading(false);
    }
  }, [transferSessionId, user?.token]);

  const loadLatestFixtures = React.useCallback(async () => {
    if (!auctionResultId || !user?.token) return;
    setLoadingLatest(true);
    try {
      const latest = await apiGetFixtures(auctionResultId, user.token);
      const { _knockout, ...groupFixtures } = latest;
      setFixturesState(groupFixtures);
      if (_knockout && typeof _knockout === "object") {
        setKnockoutScores(_knockout);
      }
    } catch (_) {
      // Keep the existing UI state if refresh fails.
    } finally {
      setLoadingLatest(false);
    }
  }, [auctionResultId, user?.token]);

  React.useEffect(() => {
    loadLatestFixtures();
  }, [auctionResultId, loadLatestFixtures]);

  React.useEffect(() => {
    loadTransferSession();
  }, [loadTransferSession]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    setDeadlineDateDraft(toDateInputValue(effectiveTransferWindow.listingDeadlineAt));
    setDeadlineHourDraft(toHourInputValue(effectiveTransferWindow.listingDeadlineAt));
    setDeadlineMinuteDraft(toMinuteInputValue(effectiveTransferWindow.listingDeadlineAt));
  }, [effectiveTransferWindow.listingDeadlineAt]);

  const inventoryParticipants = React.useMemo(
    () => (Array.isArray(transferSessionState?.participants) && transferSessionState.participants.length > 0
      ? transferSessionState.participants
      : (Array.isArray(resultTransferState.participants) && resultTransferState.participants.length > 0 ? resultTransferState.participants : participants)),
    [participants, resultTransferState.participants, transferSessionState?.participants]
  );
  const expectedBudgetMap = React.useMemo(() => {
    const sessionBudgets = transferSessionState?.expectedBudgets;
    if (sessionBudgets && typeof sessionBudgets === "object" && Object.keys(sessionBudgets).length > 0) {
      return sessionBudgets;
    }
    const resultBudgets = resultTransferState?.expectedBudgets;
    if (resultBudgets && typeof resultBudgets === "object" && Object.keys(resultBudgets).length > 0) {
      return resultBudgets;
    }
    return Object.fromEntries(inventoryParticipants.map((participant) => [
      participant.name,
      Number(participant?.budget || 0),
    ]));
  }, [inventoryParticipants, resultTransferState?.expectedBudgets, transferSessionState?.expectedBudgets]);
  const expectedBudgetCards = React.useMemo(() => inventoryParticipants.map((participant) => {
    const listedGain = (Array.isArray(participant?.soldPlayers) ? participant.soldPlayers : [])
      .reduce((sum, player) => sum + (Number(player?.salePrice) || getPlayerAcquisitionPrice(player, tiers)), 0);
    const expectedBudget = Number(expectedBudgetMap?.[participant.name] ?? participant?.budget ?? 0);
    const baseBudget = Math.max(0, expectedBudget - listedGain);
    return {
      name: participant.name,
      expectedBudget,
      baseBudget,
      listedGain,
    };
  }), [expectedBudgetMap, inventoryParticipants, tiers]);
  const purchasedPlayers = React.useMemo(() => inventoryParticipants.flatMap((participant) => {
    const ownerIdx = participants.findIndex((entry) => entry.name === participant.name);
    const squadRows = (Array.isArray(participant?.squad) ? participant.squad : []).map((player) => ({
      ...player,
      owner: participant.name,
      ownerIdx,
      isTransferListed: false,
      transferPrice: getPlayerAcquisitionPrice(player, tiers),
    }));
    const listedRows = (Array.isArray(participant?.soldPlayers) ? participant.soldPlayers : []).map((player) => ({
      ...player,
      owner: participant.name,
      ownerIdx,
      isTransferListed: true,
      transferPrice: Number(player?.salePrice) || getPlayerAcquisitionPrice(player, tiers),
    }));
    return [...squadRows, ...listedRows];
  }), [inventoryParticipants, participants, tiers]);
  const purchasedPlayerIds = React.useMemo(
    () => new Set(purchasedPlayers.map((player) => Number(player?.id)).filter(Number.isFinite)),
    [purchasedPlayers]
  );
  const transferListedPlayers = React.useMemo(
    () => purchasedPlayers.filter((player) => player.isTransferListed),
    [purchasedPlayers]
  );
  const allAuctionPlayers = React.useMemo(
    () => (Array.isArray(catalogPlayers) && catalogPlayers.length > 0 ? catalogPlayers : (Array.isArray(players) ? players : [])),
    [catalogPlayers, players]
  );
  const unpurchasedPlayers = React.useMemo(() => allAuctionPlayers
    .filter((player) => Number.isFinite(Number(player?.id)))
    .filter((player) => !purchasedPlayerIds.has(Number(player.id)))
    .map((player) => ({
      ...player,
      owner: "",
      ownerIdx: -1,
      isTransferListed: false,
      transferPrice: getPlayerAcquisitionPrice(player, tiers),
    })), [allAuctionPlayers, purchasedPlayerIds, tiers]);
  const filteredPurchasedPlayers = React.useMemo(() => filterInventoryPlayers(purchasedPlayers, {
    search: historySearch,
    owner: historyOwnerFilter,
    pos: historyPosFilter,
    tier: historyTierFilter,
    tiers,
  }), [historyOwnerFilter, historyPosFilter, historySearch, historyTierFilter, purchasedPlayers, tiers]);
  const filteredUnpurchasedPlayers = React.useMemo(() => filterInventoryPlayers(unpurchasedPlayers, {
    search: historySearch,
    owner: "ALL",
    pos: historyPosFilter,
    tier: historyTierFilter,
    tiers,
  }), [historyPosFilter, historySearch, historyTierFilter, tiers, unpurchasedPlayers]);
  const filteredTransferListedPlayers = React.useMemo(() => filterInventoryPlayers(transferListedPlayers, {
    search: historySearch,
    owner: historyOwnerFilter,
    pos: historyPosFilter,
    tier: historyTierFilter,
    tiers,
  }), [historyOwnerFilter, historyPosFilter, historySearch, historyTierFilter, tiers, transferListedPlayers]);
  const myTransferParticipant = React.useMemo(
    () => inventoryParticipants.find((participant) => participant.name === selectedName) || null,
    [inventoryParticipants, selectedName]
  );
  const handleFixtureGoalChange = (groupLabel, fixtureId, side, rawValue) => {
    const value = rawValue === "" ? null : Math.max(0, parseInt(rawValue, 10) || 0);
    setFixturesState((prev) => {
      const next = {
        ...prev,
        [groupLabel]: (prev[groupLabel] || []).map((fixture) => {
          if (fixture.id !== fixtureId) return fixture;
          const updatedFixture = {
            ...fixture,
            [side === "home" ? "homeGoals" : "awayGoals"]: value,
          };
          if (isPlayedFixture(updatedFixture)) {
            updatedFixture.scoreUpdatedAt = Date.now();
          } else {
            updatedFixture.scoreUpdatedAt = null;
          }
          return updatedFixture;
        }),
      };

      if (auctionResultId) {
        setSavingFixtureId(fixtureId);
        if (saveFixturesTimerRef.current) clearTimeout(saveFixturesTimerRef.current);
        saveFixturesTimerRef.current = setTimeout(async () => {
          try {
            const currentFixture = (next[groupLabel] || []).find((fixture) => fixture.id === fixtureId);
            if (!currentFixture) return;
            if (isHost) {
              await apiSaveFixtures(auctionResultId, { ...next, _knockout: knockoutScores }, user?.token);
            } else {
              await apiSaveFixtureScore(
                auctionResultId,
                groupLabel,
                fixtureId,
                currentFixture.homeGoals,
                currentFixture.awayGoals,
                user?.token
              );
            }
            trackEvent("fixture_goal_entered", { group: groupLabel });
          } catch (_err) {
            // The next edit triggers another save.
          } finally {
            setSavingFixtureId("");
          }
        }, 500);
      }

      return next;
    });
  };

  const handleStartTransfer = async () => {
    if (!isHost || !onStartTransferWindow || startingTransferWindow || !firstRoundComplete) return;
    if (listingDeadlineValid && !listingDeadlinePassed) {
      alert("Wait until the transfer listing deadline ends before opening the market.");
      return;
    }
    setStartingTransferWindow(true);
    try {
      await onStartTransferWindow({
        id: auctionResultId,
        sessionId: auctionResultId,
        name: leagueName,
        participants,
        host,
      });
    } catch (err) {
      alert(`Failed to open transfer window: ${err.message}`);
    } finally {
      setStartingTransferWindow(false);
    }
  };

  const handleSaveTransferDeadline = async () => {
    if (!isHost || deadlineSaving) return;
    const deadlineAt = fromDateAndTimeValue(deadlineDateDraft, deadlineHourDraft, deadlineMinuteDraft);
    if (!deadlineAt) {
      alert("Please choose a valid deadline.");
      return;
    }
    setDeadlineSaving(true);
    try {
      const nextResult = await apiUpdateResultTransferWindow(auctionResultId, { listingDeadlineAt: deadlineAt }, user.token);
      const nextTransferWindow = nextResult?.transferWindow || {
        ...effectiveTransferWindow,
        listingDeadlineAt: deadlineAt,
        listingDeadlineSetAt: Date.now(),
      };
      setResultTransferState((prev) => ({
        ...prev,
        transferWindow: nextTransferWindow,
      }));
      if (transferSessionId && transferSessionState) {
        setTransferSessionState((prev) => prev ? ({
          ...prev,
          transferWindow: nextTransferWindow,
        }) : prev);
      }
    } catch (err) {
      alert(`Failed to save deadline: ${err.message}`);
    } finally {
      setDeadlineSaving(false);
    }
  };

  const handleClearTransferDeadline = async () => {
    if (!isHost || deadlineSaving) return;
    setDeadlineSaving(true);
    try {
      await apiUpdateResultTransferWindow(auctionResultId, { listingDeadlineAt: null }, user.token);
      const nextTransferWindow = {
        ...effectiveTransferWindow,
        listingDeadlineAt: null,
        listingDeadlineSetAt: null,
      };
      setResultTransferState((prev) => ({
        ...prev,
        transferWindow: nextTransferWindow,
      }));
      if (transferSessionId && transferSessionState) {
        setTransferSessionState((prev) => prev ? ({
          ...prev,
          transferWindow: nextTransferWindow,
        }) : prev);
      }
      setDeadlineDateDraft("");
      setDeadlineHourDraft("");
      setDeadlineMinuteDraft("");
    } catch (err) {
      alert(`Failed to clear deadline: ${err.message}`);
    } finally {
      setDeadlineSaving(false);
    }
  };

  const handleToggleTransferListing = async (player) => {
    if (!transferListingEditable || !user?.token || !player?.owner || player.owner !== selectedName) return;
    const activeParticipants = Array.isArray(transferSessionState?.participants) && transferSessionState.participants.length > 0
      ? transferSessionState.participants
      : inventoryParticipants;
    const ownerParticipant = activeParticipants.find((participant) => participant.name === player.owner);
    if (!ownerParticipant) return;

    const requiredSalesMin = Number(effectiveTransferWindow.requiredSalesMin || 2);
    const requiredSalesMax = Number(effectiveTransferWindow.requiredSalesMax || 5);
    const listingPrice = Number(player?.salePrice) || getPlayerAcquisitionPrice(player, tiers);
    const currentlyListed = (Array.isArray(ownerParticipant.soldPlayers) ? ownerParticipant.soldPlayers : []).some((entry) => Number(entry?.id) === Number(player.id));

    if (!currentlyListed && (ownerParticipant.soldPlayers || []).length >= requiredSalesMax) {
      setTransferActionMessage(`You can list at most ${requiredSalesMax} players.`);
      return;
    }

    setTransferActionPlayerId(String(player.id));
    setTransferActionMessage("");
    try {
      const nextParticipants = activeParticipants.map((participant) => {
        if (participant.name !== player.owner) return participant;
        const soldPlayers = Array.isArray(participant.soldPlayers) ? participant.soldPlayers : [];
        const squad = Array.isArray(participant.squad) ? participant.squad : [];

        if (currentlyListed) {
          const restoredPlayer = soldPlayers.find((entry) => Number(entry?.id) === Number(player.id));
          const nextSoldPlayers = soldPlayers.filter((entry) => Number(entry?.id) !== Number(player.id));
          return {
            ...participant,
            budget: Math.max(0, Number(participant.budget || 0) - listingPrice),
            squad: restoredPlayer
              ? [...squad, restoreTransferredPlayer(restoredPlayer)]
              : squad,
            soldPlayers: nextSoldPlayers,
          };
        }

        return {
          ...participant,
          budget: Number(participant.budget || 0) + listingPrice,
          squad: squad.filter((entry) => Number(entry?.id) !== Number(player.id)),
          soldPlayers: [
            ...soldPlayers,
            {
              ...player,
              soldAt: Date.now(),
              salePrice: listingPrice,
              soldInTransferWindow: true,
            },
          ],
        };
      });

      if (transferSessionState?.id) {
        const nextCompletedBy = Array.from(new Set(nextParticipants
          .filter((participant) => {
            const count = (participant.soldPlayers || []).length;
            return count >= requiredSalesMin && count <= requiredSalesMax;
          })
          .map((participant) => participant.name)));
        const nextSoldPlayerIds = nextParticipants
          .flatMap((participant) => Array.isArray(participant?.soldPlayers) ? participant.soldPlayers : [])
          .map((entry) => Number(entry?.id))
          .filter(Number.isFinite);
        const nextCarriedBudgets = {
          ...(transferSessionState.carriedBudgets || {}),
          [player.owner]: Number.isFinite(Number((transferSessionState.carriedBudgets || {})[player.owner]))
            ? Number((transferSessionState.carriedBudgets || {})[player.owner])
            : Number(ownerParticipant.budget || 0),
        };
        const nextSession = {
          ...transferSessionState,
          participants: nextParticipants,
          soldPlayerIds: nextSoldPlayerIds,
          expectedBudgets: Object.fromEntries(nextParticipants.map((participant) => [
            participant.name,
            Number(participant?.budget || 0),
          ])),
          carriedBudgets: nextCarriedBudgets,
          transferWindow: {
            ...effectiveTransferWindow,
            completedBy: nextCompletedBy,
          },
        };
        await apiUpdateSession(transferSessionState.id, nextSession, user.token);
        setTransferSessionState(nextSession);
      } else {
        const nextResult = await apiUpdateResultTransferListing(auctionResultId, player.id, !currentlyListed, user.token);
        setResultTransferState({
          participants: nextResult?.participants || participants,
          carriedBudgets: nextResult?.carriedBudgets || {},
          expectedBudgets: nextResult?.expectedBudgets || {},
          transferWindow: nextResult?.transferWindow || transferWindow,
        });
      }
      setTransferActionMessage(currentlyListed ? "Player removed from transfer listings." : "Player added to transfer listings.");
    } catch (err) {
      setTransferActionMessage(err.message || "Could not update the transfer listings.");
    } finally {
      setTransferActionPlayerId("");
    }
  };

  const renderInventoryRow = (player, index, { showOwner = true, showAction = false, showTransferPrice = false } = {}) => {
    const td = getTierData(player.rating, tiers);
    const ownerColor = player.ownerIdx >= 0 ? PCOLORS[player.ownerIdx % PCOLORS.length] : "#7f8ea6";
    const isOwnedByViewer = player.owner === selectedName;
    const canToggle = showAction && isOwnedByViewer && transferListingEditable;
    const actionLabel = player.isTransferListed ? "REMOVE" : "PUT UP";

    return React.createElement("div", {
      key: `${player.owner || "pool"}-${player.id}-${index}`,
      style: {
        display: "grid",
        gridTemplateColumns: showAction ? "34px 52px 60px minmax(0,1fr) 150px 64px auto" : "34px 52px 60px minmax(0,1fr) 150px 64px",
        alignItems: "center",
        gap: 12,
        background: "#0a0f17",
        borderRadius: 14,
        padding: "10px 14px",
        border: `1px solid ${player.isTransferListed ? "#FF6B3544" : `${td.border}33`}`,
      }
    },
    React.createElement("span", { style: { fontFamily: "'Bebas Neue'", color: "#334155", fontSize: 14 } }, `#${index + 1}`),
    React.createElement("span", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: td.color } }, player.rating),
    React.createElement("span", {
      style: {
        fontFamily: "'Rajdhani'",
        fontSize: 11,
        fontWeight: 700,
        color: ownerColor,
        background: `${ownerColor}18`,
        borderRadius: 999,
        textAlign: "center",
        padding: "4px 0",
      }
    }, player.pos),
    React.createElement("div", { style: { minWidth: 0 } },
      React.createElement("div", { style: { fontFamily: "'Exo 2'", fontSize: 14, fontWeight: 600, color: "#e0e7f1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, player.name),
      showTransferPrice && React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6", marginTop: 2 } }, `${player.transferPrice}M ${player.isTransferListed ? "transfer value" : "auction value"}`)
    ),
    showOwner
      ? React.createElement("span", { style: { fontFamily: "'Exo 2'", fontSize: 12, color: ownerColor, fontWeight: 700 } }, player.owner || "UNPURCHASED")
      : React.createElement("span", { style: { fontFamily: "'Exo 2'", fontSize: 12, color: "#7f8ea6", fontWeight: 700 } }, "UNPURCHASED"),
    React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } },
      React.createElement("span", {
        style: {
          fontFamily: "'Rajdhani'",
          fontSize: 11,
          color: player.isTransferListed ? "#FFB84D" : td.color,
          background: player.isTransferListed ? "#FFB84D12" : td.bg,
          border: `1px solid ${player.isTransferListed ? "#FFB84D33" : "transparent"}`,
          borderRadius: 999,
          textAlign: "center",
          padding: "4px 10px",
          minWidth: 54,
        }
      }, player.isTransferListed ? "LISTED" : getTierKey(player.rating, tiers))
    ),
    showAction && (isOwnedByViewer
      ? React.createElement("button", {
          onClick: () => handleToggleTransferListing(player),
          disabled: !canToggle || transferActionPlayerId === String(player.id),
          style: {
            background: player.isTransferListed ? "#2a1410" : "#0d1119",
            color: player.isTransferListed ? "#FFB84D" : "#FF6B35",
            border: `1px solid ${player.isTransferListed ? "#FFB84D44" : "#FF6B3544"}`,
            borderRadius: 999,
            padding: "7px 12px",
            cursor: canToggle ? "pointer" : "default",
            fontFamily: "'Bebas Neue'",
            fontSize: 11,
            letterSpacing: 1,
            opacity: canToggle ? 1 : 0.45,
          }
        }, transferActionPlayerId === String(player.id) ? "UPDATING…" : actionLabel)
      : React.createElement("span", {
          style: {
            fontFamily: "'Rajdhani'",
            fontSize: 10,
            fontWeight: 700,
            color: "#7f8ea6",
            background: "#0d1119",
            border: "1px solid #1f2937",
            borderRadius: 999,
            padding: "6px 10px",
            letterSpacing: 1,
          }
        }, "OWNER ONLY"))
    );
  };

  const surfaceCard = {
    background: "linear-gradient(180deg,#0b1018,#090d15)",
    border: "1px solid #1d2433",
    borderRadius: 20,
    boxShadow: "0 20px 60px #00000033",
  };

  return React.createElement("div", { style: { minHeight: "100vh", background: "radial-gradient(circle at top, #162132 0%, #070a12 45%, #04060a 100%)", color: "#fff" } },
    React.createElement(SquadAnalyser, {
      participants,
      wishlists,
      players,
      tiers,
      selectedName,
      onClose: () => setAnalyserOpen(false),
      hidden: !analyserOpen,
    }),
    React.createElement("div", { style: { maxWidth: 1220, margin: "0 auto", padding: "20px 18px 40px" } },
      React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" } },
        onBackToDiscover && React.createElement("button", {
          onClick: onBackToDiscover,
          style: {
            background: "rgba(8,18,13,.78)",
            color: "#e8f7ef",
            border: "1px solid rgba(143,231,192,.16)",
            borderRadius: 999,
            padding: "10px 18px",
            cursor: "pointer",
            fontFamily: "'Bebas Neue'",
            fontSize: 14,
            letterSpacing: 1,
          }
        }, "← HOME"),
        React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba" } }, latestFixtureTimestamp ? formatRelativeTime(latestFixtureTimestamp) : "League data ready")
      ),
      React.createElement("div", { style: { ...surfaceCard, padding: "24px 24px 20px", marginBottom: 18, overflow: "hidden", position: "relative" } },
        React.createElement("div", { style: { position: "absolute", inset: 0, background: "linear-gradient(110deg,#4FC3F71a 0%, transparent 35%, #FFD70010 70%, transparent 100%)", pointerEvents: "none" } }),
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap", position: "relative" } },
          React.createElement("div", null,
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 } }, `Season ${seasonNumber} · ${leagueName}`),
            React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 54, color: "#fff", letterSpacing: 4, lineHeight: 0.95 } }, "League Centre"),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 15, color: "#9aa5b5", marginTop: 10, maxWidth: 620, lineHeight: 1.5 } },
              groupsEnabled
                ? `Rankings are ordered by points first and goal difference second. Fixtures sync directly into the table, and ${seasonNumber >= 2 ? "the schedule is split before and after the transfer window." : "Season 1 stays branded as Elite League."}`
                : "The standings table stays available even without a configured league schedule. Squads and Ballon dOr tracking remain available as well."
            )
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, minWidth: 320, flex: 1 } },
            [
              { label: "Teams", value: participants.length },
              { label: "Played", value: `${playedMatches}/${totalMatches}` },
              { label: "Last update", value: latestFixtureTimestamp ? formatRelativeTime(latestFixtureTimestamp).replace("Updated ", "") : "No scores" },
            ].map((item) => React.createElement("div", {
              key: item.label,
              style: { background: "#0c1320cc", border: "1px solid #263247", borderRadius: 16, padding: "14px 16px" }
            },
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6", textTransform: "uppercase", letterSpacing: 1 } }, item.label),
            React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 28, color: "#fff", letterSpacing: 2, marginTop: 6 } }, item.value)))
          )
        )
      ),
      React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" } },
        React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          ["table", ...(groupsEnabled ? ["matches"] : []), "squads", "history", "awards"].map((nextView) => React.createElement("button", {
            key: nextView,
            onClick: () => setView(nextView),
            style: {
              background: view === nextView ? "linear-gradient(135deg,#4FC3F7,#8fe7c0)" : "#0d1119",
              color: view === nextView ? "#06110c" : "#a7b1c2",
              border: `1px solid ${view === nextView ? "rgba(79,195,247,.42)" : "#1f2937"}`,
              borderRadius: 999,
              padding: "9px 18px",
              cursor: "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 14,
              letterSpacing: 1,
              boxShadow: view === nextView ? "0 8px 24px rgba(79,195,247,.24)" : "none",
            }
          }, nextView === "table" ? "TABLE" : nextView === "matches" ? "MATCHES" : nextView === "squads" ? "SQUADS" : nextView === "history" ? "ALL PLAYERS" : "BALLON D'OR")),
        ),
        React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
          groupsEnabled && isHost && onStartTransferWindow && React.createElement("button", {
            onClick: handleStartTransfer,
            disabled: startingTransferWindow || !firstRoundComplete || (listingDeadlineValid && !listingDeadlinePassed),
            style: {
              background: "#4FC3F718",
              color: "#4FC3F7",
              border: "1px solid #4FC3F744",
              borderRadius: 999,
              padding: "9px 18px",
              cursor: "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 14,
              letterSpacing: 1,
              opacity: startingTransferWindow || !firstRoundComplete || (listingDeadlineValid && !listingDeadlinePassed) ? 0.6 : 1,
            }
          }, startingTransferWindow ? "OPENING TRANSFER…" : (listingDeadlineValid && !listingDeadlinePassed) ? "WAIT FOR DEADLINE" : transferWindowAlreadyOpened ? "REOPEN TRANSFER WINDOW" : firstRoundComplete ? "OPEN MID-SEASON TRANSFER" : "PLAY ALL FIRST-ROUND MATCHES"),
          React.createElement("button", {
            onClick: () => setAnalyserOpen(true),
            style: {
              background: "#8fe7c018",
              color: "#8fe7c0",
              border: "1px solid rgba(143,231,192,.28)",
              borderRadius: 999,
              padding: "9px 18px",
              cursor: "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 14,
              letterSpacing: 1,
            }
          }, "ANALYSER")
        )
      ),
      view === "table" && React.createElement("div", { style: { display: "grid", gap: 20 } },
        React.createElement("div", { style: { ...surfaceCard, padding: 22 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 30, color: "#fff", letterSpacing: 2 } }, `${leagueName} Table`),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#8290a8", marginTop: 4 } }, "Points decide the ranking. GD breaks ties.")
            ),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba" } }, latestFixtureTimestamp ? formatRelativeTime(latestFixtureTimestamp) : "No scores entered yet")
          ),
          React.createElement(StandingsTable, { rows: standings, seasonNumber })
        ),
        groupsEnabled && Object.entries(resolvedGroups).map(([label, teams]) => {
          const table = computeGroupTable(teams, resolvedFixturesByGroup[label] || []);
          return React.createElement("div", { key: label, style: { ...surfaceCard, padding: 20 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" } },
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 24, color: "#4FC3F7", letterSpacing: 2 } }, `Group ${label}`),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba" } }, `${teams.length} teams`)
            ),
            React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
              React.createElement("thead", null,
                React.createElement("tr", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#718096" } },
                  ["Team", "PLD", "GD", "PTS"].map((heading) => React.createElement("th", { key: heading, style: { textAlign: heading === "Team" ? "left" : "center", padding: "8px 6px", borderBottom: "1px solid #1e2230" } }, heading))
                )
              ),
              React.createElement("tbody", null,
                table.map((row, index) => React.createElement("tr", { key: row.name, style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#dbe3ef" } },
                  React.createElement("td", { style: { padding: "10px 6px", fontWeight: 700 } }, `${index + 1}. ${row.name}`),
                  React.createElement("td", { style: { padding: "10px 6px", textAlign: "center" } }, row.played),
                  React.createElement("td", { style: { padding: "10px 6px", textAlign: "center", color: row.gd > 0 ? "#22c55e" : row.gd < 0 ? "#ef4444" : "#cbd5e1" } }, row.gd > 0 ? `+${row.gd}` : row.gd),
                  React.createElement("td", { style: { padding: "10px 6px", textAlign: "center", fontWeight: 700, color: "#FFD700" } }, row.points)
                ))
              )
            )
          );
        }),
        Object.keys(groups).length >= 1 && React.createElement(KnockoutBracket, {
          groups,
          fixturesState,
          knockoutScores,
          nameMap,
          isHost,
          knockoutFormat,
          publishing: knockoutPublishing,
          published: knockoutPublished,
          onScoreChange: isHost ? (matchId, side, value) => {
            setKnockoutPublished(false);
            setKnockoutScores((prev) => ({
              ...prev,
              [matchId]: { ...(prev[matchId] || {}), [side]: value === "" ? null : Math.max(0, Number(value) || 0) },
            }));
          } : null,
          onPublish: isHost ? async () => {
            if (!auctionResultId || !user?.token) return;
            setKnockoutPublishing(true);
            try {
              await apiSaveFixtures(auctionResultId, { ...fixturesState, _knockout: knockoutScores }, user.token);
              setKnockoutPublished(true);
            } catch (_) {
              // Surface stays local until the next publish attempt.
            } finally {
              setKnockoutPublishing(false);
            }
          } : null,
          onRefresh: !isHost ? loadLatestFixtures : null,
          refreshing: loadingLatest,
        })
      ),
      view === "matches" && groupsEnabled && React.createElement(
        "div",
        { style: { display: "grid", gap: 18 } },
        React.createElement("div", {
          style: {
            ...surfaceCard,
            padding: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }
        },
          React.createElement("div", null,
            React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 2 } }, "MATCH SELECTOR"),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6", marginTop: 4 } }, isHost
              ? "Host can edit scores and upload player stats for every fixture."
              : "Pick a team to jump straight to its fixtures. You can edit/upload only for matches involving your team.")
          ),
          React.createElement("label", { style: { display: "grid", gap: 6, minWidth: 240 } },
            React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, "Show matches for"),
            React.createElement("select", {
              value: matchTeamFilter,
              onChange: (event) => setMatchTeamFilter(event.target.value),
              style: {
                background: "#09111b",
                color: "#fff",
                border: "1px solid #263247",
                borderRadius: 10,
                padding: "10px 12px",
                fontFamily: "'Rajdhani'",
                fontSize: 13,
              }
            },
              React.createElement("option", { value: "ALL" }, "All teams"),
              matchTeamOptions.map((teamName) => React.createElement("option", { key: teamName, value: teamName }, teamName))
            )
          )
        ),
        hasFixtureSplit && React.createElement("div", {
          style: {
            ...surfaceCard,
            padding: 12,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }
        },
          React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6", marginRight: 6 } }, "Fixture view"),
          ["ALL", "FIXTURE_1", "FIXTURE_2"].map((value) => React.createElement("button", {
            key: value,
            onClick: () => setMatchLegFilter(value),
            style: {
              background: matchLegFilter === value ? "linear-gradient(135deg,#4FC3F7,#8fe7c0)" : "#0d1119",
              color: matchLegFilter === value ? "#06110c" : "#a7b1c2",
              border: `1px solid ${matchLegFilter === value ? "rgba(79,195,247,.42)" : "#1f2937"}`,
              borderRadius: 999,
              padding: "8px 14px",
              cursor: "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 12,
              letterSpacing: 1,
            }
          }, value === "ALL" ? "ALL FIXTURES" : value === "FIXTURE_1" ? "FIXTURE 1" : "FIXTURE 2"))
        ),
        groupSections.length === 0
          ? React.createElement("div", { style: { ...surfaceCard, padding: 28, textAlign: "center", fontFamily: "'Rajdhani'", color: "#718096" } }, "No fixtures configured for this season.")
          : filteredGroupSections.length === 0
            ? React.createElement("div", { style: { ...surfaceCard, padding: 28, textAlign: "center", fontFamily: "'Rajdhani'", color: "#718096" } }, "No fixtures found for the selected team.")
            : filteredGroupSections.map((section) => React.createElement(
              "div",
              {
                key: section.id,
                style: {
                  ...surfaceCard,
                  padding: 20,
                  borderLeft: section.leg === "FIXTURE_1"
                    ? "4px solid rgba(79,195,247,.65)"
                    : section.leg === "FIXTURE_2"
                      ? "4px solid rgba(255,184,77,.65)"
                      : surfaceCard.border,
                }
              },
              React.createElement(
                "div",
                { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 14, flexWrap: "wrap" } },
                React.createElement("div", null,
                  React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } },
                    React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 24, color: "#fff", letterSpacing: 2 } }, section.title),
                    section.leg === "FIXTURE_1" && React.createElement("span", { style: { fontFamily: "'Bebas Neue'", fontSize: 11, color: "#4FC3F7", border: "1px solid rgba(79,195,247,.28)", background: "#4FC3F714", borderRadius: 999, padding: "4px 10px", letterSpacing: 1 } }, "FIXTURE 1"),
                    section.leg === "FIXTURE_2" && React.createElement("span", { style: { fontFamily: "'Bebas Neue'", fontSize: 11, color: "#FFB84D", border: "1px solid rgba(255,184,77,.28)", background: "#FFB84D14", borderRadius: 999, padding: "4px 10px", letterSpacing: 1 } }, "FIXTURE 2")
                  ),
                  React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, section.subtitle)
                ),
                React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, `${section.fixtures.filter(isPlayedFixture).length}/${section.fixtures.length} scored`)
              ),
              React.createElement(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 10 } },
                section.fixtures.map((fixture) => {
                  const homeColor = participantMeta.get(fixture.home)?.color || "#4FC3F7";
                  const awayColor = participantMeta.get(fixture.away)?.color || "#FF6B35";
                  const played = isPlayedFixture(fixture);
                  const canEditFixture = isHost || selectedName === fixture.home || selectedName === fixture.away;
                  const teamRows = [
                    { teamName: fixture.home, color: homeColor, scoreKey: "homeGoals", side: "home" },
                    { teamName: fixture.away, color: awayColor, scoreKey: "awayGoals", side: "away" },
                  ];

                  return React.createElement(
                    "div",
                    { key: fixture.id, style: { background: "#0c121ccc", border: "1px solid #1e2230", borderRadius: 18, padding: "14px 16px", display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 14, alignItems: "center" } },
                    React.createElement("div", { style: { textAlign: "center" } },
                      React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 12, color: played ? "#22c55e" : "#94a3b8", letterSpacing: 2 } }, played ? "FT" : `R${fixture.round || 1}`),
                      React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#667189", marginTop: 8 } }, played ? formatRelativeTime(fixture.scoreUpdatedAt) : "Awaiting result")
                    ),
                    React.createElement(
                      "div",
                      { style: { display: "flex", flexDirection: "column", gap: 10 } },
                      teamRows.map(({ teamName, color, scoreKey, side }) => React.createElement(
                        "div",
                        { key: `${fixture.id}-${scoreKey}`, style: { display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 10, alignItems: "center" } },
                        React.createElement(TeamBadge, { name: teamName, color, small: false }),
                        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 1 } }, teamName),
                        canEditFixture
                          ? React.createElement("input", {
                              type: "number",
                              min: 0,
                              value: fixture[scoreKey] ?? "",
                              onChange: (e) => handleFixtureGoalChange(section.groupLabel, fixture.id, side, e.target.value),
                              style: { width: 52, background: "#05070d", border: "1px solid #273246", borderRadius: 10, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 20, textAlign: "center", padding: "6px 0" },
                            })
                          : React.createElement("div", { style: { width: 52, background: "#05070d", border: "1px solid #273246", borderRadius: 10, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 20, textAlign: "center", padding: "6px 0" } }, fixture[scoreKey] ?? "–")
                      ))
                    ),
                    React.createElement("div", { style: { textAlign: "right" } },
                      React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" } }, savingFixtureId === fixture.id ? "Syncing…" : "Synced"),
                      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", marginTop: 10 } },
                        played && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 18, color: "#FFD700", letterSpacing: 2 } }, Number(fixture.homeGoals) > Number(fixture.awayGoals) ? fixture.home : Number(fixture.homeGoals) < Number(fixture.awayGoals) ? fixture.away : "DRAW"),
                        canEditFixture && React.createElement("button", {
                          onClick: () => setSelectedUploadFixture({ ...fixture, groupLabel: section.groupLabel }),
                          style: {
                            background: "#132337",
                            color: "#8fe7c0",
                            border: "1px solid rgba(143,231,192,.28)",
                            borderRadius: 999,
                            padding: "8px 14px",
                            cursor: "pointer",
                            fontFamily: "'Bebas Neue'",
                            fontSize: 12,
                            letterSpacing: 1,
                          }
                        }, "UPLOAD STATS")
                      )
                    )
                  );
                })
              )
            ))
      ),
      view === "squads" && React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 16 } },
        [...participants].sort((a, b) => b.squad.length - a.squad.length).map((participant, index) => {
          const valid = participant.squad.length >= SQUAD_MIN && participant.squad.length <= SQUAD_MAX;
          const spent = BUDGET - participant.budget;
          return React.createElement("div", { key: participant.name, style: { ...surfaceCard, padding: 18 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 } },
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                React.createElement(TeamBadge, { name: participant.name, color: PCOLORS[index % PCOLORS.length] }),
                React.createElement("div", null,
                  React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 1 } }, participant.name),
                  React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8290a8" } }, `${participant.squad.length} players · ${participant.budget}M left`)
                )
              ),
              React.createElement("span", {
                style: {
                  fontFamily: "'Rajdhani'",
                  fontSize: 11,
                  fontWeight: 700,
                  color: valid ? "#00FF88" : "#FF3D71",
                  background: valid ? "#00FF8814" : "#FF3D7114",
                  border: `1px solid ${valid ? "#00FF8833" : "#FF3D7133"}`,
                  borderRadius: 999,
                  padding: "4px 10px",
                }
              }, valid ? "READY" : "CHECK")
            ),
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 14 } },
              React.createElement("button", {
                onClick: () => downloadSquadImage(participant, { formation: "4-3-3", tiers }),
                style: {
                  background: "#0d1119",
                  border: "1px solid #00FF8844",
                  borderRadius: 999,
                  color: "#00FF88",
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontFamily: "'Bebas Neue'",
                  fontSize: 11,
                  letterSpacing: 1,
                }
              }, "DOWNLOAD"),
              React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#718096", alignSelf: "center" } }, `${spent}M spent`)
            ),
            React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
              participant.squad.slice().sort((a, b) => b.rating - a.rating).map((player) => {
                const td = getTierData(player.rating, tiers);
                return React.createElement("div", {
                  key: player.id,
                  style: {
                    background: td.bg,
                    border: `1px solid ${td.border}`,
                    borderRadius: 999,
                    padding: "4px 8px",
                    fontFamily: "'Rajdhani'",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    gap: 5,
                    alignItems: "center",
                  }
                },
                React.createElement("span", { style: { color: td.color } }, player.rating),
                React.createElement("span", { style: { color: "#e5edf8" } }, player.name.split(" ").pop()),
                React.createElement("span", { style: { color: "#718096", fontSize: 10 } }, player.pos));
              })
            )
          );
        })
      ),
      view === "history" && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
        React.createElement("div", { style: { ...surfaceCard, padding: 16, display: "grid", gridTemplateColumns: "minmax(180px,1.4fr) repeat(3,minmax(120px,.8fr))", gap: 10 } },
          React.createElement("input", {
            value: historySearch,
            onChange: (e) => setHistorySearch(e.target.value),
            placeholder: "Search player or owner…",
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          }),
          React.createElement("select", {
            value: historyOwnerFilter,
            onChange: (e) => setHistoryOwnerFilter(e.target.value),
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          },
          React.createElement("option", { value: "ALL" }, "All owners"),
          inventoryParticipants.map((participant) => React.createElement("option", { key: participant.name, value: participant.name }, participant.name))),
          React.createElement("select", {
            value: historyPosFilter,
            onChange: (e) => setHistoryPosFilter(e.target.value),
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          },
          React.createElement("option", { value: "ALL" }, "All positions"),
          Array.from(new Set([...purchasedPlayers, ...unpurchasedPlayers].map((player) => player.pos).filter(Boolean))).sort().map((pos) => React.createElement("option", { key: pos, value: pos }, pos))),
          React.createElement("select", {
            value: historyTierFilter,
            onChange: (e) => setHistoryTierFilter(e.target.value),
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          },
          React.createElement("option", { value: "ALL" }, "All tiers"),
          Array.from(new Set([...purchasedPlayers, ...unpurchasedPlayers].map((player) => getTierKey(player.rating, tiers)))).sort().map((tier) => React.createElement("option", { key: tier, value: tier }, tier)))
        ),
        React.createElement("div", { style: { ...surfaceCard, padding: 16, display: "grid", gap: 16 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 24, color: "#fff", letterSpacing: 2 } }, "ALL PLAYERS"),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6", marginTop: 4 } }, "Purchased players, unpurchased pool, and live transfer listings in one place.")
            ),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: listingDeadlinePassed ? "#FFB84D" : "#8fe7c0", maxWidth: 420, textAlign: "right", display: "grid", gap: 4 } },
              React.createElement("div", null,
                transferSyncLoading
                  ? "Syncing transfer window…"
                  : !transferSessionId
                   ? `Pre-list players now. When the transfer window opens, these listings will already be synced.`
                   : transferListingEditable
                     ? `Transfer window is live. List ${effectiveTransferWindow.requiredSalesMin || 2}-${effectiveTransferWindow.requiredSalesMax || 5} players from your own squad.`
                     : transferWindowAlreadyOpened
                       ? "Transfer listings are read-only here because the market is already open or closed."
                       : "Transfer listings are available here."
              ),
              React.createElement("div", { style: { color: listingDeadlinePassed ? "#FFB84D" : "#8fe7c0", fontWeight: 700 } }, listingDeadlineText),
              isHost && React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" } },
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, minWidth: 360 } },
                 React.createElement("input", {
                   type: "date",
                   value: deadlineDateDraft,
                   onChange: (event) => setDeadlineDateDraft(event.target.value),
                   style: {
                     background: "#0d1119",
                     color: "#fff",
                     border: "1px solid #263247",
                     borderRadius: 10,
                     padding: "8px 10px",
                     fontFamily: "'Rajdhani'",
                     fontSize: 12,
                   },
                 }),
                 React.createElement("select", {
                   value: deadlineHourDraft,
                   onChange: (event) => setDeadlineHourDraft(event.target.value),
                   style: {
                     background: "#0d1119",
                     color: "#fff",
                     border: "1px solid #263247",
                     borderRadius: 10,
                     padding: "8px 10px",
                     fontFamily: "'Rajdhani'",
                     fontSize: 12,
                   },
                 }, [
                   React.createElement("option", { key: "hour-placeholder", value: "" }, "Hour"),
                   ...DEADLINE_HOUR_OPTIONS.map((value) => React.createElement("option", { key: value, value }, value)),
                 ]),
                 React.createElement("select", {
                   value: deadlineMinuteDraft,
                   onChange: (event) => setDeadlineMinuteDraft(event.target.value),
                   style: {
                     background: "#0d1119",
                     color: "#fff",
                     border: "1px solid #263247",
                     borderRadius: 10,
                     padding: "8px 10px",
                     fontFamily: "'Rajdhani'",
                     fontSize: 12,
                   },
                 }, [
                   React.createElement("option", { key: "minute-placeholder", value: "" }, "Minute"),
                   ...DEADLINE_MINUTE_OPTIONS.map((value) => React.createElement("option", { key: value, value }, value)),
                 ])
                ),
                React.createElement("button", {
                 onClick: handleSaveTransferDeadline,
                 disabled: deadlineSaving || !deadlineDateDraft || deadlineHourDraft === "" || deadlineMinuteDraft === "",
                 style: {
                   ...BTN.gold,
                   padding: "8px 14px",
                   fontSize: 12,
                   opacity: deadlineSaving || !deadlineDateDraft || deadlineHourDraft === "" || deadlineMinuteDraft === "" ? 0.6 : 1,
                  }
                }, deadlineSaving ? "SAVING…" : "SET DEADLINE"),
                React.createElement("button", {
                  onClick: handleClearTransferDeadline,
                  disabled: deadlineSaving,
                  style: {
                   ...BTN.ghost,
                   padding: "8px 14px",
                   fontSize: 12,
                   color: "#FFB84D",
                   borderColor: "#FFB84D44",
                   opacity: deadlineSaving ? 0.6 : 1,
                  }
                }, "CLEAR")
              )
            )
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 } },
            expectedBudgetCards.map((item) => React.createElement("div", {
              key: item.name,
              style: {
                background: "#0c1320",
                border: "1px solid #223047",
                borderRadius: 14,
                padding: "12px 14px",
                display: "grid",
                gap: 4,
              }
            },
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 10, fontWeight: 700, color: "#8fe7c0", letterSpacing: 1.5 } }, item.name),
            React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 28, color: "#fff", letterSpacing: 1 } }, `${item.expectedBudget}M`),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#8ea0ba" } }, `Carry ${item.baseBudget}M + listed ${item.listedGain}M`)
            ))
          ),
          React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 } },
            [
              { key: "purchased", label: "PURCHASED IN AUCTION", count: filteredPurchasedPlayers.length, tone: "#FFD700" },
              { key: "unpurchased", label: "UNPURCHASED POOL", count: filteredUnpurchasedPlayers.length, tone: "#4FC3F7" },
              { key: "listed", label: "PUT UP FOR TRANSFER", count: filteredTransferListedPlayers.length, tone: "#FFB84D" },
            ].map((item) => React.createElement("div", {
              key: item.key,
              style: {
                background: `${item.tone}10`,
                border: `1px solid ${item.tone}33`,
                borderRadius: 14,
                padding: "12px 14px",
                display: "grid",
                gap: 4,
              }
            },
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 10, fontWeight: 700, color: item.tone, letterSpacing: 1.5 } }, item.label),
            React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 28, color: "#fff", letterSpacing: 1 } }, item.count),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#8ea0ba" } }, "Visible with current filters")
            ))
          ),
          React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
            [
              { key: "ALL", label: "SHOW ALL", tone: "#94a3b8" },
              { key: "purchased", label: "PURCHASED", tone: "#FFD700" },
              { key: "unpurchased", label: "UNPURCHASED", tone: "#4FC3F7" },
              { key: "listed", label: "TRANSFER LIST", tone: "#FFB84D" },
            ].map((item) => React.createElement("button", {
              key: item.key,
              onClick: () => setHistorySectionFilter(item.key),
              style: {
                background: historySectionFilter === item.key ? `${item.tone}20` : "#0d1119",
                color: historySectionFilter === item.key ? item.tone : "#aab6ca",
                border: `1px solid ${historySectionFilter === item.key ? `${item.tone}55` : "#1f2937"}`,
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
                fontFamily: "'Bebas Neue'",
                fontSize: 12,
                letterSpacing: 1,
              }
            }, item.label))
          ),
          transferActionMessage && React.createElement("div", {
            style: {
              fontFamily: "'Rajdhani'",
              fontSize: 12,
              color: transferActionMessage.toLowerCase().includes("could not") || transferActionMessage.toLowerCase().includes("at most") ? "#FFB84D" : "#8fe7c0",
              background: transferActionMessage.toLowerCase().includes("could not") || transferActionMessage.toLowerCase().includes("at most") ? "#FFB84D12" : "#8fe7c012",
              border: `1px solid ${transferActionMessage.toLowerCase().includes("could not") || transferActionMessage.toLowerCase().includes("at most") ? "#FFB84D33" : "rgba(143,231,192,.22)"}`,
              borderRadius: 12,
              padding: "10px 12px",
            }
          }, transferActionMessage),
          [
            {
              key: "purchased",
              title: "Purchased in auction",
              subtitle: "Original auction buys. Owners can put up only their own players for transfer.",
              rows: filteredPurchasedPlayers.slice().sort((a, b) => {
                const ownerBias = Number(b.owner === selectedName) - Number(a.owner === selectedName);
                if (ownerBias !== 0) return ownerBias;
                return Number(b.rating || 0) - Number(a.rating || 0);
              }),
              empty: "No purchased players match the selected filters.",
              showOwner: true,
              showAction: true,
              showTransferPrice: true,
            },
            {
              key: "unpurchased",
              title: "Remaining unpurchased players",
              subtitle: "Players left in the pool after the auction ended.",
              rows: filteredUnpurchasedPlayers.slice().sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)),
              empty: "No unpurchased players match the selected filters.",
              showOwner: false,
              showAction: false,
              showTransferPrice: true,
            },
            {
              key: "listed",
              title: "Players put up for transfer",
              subtitle: "This section stays synced with the mid-season transfer window listings.",
              rows: filteredTransferListedPlayers.slice().sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)),
              empty: "No transfer-listed players match the selected filters.",
              showOwner: true,
              showAction: false,
              showTransferPrice: true,
            },
          ].filter((section) => historySectionFilter === "ALL" || historySectionFilter === section.key).map((section) => React.createElement("div", {
            key: section.key,
            style: {
              background: "#0a0f17",
              border: `1px solid ${section.key === "listed" ? "#FFB84D33" : section.key === "unpurchased" ? "#4FC3F733" : "#FFD70033"}`,
              borderRadius: 18,
              padding: 16,
              display: "grid",
              gap: 12,
            }
          },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: section.key === "listed" ? "#FFB84D" : section.key === "unpurchased" ? "#4FC3F7" : "#FFD700", letterSpacing: 2 } }, section.title),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6", marginTop: 4 } }, section.subtitle)
            ),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#aab6ca" } }, `${section.rows.length} players`)
          ),
          section.rows.length === 0
            ? React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, section.empty)
            : React.createElement("div", { style: { display: "grid", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 } }, section.rows.map((player, index) => renderInventoryRow(player, index, {
                showOwner: section.showOwner,
                showAction: section.showAction,
                showTransferPrice: section.showTransferPrice,
              })))
          ))
        )
      ),
      view === "awards" && React.createElement(BallonDorPanel, {
        auctionResultId,
        participants,
        fixtures: allFixtures,
        user,
        mode: "standings",
      }),
      selectedUploadFixture && React.createElement("div", {
        onClick: () => setSelectedUploadFixture(null),
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(3,6,12,.8)",
          backdropFilter: "blur(4px)",
          padding: "20px 12px",
          overflowY: "auto",
        }
      },
      React.createElement("div", {
        onClick: (event) => event.stopPropagation(),
        style: {
          maxWidth: 1180,
          margin: "0 auto",
          background: "linear-gradient(180deg,#0b1018,#090d15)",
          border: "1px solid #1d2433",
          borderRadius: 20,
          boxShadow: "0 20px 60px #00000066",
          padding: 18,
        }
      },
      React.createElement(BallonDorPanel, {
        auctionResultId,
        participants,
        fixtures: allFixtures,
        user,
        mode: "upload",
        leagueName,
        onClose: () => setSelectedUploadFixture(null),
        canGenerateLink: isHost,
        selectedFixtureId: selectedUploadFixture.id,
        allowedTeamNames: [selectedUploadFixture.home, selectedUploadFixture.away],
      })))
    )
  );
}
