import React from "react";
const BallonDorPanel = React.lazy(() => import("../components/BallonDorPanel.jsx").then(module => ({ default: module.BallonDorPanel })));
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { loadPlayersFromCsv } from "../data/players.js";
import { PCOLORS, SQUAD_MIN, SQUAD_MAX, TIERS, getTierData, getTierKey } from "../game/constants.js";
import { buildRandomCupBracket, computeGroupTable, computeKnockoutMatchups } from "../game/groupsFixtures.js";
import { apiGetClubSelections, apiSaveClubSelection, apiGetFixtures, apiGetSession, apiSaveFixtureScore, apiSaveFixtures, apiUpdateResultTransferListing, apiUpdateResultTransferWindow } from "../lib/api.js";
import { submitSessionAction } from "../lib/realtime.js";
import { applySessionEvent } from "../lib/sessionEvents.js";
import { CountdownText, useDeadlinePassed } from "../components/Countdown.jsx";
import { downloadSquadImage } from "../utils/squadImage.js";
import { BTN } from "../utils/styles.js";
import { trackEvent } from "../lib/analytics.js";
import { ResultMatchRow } from "../components/ResultMatchRow.jsx";
import "../styles/results.css";
import { ISL_CLUBS, islClubName } from "../../backend/shared/islClubs.js";
import { fixtureLegCount } from "../../backend/shared/fixtureLegs.js";
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

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
  cupFixture = null,
}) {
  const groupLabels = Object.keys(groups || {}).sort();
  const matchups = Array.isArray(cupFixture?.matchups) && cupFixture.matchups.length > 0
    ? cupFixture.matchups
    : computeKnockoutMatchups(groupLabels, knockoutFormat);
  const singleLeg = cupFixture?.singleLeg !== false;
  const isQF = knockoutFormat === "quarterFinal";
  const isFinalOnly = knockoutFormat === "finalOnly";

  function resolveSeed(key) {
    if (!key) return "";
    if (!/\d/.test(key[0])) return key;
    const match = String(key).match(/^(\d+)(.+)$/);
    if (!match) return key;
    const pos = parseInt(match[1], 10) - 1;
    const grpLabel = match[2];
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
        { id: "SF-0", homeKey: matchups.filter((matchup) => matchup.round === "QF")[0] ? `W:${matchups.filter((matchup) => matchup.round === "QF")[0].id}` : null, awayKey: matchups.filter((matchup) => matchup.round === "QF")[1] ? `W:${matchups.filter((matchup) => matchup.round === "QF")[1].id}` : null },
        { id: "SF-1", homeKey: matchups.filter((matchup) => matchup.round === "QF")[2] ? `W:${matchups.filter((matchup) => matchup.round === "QF")[2].id}` : null, awayKey: matchups.filter((matchup) => matchup.round === "QF")[3] ? `W:${matchups.filter((matchup) => matchup.round === "QF")[3].id}` : null },
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
    if (singleLeg) {
      if (!Number.isFinite(h1) || !Number.isFinite(a1) || h1 === a1) return null;
      return h1 > a1 ? homeTeam : awayTeam;
    }
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
    const hasAgg = !singleLeg && !homeTBD && !awayTBD && Number.isFinite(h1) && Number.isFinite(a1) && Number.isFinite(h2) && Number.isFinite(a2);
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
      !singleLeg && legLabel("LEG 1"),
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
      !singleLeg && React.createElement(React.Fragment, null,
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
        )
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
  const singleGroupFinalOnly = isFinalOnly && finalLabels.length === 1;
  const finalHomeKey = isQF
    ? "W:SF-0"
    : isFinalOnly
      ? (cupFixture?.finalTeams?.[0] || `1${finalLabels[0] || "A"}`)
      : (matchups[0] ? `W:${matchups[0].id}` : null);
  const finalAwayKey = isQF
    ? "W:SF-1"
    : isFinalOnly
      ? (cupFixture?.finalTeams?.[1] || (singleGroupFinalOnly ? `2${finalLabels[0] || "A"}` : `1${finalLabels[1] || "B"}`))
      : (matchups[matchups.length - 1] ? `W:${matchups[matchups.length - 1].id}` : null);
  const finalHome = finalHomeKey ? resolveTeam(finalHomeKey) : null;
  const finalAway = finalAwayKey ? resolveTeam(finalAwayKey) : null;
  const finalHomeTBD = !finalHome || finalHome.startsWith("W:");
  const finalAwayTBD = !finalAway || finalAway.startsWith("W:");
  const finalScore = knockoutScores.FINAL || {};
  const fh1 = Number(finalScore.homeGoals);
  const fa1 = Number(finalScore.awayGoals);
  const finalWinner = !finalHomeTBD && !finalAwayTBD && Number.isFinite(fh1) && Number.isFinite(fa1) && fh1 !== fa1
    ? (fh1 > fa1 ? finalHome : finalAway)
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
    const playInMatches = matchups.filter((matchup) => matchup.round === "PLAY_IN");
    const allQFs = matchups.filter((matchup) => matchup.round === "QF");
    const [sfLeft, sfRight] = sfMatches;
    const borderColor = "#FFD70033";
    const roundLabel = (text) => React.createElement("div", {
      style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#4FC3F7", letterSpacing: 3, marginBottom: 6, textAlign: "center" }
    }, text);

    bracketBody = React.createElement("div", { style: { display: "flex", flexDirection: "column" } },
      playInMatches.length > 0 && React.createElement(React.Fragment, null,
        roundLabel("PLAY-IN ROUND"),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginBottom: 10 } },
          playInMatches.map((matchup) => React.createElement(MatchBox, {
            key: matchup.id,
            matchId: matchup.id,
            homeKey: matchup.homeKey,
            awayKey: matchup.awayKey,
            label: `PLAY-IN · ${matchup.homeKey} v ${matchup.awayKey}`,
            minWidth: 0,
          }))
        )
      ),
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

const CUP_FORMATS = ["semiFinal", "quarterFinal", "finalOnly"];

function normalizeCupFormat(value, fallback = "semiFinal") {
  return CUP_FORMATS.includes(value) ? value : fallback;
}

function readCupFixtureConfig(fixtures, fallbackFormat = "semiFinal") {
  const knockoutScores = fixtures?._knockout;
  const rawCup = fixtures?._cup;
  if (rawCup && typeof rawCup === "object") {
    if (rawCup.enabled === false) return null;
    return {
      enabled: true,
      format: normalizeCupFormat(rawCup.format, fallbackFormat),
      singleLeg: rawCup.singleLeg !== false,
      matchups: Array.isArray(rawCup.matchups) ? rawCup.matchups : [],
      finalTeams: Array.isArray(rawCup.finalTeams) ? rawCup.finalTeams.filter(Boolean).slice(0, 2) : [],
    };
  }
  if (knockoutScores && typeof knockoutScores === "object" && Object.keys(knockoutScores).length > 0) {
    return {
      enabled: true,
      format: normalizeCupFormat(fallbackFormat),
      singleLeg: false,
      matchups: [],
      finalTeams: [],
    };
  }
  return null;
}

function readPenaltyAdjustments(fixtures) {
  const rawPenalties = fixtures?._penalties;
  if (!rawPenalties || typeof rawPenalties !== "object" || Array.isArray(rawPenalties)) return {};
  return Object.fromEntries(
    Object.entries(rawPenalties)
      .map(([teamName, penalty]) => [
        teamName,
        {
          points: Math.max(0, Number(penalty?.points || 0)),
          gd: Math.max(0, Number(penalty?.gd || 0)),
        },
      ])
      .filter(([, penalty]) => penalty.points > 0 || penalty.gd > 0)
  );
}

function splitFixtureState(fixtures, fallbackFormat = "semiFinal") {
  const next = fixtures && typeof fixtures === "object" ? fixtures : {};
  const { _knockout, _cup, _penalties, ...groupFixtures } = next;
  return {
    groupFixtures,
    knockoutScores: _knockout && typeof _knockout === "object" ? _knockout : {},
    cupFixture: readCupFixtureConfig(next, fallbackFormat),
    penaltyAdjustments: readPenaltyAdjustments(next),
  };
}

function buildFixturePayload({ groupFixtures = {}, cupFixture = null, penaltyAdjustments = {}, knockoutScores = {} } = {}) {
  return {
    ...groupFixtures,
    _cup: cupFixture ?? null,
    _penalties: Object.keys(penaltyAdjustments || {}).length > 0 ? penaltyAdjustments : null,
    _knockout: Object.keys(knockoutScores || {}).length > 0 ? knockoutScores : null,
  };
}

function inferCupFixtureConfig(groups, participants = []) {
  const participantCount = Array.isArray(participants) && participants.length > 0
    ? participants.length
    : Object.values(groups || {}).reduce((sum, members) => sum + ((Array.isArray(members) ? members.filter(Boolean).length : 0)), 0);
  if (participantCount >= 8) return { enabled: true, format: "quarterFinal", singleLeg: true };
  if (participantCount >= 4) return { enabled: true, format: "semiFinal", singleLeg: true };
  if (participantCount >= 2) return { enabled: true, format: "finalOnly", singleLeg: true };
  return null;
}

function getCupFormatLabel(format) {
  if (format === "quarterFinal") return "Quarter Finals";
  if (format === "finalOnly") return "Final Only";
  return "Semi Finals";
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

function applyPenaltyAdjustments(rows, penalties = {}) {
  return (Array.isArray(rows) ? rows : [])
    .map((entry) => {
      const rawPenalty = penalties?.[entry.name];
      const penaltyPoints = Math.max(0, Number(rawPenalty?.points || 0));
      const penaltyGd = Math.max(0, Number(rawPenalty?.gd || 0));
      return {
        ...entry,
        penaltyPoints,
        penaltyGd,
        gd: Number(entry.gd || 0) - penaltyGd,
        points: Number(entry.points || 0) - penaltyPoints,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });
}

function buildLeagueTable(teams, fixtures, participantMeta, penalties = {}) {
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

  return applyPenaltyAdjustments(
    Array.from(tableMap.values()).map((entry) => ({ ...entry, gd: entry.gf - entry.ga, form: entry.form.slice(-5) })),
    penalties
  );
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

function StandingsTable({ rows, seasonNumber, expanded = false, teamLabels = {} }) {
  return React.createElement("div", { className: `results-standings${expanded ? " results-standings--expanded" : ""}`, style: { overflowX: "auto" } },
    React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 920 } },
      React.createElement("thead", null,
        React.createElement("tr", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#718096" } },
          ["#", "TEAM", "PLD", "W", "D", "L", "GF", "GA", "GD", "PTS", "FORM"].map((heading) => React.createElement("th", {
            key: heading,
            className: ["W", "D", "L", "GF", "GA", "FORM"].includes(heading) ? "standings-extra" : undefined,
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
               React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 18, color: "#fff", letterSpacing: 1 } }, teamLabels[row.name] || row.name),
               teamLabels[row.name] && React.createElement("small", { className: "results-muted" }, row.name),
              (row.penaltyPoints > 0 || row.penaltyGd > 0) && React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#ff8aa9", marginTop: 2 } },
                `${row.penaltyPoints > 0 ? `-${row.penaltyPoints} pts` : ""}${row.penaltyPoints > 0 && row.penaltyGd > 0 ? " · " : ""}${row.penaltyGd > 0 ? `-${row.penaltyGd} gd` : ""}`
              ),
               React.createElement("span", { className: "standings-placement" }, React.createElement(LeaguePlacementChip, { index, totalTeams: rows.length, seasonNumber }))
            )
          )
        ),
         ["played", "won", "drawn", "lost", "gf", "ga"].map((key) => React.createElement("td", { key, className: key !== "played" ? "standings-extra" : undefined, style: { textAlign: "center", padding: "12px 8px" } }, row[key])),
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
         React.createElement("td", { className: "standings-extra", style: { textAlign: "right", padding: "12px 8px" } }, React.createElement(FormChips, { form: row.form }))))
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
  players = EMPTY_ARRAY,
  tiers = TIERS,
  selectedName,
  auctionResultId,
  user,
  host = "",
  onRefresh,
  groupsEnabled = false,
  groups = EMPTY_OBJECT,
  fixtures = EMPTY_OBJECT,
  knockoutFormat = "quarterFinal",
  onStartTransferWindow,
  fixtureLeg = "single",
  seasonInfo = EMPTY_OBJECT,
  transferWindow = EMPTY_OBJECT,
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
  const [view, setView] = React.useState("squads");
  const [selectedSquad, setSelectedSquad] = React.useState(selectedName || participants[0]?.name || "");
  const [expandedStandings, setExpandedStandings] = React.useState(false);
  const [inventoryLimit, setInventoryLimit] = React.useState(25);
  const [analyserOpen, setAnalyserOpen] = React.useState(false);
  const [selectedUploadFixture, setSelectedUploadFixture] = React.useState(null);
  const [historySearch, setHistorySearch] = React.useState("");
  const [historyOwnerFilter, setHistoryOwnerFilter] = React.useState("ALL");
  const [historyPosFilter, setHistoryPosFilter] = React.useState("ALL");
  const [historyTierFilter, setHistoryTierFilter] = React.useState("ALL");
  const [historySectionFilter, setHistorySectionFilter] = React.useState("purchased");
  const [matchTeamFilter, setMatchTeamFilter] = React.useState(isHost ? "ALL" : selectedName || "ALL");
  const [matchLegFilter, setMatchLegFilter] = React.useState("ALL");
  const [fixturesState, setFixturesState] = React.useState(() => splitFixtureState(fixtures, knockoutFormat).groupFixtures);
  const [catalogPlayers, setCatalogPlayers] = React.useState([]);
  const [knockoutScores, setKnockoutScores] = React.useState(() => splitFixtureState(fixtures, knockoutFormat).knockoutScores);
  const [cupFixture, setCupFixture] = React.useState(() => splitFixtureState(fixtures, knockoutFormat).cupFixture);
  const [penaltyAdjustments, setPenaltyAdjustments] = React.useState(() => splitFixtureState(fixtures, knockoutFormat).penaltyAdjustments);
  const [knockoutPublishing, setKnockoutPublishing] = React.useState(false);
  const [knockoutPublished, setKnockoutPublished] = React.useState(false);
  const [startingCupFixture, setStartingCupFixture] = React.useState(false);
  const [savingPenalties, setSavingPenalties] = React.useState(false);
  const [loadingLatest, setLoadingLatest] = React.useState(false);
  const [startingTransferWindow, setStartingTransferWindow] = React.useState(false);
  const [deadlineDateDraft, setDeadlineDateDraft] = React.useState("");
  const [deadlineHourDraft, setDeadlineHourDraft] = React.useState("");
  const [deadlineMinuteDraft, setDeadlineMinuteDraft] = React.useState("");
  const [deadlineSaving, setDeadlineSaving] = React.useState(false);
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
  const [clubSelections, setClubSelections] = React.useState({});
  const [clubSaving, setClubSaving] = React.useState(false);
  const [clubError, setClubError] = React.useState("");
  const clubSavingRef = React.useRef(false);
  const clubRequestRef = React.useRef(0);
  const loadClubs = React.useCallback(async () => {
    if (!auctionResultId || !user?.token || clubSavingRef.current) return;
    const request = ++clubRequestRef.current;
    try { const selections = await apiGetClubSelections(auctionResultId, user.token); if (request === clubRequestRef.current) { setClubSelections(selections); setClubError(""); } }
    catch (error) { if (request === clubRequestRef.current) setClubError(error.message || "Could not load ISL club choices."); }
  }, [auctionResultId, user?.token]);
  React.useEffect(() => { loadClubs(); }, [loadClubs, view]);
  const clubLabels = React.useMemo(() => Object.fromEntries(Object.entries(clubSelections).map(([name, id]) => [name, islClubName(id)])), [clubSelections]);
  const selectClub = async clubId => {
    if (clubSavingRef.current) return;
    clubSavingRef.current = true;
    clubRequestRef.current++;
    setClubSaving(true); setClubError("");
    try { setClubSelections(await apiSaveClubSelection(auctionResultId, clubId, user.token)); }
    catch (error) { setClubError(error.message || "Could not save your club choice."); }
    finally { clubSavingRef.current = false; setClubSaving(false); }
  };
  const nameMap = React.useMemo(() => buildNameMap(participants, groups), [participants, groups]);

  React.useEffect(() => {
    const next = splitFixtureState(fixtures, knockoutFormat);
    setFixturesState(next.groupFixtures);
    setCupFixture(next.cupFixture);
    setPenaltyAdjustments(next.penaltyAdjustments);
    setKnockoutScores((prev) => Object.keys(prev).length > 0 ? prev : next.knockoutScores);
  }, [fixtures, knockoutFormat]);

  React.useEffect(() => {
    if (view !== "history" && view !== "transfers") return;
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
  }, [view]);

  React.useEffect(() => { setInventoryLimit(25); }, [view, historySearch, historyOwnerFilter, historyPosFilter, historyTierFilter, historySectionFilter]);

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
    () => buildLeagueTable(participants.map((participant) => participant.name), allFixtures, participantMeta, penaltyAdjustments),
    [participants, allFixtures, participantMeta, penaltyAdjustments]
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
  }, [matchTeamFilter, matchTeamOptions]);

  const groupSections = React.useMemo(() => {
    const legCount = fixtureLegCount(fixtureLeg);
    return Object.entries(resolvedGroups).flatMap(([label, teams]) => {
      const groupFixtures = [...(resolvedFixturesByGroup[label] || [])].sort((a, b) => {
        const roundDiff = (Number(a.round) || 0) - (Number(b.round) || 0);
        if (roundDiff !== 0) return roundDiff;
        return String(a.id || "").localeCompare(String(b.id || ""));
      });
      const roundsPerLeg = getBaseRoundCount(teams.length);
      if (legCount === 1) {
        return [{ id: `${label}-all`, groupLabel: label, leg: "ALL", title: `Group ${label}`, subtitle: `${teams.length} teams`, fixtures: groupFixtures }];
      }
      const sections = Array.from({ length: legCount }, (_, index) => {
        const leg = index + 1;
        return { id: `${label}-leg-${leg}`, groupLabel: label, leg: `FIXTURE_${leg}`, title: `Group ${label} · ${["First", "Second", "Third"][index]} leg`, subtitle: `${teams.length} teams`,
          fixtures: groupFixtures.filter(fixture => Number(fixture.leg || Math.floor((Number(fixture.round) - 1) / roundsPerLeg) + 1) === leg) };
      });
      const extras = groupFixtures.filter(fixture => !fixture.leg && Number(fixture.round) > roundsPerLeg * legCount);
      if (extras.length) sections.push({ id: `${label}-extra`, groupLabel: label, leg: "EXTRA", title: `Group ${label} · Additional fixtures`, fixtures: extras });
      return sections;
    });
  }, [resolvedGroups, resolvedFixturesByGroup, fixtureLeg]);
  const hasFixtureSplit = React.useMemo(
    () => groupSections.some((section) => section.leg !== "ALL"),
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

    const legFiltered = (!hasFixtureSplit || matchLegFilter === "ALL")
      ? teamFiltered
      : teamFiltered.filter((section) => section.leg === matchLegFilter);

    return legFiltered.map((section) => ({
      ...section,
      fixtures: [...section.fixtures].sort((left, right) => {
        const playedDiff = Number(isPlayedFixture(right)) - Number(isPlayedFixture(left));
        if (playedDiff !== 0) return playedDiff;
        if (isPlayedFixture(left) && isPlayedFixture(right)) {
          const updatedDiff = (Number(right.scoreUpdatedAt) || 0) - (Number(left.scoreUpdatedAt) || 0);
          if (updatedDiff !== 0) return updatedDiff;
        }
        const roundDiff = (Number(left.round) || 0) - (Number(right.round) || 0);
        if (roundDiff !== 0) return roundDiff;
        return String(left.id || "").localeCompare(String(right.id || ""));
      }),
    }));
  }, [groupSections, hasFixtureSplit, matchLegFilter, matchTeamFilter]);

  const firstRoundComplete = React.useMemo(() => {
    if (!groupsEnabled || Object.keys(resolvedGroups).length === 0) return false;
    return Object.entries(resolvedGroups).every(([label, teams]) => {
      const cleanTeams = (teams || []).filter(Boolean);
      const requiredMatchesPerTeam = Math.max(cleanTeams.length - 1, 0);
      if (requiredMatchesPerTeam === 0) return false;
      const table = computeGroupTable(cleanTeams, resolvedFixturesByGroup[label] || []);
      return table.length === cleanTeams.length && table.every((row) => Number(row.played || 0) >= requiredMatchesPerTeam);
    });
  }, [groupsEnabled, resolvedGroups, resolvedFixturesByGroup]);

  const effectiveTransferWindow = transferSessionState?.transferWindow || resultTransferState.transferWindow || transferWindow || {};
  const transferSessionId = String(effectiveTransferWindow?.activeSessionId || transferWindow?.activeSessionId || "");
  const transferWindowAlreadyOpened = Boolean(transferSessionId || effectiveTransferWindow?.openedAt || transferWindow?.openedAt);
  const listingDeadlineAt = Number(effectiveTransferWindow?.listingDeadlineAt || 0);
  const listingDeadlineValid = Number.isFinite(listingDeadlineAt) && listingDeadlineAt > 0;
  const listingDeadlinePassed = useDeadlinePassed(listingDeadlineAt);
  const listingDeadlineText = React.createElement(CountdownText, { deadlineAt: listingDeadlineAt });
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
      const next = splitFixtureState(latest, knockoutFormat);
      setFixturesState(next.groupFixtures);
      setCupFixture(next.cupFixture);
      setPenaltyAdjustments(next.penaltyAdjustments);
      setKnockoutScores(next.knockoutScores);
    } catch (_) {
      // Keep the existing UI state if refresh fails.
    } finally {
      setLoadingLatest(false);
    }
  }, [auctionResultId, knockoutFormat, user?.token]);

  React.useEffect(() => {
    loadLatestFixtures();
  }, [auctionResultId, loadLatestFixtures]);

  React.useEffect(() => {
    loadTransferSession();
  }, [loadTransferSession]);

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
  const handleSaveFixtureScore = async (groupLabel, fixtureId, homeGoals, awayGoals) => {
    if (!auctionResultId || !user?.token) throw new Error("Sign in to save a result.");
    await apiSaveFixtureScore(auctionResultId, groupLabel, fixtureId, homeGoals, awayGoals, user.token);
    setFixturesState(previous => ({ ...previous, [groupLabel]: (previous[groupLabel] || []).map(fixture => fixture.id === fixtureId
      ? { ...fixture, homeGoals, awayGoals, scoreUpdatedAt: homeGoals !== null && awayGoals !== null ? Date.now() : null } : fixture) }));
    trackEvent("fixture_goal_entered", { group: groupLabel });
  };

  const suggestedCupFixture = React.useMemo(
    () => inferCupFixtureConfig(resolvedGroups, participants),
    [participants, resolvedGroups]
  );

  const handleStartCupFixture = React.useCallback(async () => {
    if (!auctionResultId || !user?.token || !suggestedCupFixture) return;
    setStartingCupFixture(true);
    try {
      const participantNames = (participants || []).map((participant) => String(participant?.name || "").trim()).filter(Boolean);
      const randomBracket = buildRandomCupBracket(participantNames, suggestedCupFixture.format);
      const nextCupFixture = {
        ...suggestedCupFixture,
        ...randomBracket,
        singleLeg: true,
      };
      await apiSaveFixtures(auctionResultId, buildFixturePayload({
        groupFixtures: fixturesState,
        cupFixture: nextCupFixture,
        penaltyAdjustments,
        knockoutScores: {},
      }), user.token);
      setCupFixture(nextCupFixture);
      setKnockoutScores({});
      setKnockoutPublished(false);
    } catch (err) {
      alert(`Failed to start cup fixture: ${err.message}`);
    } finally {
      setStartingCupFixture(false);
    }
  }, [auctionResultId, fixturesState, participants, penaltyAdjustments, suggestedCupFixture, user?.token]);

  const handleUndoCupFixture = React.useCallback(async () => {
    if (!auctionResultId || !user?.token) return;
    setStartingCupFixture(true);
    try {
      await apiSaveFixtures(auctionResultId, buildFixturePayload({
        groupFixtures: fixturesState,
        cupFixture: null,
        penaltyAdjustments,
        knockoutScores: {},
      }), user.token);
      setCupFixture(null);
      setKnockoutScores({});
      setKnockoutPublished(false);
    } catch (err) {
      alert(`Failed to undo cup fixture: ${err.message}`);
    } finally {
      setStartingCupFixture(false);
    }
  }, [auctionResultId, fixturesState, penaltyAdjustments, user?.token]);

  const handlePenaltyChange = React.useCallback((teamName, key, rawValue) => {
    const nextValue = rawValue === "" ? 0 : Math.max(0, parseInt(rawValue, 10) || 0);
    setPenaltyAdjustments((prev) => {
      const current = prev?.[teamName] || { points: 0, gd: 0 };
      const nextEntry = {
        ...current,
        [key]: nextValue,
      };
      const next = { ...prev };
      if ((nextEntry.points || 0) === 0 && (nextEntry.gd || 0) === 0) {
        delete next[teamName];
      } else {
        next[teamName] = nextEntry;
      }
      return next;
    });
  }, []);

  const handleSavePenalties = React.useCallback(async (nextPenaltyAdjustments = null) => {
    if (!auctionResultId || !user?.token) return;
    const payloadPenaltyAdjustments = nextPenaltyAdjustments === null ? penaltyAdjustments : nextPenaltyAdjustments;
    setSavingPenalties(true);
    try {
      await apiSaveFixtures(auctionResultId, buildFixturePayload({
        groupFixtures: fixturesState,
        cupFixture,
        penaltyAdjustments: payloadPenaltyAdjustments,
        knockoutScores,
      }), user.token);
      setPenaltyAdjustments(payloadPenaltyAdjustments);
    } catch (err) {
      alert(`Failed to save penalties: ${err.message}`);
    } finally {
      setSavingPenalties(false);
    }
  }, [auctionResultId, cupFixture, fixturesState, knockoutScores, penaltyAdjustments, user?.token]);

  const penaltyRows = React.useMemo(
    () => participants.map((participant) => ({
      name: participant.name,
      points: penaltyAdjustments?.[participant.name]?.points || 0,
      gd: penaltyAdjustments?.[participant.name]?.gd || 0,
      color: participantMeta.get(participant.name)?.color || "#4FC3F7",
    })),
    [participantMeta, participants, penaltyAdjustments]
  );

  const hasPenaltyAdjustments = penaltyRows.some((row) => row.points > 0 || row.gd > 0);

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
      if (transferSessionState?.id) {
        const reply = await submitSessionAction(transferSessionState.id, { type: "transfer-toggle", playerId: Number(player.id), listed: !currentlyListed }, user.token, Number(transferSessionState.revision || 0));
        const result = applySessionEvent(transferSessionState, reply.event);
        if (result.gap) await loadTransferSession(); else setTransferSessionState(result.session);
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
      if (err.code === "STALE_REVISION") await loadTransferSession();
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
    const actionLabel = player.isTransferListed ? "Unlist" : "List for transfer";

    return React.createElement("div", {
      key: `${player.owner || "pool"}-${player.id}`,
      className: "results-player-row",
    },
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
      showTransferPrice && React.createElement("div", { className: "results-muted results-player-price" }, `${player.transferPrice}M${player.isTransferListed ? " · Listed" : ""}`)
    ),
    showOwner
      ? React.createElement("span", { className: "results-player-owner", style: { color: ownerColor } }, player.owner || "Available")
      : React.createElement("span", { className: "results-player-owner results-muted" }, "Available"),
    canToggle && React.createElement("button", {
          type: "button", className: "results-player-action", "aria-label": `${actionLabel}: ${player.name}`,
          onClick: () => handleToggleTransferListing(player),
          disabled: Boolean(transferActionPlayerId),
        }, transferActionPlayerId === String(player.id) ? "UPDATING…" : actionLabel)
    );
  };

  const surfaceCard = {
    background: "linear-gradient(180deg,#0b1018,#090d15)",
    border: "1px solid #1d2433",
    borderRadius: 20,
    boxShadow: "0 20px 60px #00000033",
  };

  return React.createElement("div", { className: "results-page" },
    React.createElement(SquadAnalyser, {
      participants,
      wishlists,
      players,
      tiers,
      selectedName,
      onClose: () => setAnalyserOpen(false),
      hidden: !analyserOpen,
    }),
    React.createElement("main", { className: "results-shell" },
      React.createElement("header", { className: "results-header" },
        React.createElement("div", null,
          React.createElement("h1", null, leagueName),
          React.createElement("span", { className: "results-muted" }, `Season ${seasonNumber} · ${participants.length} teams${groupsEnabled ? ` · ${playedMatches}/${totalMatches} matches played` : " · Auction results"}`)
        ),
        React.createElement("div", { className: "results-actions" },
          onBackToDiscover && React.createElement("button", { type: "button", onClick: onBackToDiscover }, "← Home"),
          groupsEnabled && (view === "table" || view === "matches") && React.createElement("button", { type: "button", onClick: () => { loadLatestFixtures(); loadClubs(); }, disabled: loadingLatest }, loadingLatest ? "Refreshing…" : "Refresh scores")
        )
      ),
      React.createElement("nav", { className: "results-nav", "aria-label": "Auction results" },
        [["squads", "Squads"], ...(groupsEnabled ? [["table", "Standings"], ["matches", "Matches"]] : []), ["transfers", "Transfers"], ["awards", "Awards"]].map(([key, label]) =>
          React.createElement("button", { type: "button", key, "aria-pressed": view === key || (key === "squads" && view === "history"), onClick: () => {
            if (key === "transfers") {
              setHistorySectionFilter("purchased");
              setHistoryOwnerFilter(selectedName && inventoryParticipants.some(p => p.name === selectedName) ? selectedName : "ALL");
            }
            setView(key);
          } }, label))
      ),
      clubError && React.createElement("p", { role: "alert", className: "results-error" }, clubError),
      (view === "table" || view === "matches" || view === "transfers") && isHost && React.createElement("details", { className: "results-disclosure" },
        React.createElement("summary", null, view === "transfers" ? "Host transfer controls" : "Host cup controls"),
        React.createElement("div", { className: "results-actions" },
          view !== "transfers" && groupsEnabled && isHost && suggestedCupFixture && !cupFixture && React.createElement("button", {
            onClick: handleStartCupFixture,
            disabled: startingCupFixture,
            style: {
              background: "#FFD70018",
              color: "#FFD700",
              border: "1px solid #FFD70044",
              borderRadius: 999,
              padding: "9px 18px",
              cursor: startingCupFixture ? "default" : "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 14,
              letterSpacing: 1,
              opacity: startingCupFixture ? 0.6 : 1,
            }
          }, startingCupFixture ? "STARTING CUP…" : `START CUP · ${getCupFormatLabel(suggestedCupFixture.format).toUpperCase()}`),
          view !== "transfers" && groupsEnabled && isHost && cupFixture && React.createElement("button", {
            onClick: handleUndoCupFixture,
            disabled: startingCupFixture,
            style: {
              background: "#FF3D7118",
              color: "#ff8aa9",
              border: "1px solid #FF3D7144",
              borderRadius: 999,
              padding: "9px 18px",
              cursor: startingCupFixture ? "default" : "pointer",
              fontFamily: "'Bebas Neue'",
              fontSize: 14,
              letterSpacing: 1,
              opacity: startingCupFixture ? 0.6 : 1,
            }
          }, startingCupFixture ? "REMOVING CUP…" : "UNDO CUP FIXTURE"),
          view === "transfers" && groupsEnabled && isHost && onStartTransferWindow && React.createElement("button", {
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
        )
      ),
      view === "table" && React.createElement("div", { style: { display: "grid", gap: 20 } },
        React.createElement("div", { style: { ...surfaceCard, padding: 22 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 30, color: "#fff", letterSpacing: 2 } }, "League Table"),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 13, color: "#8290a8", marginTop: 4 } }, "Points decide the ranking. GD breaks ties.")
            ),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba" } }, latestFixtureTimestamp ? formatRelativeTime(latestFixtureTimestamp) : "No scores entered yet")
          ),
           React.createElement("label", { className: "results-muted", style: { display: "block", marginBottom: 12 } },
             React.createElement("input", { type: "checkbox", checked: expandedStandings, onChange: event => setExpandedStandings(event.target.checked) }), " Detailed stats"),
           React.createElement(StandingsTable, { rows: standings, seasonNumber, expanded: expandedStandings, teamLabels: clubLabels })
        ),
         (isHost || hasPenaltyAdjustments) && React.createElement("details", { className: "results-disclosure" },
           React.createElement("summary", null, hasPenaltyAdjustments ? "Point deductions · adjustments applied" : "Point deductions"),
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" } },
            React.createElement("div", null,
              React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#ff8aa9", letterSpacing: 2 } }, "PENALTY ADJUSTMENTS"),
              React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba", marginTop: 4 } }, "Deduct points and goal difference for rule breaches.")
            ),
            isHost && React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
              React.createElement("button", {
                onClick: async () => {
                  const nextPenalties = {};
                  setPenaltyAdjustments(nextPenalties);
                  await handleSavePenalties(nextPenalties);
                },
                style: {
                  background: "#0d1119",
                  color: "#a7b1c2",
                  border: "1px solid #1f2937",
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontFamily: "'Bebas Neue'",
                  fontSize: 12,
                  letterSpacing: 1,
                }
              }, "CLEAR"),
              React.createElement("button", {
                 onClick: () => handleSavePenalties(),
                disabled: savingPenalties,
                style: {
                  background: "#ff8aa914",
                  color: "#ff8aa9",
                  border: "1px solid #ff8aa944",
                  borderRadius: 999,
                  padding: "8px 14px",
                  cursor: savingPenalties ? "default" : "pointer",
                  fontFamily: "'Bebas Neue'",
                  fontSize: 12,
                  letterSpacing: 1,
                  opacity: savingPenalties ? 0.6 : 1,
                }
              }, savingPenalties ? "SAVING…" : "SAVE PENALTIES")
            )
          ),
          React.createElement("div", { style: { display: "grid", gap: 10 } },
            penaltyRows
              .filter((row) => isHost || row.points > 0 || row.gd > 0)
              .map((row) => React.createElement("div", {
                 key: row.name, className: "results-penalty-row",
                style: {
                  display: "grid",
                  gridTemplateColumns: isHost ? "minmax(220px,1fr) repeat(2, minmax(120px, 140px))" : "minmax(180px,1fr) 1fr",
                  gap: 12,
                  alignItems: "end",
                  background: "#0c121ccc",
                  border: "1px solid #1e2230",
                  borderRadius: 14,
                  padding: "12px 14px",
                }
              },
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } },
                React.createElement(TeamBadge, { name: row.name, color: row.color, small: true }),
                React.createElement("div", {
                  style: {
                    fontFamily: "'Bebas Neue'",
                    fontSize: 18,
                    color: "#fff",
                    letterSpacing: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }
                }, row.name)
              ),
              isHost
                ? React.createElement(React.Fragment, null,
                    React.createElement("label", { style: { display: "grid", gap: 4, minWidth: 0 } },
                      React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" } }, "PTS DEDUCTION"),
                      React.createElement("input", {
                        type: "number",
                        min: 0,
                        value: row.points,
                        onChange: (event) => handlePenaltyChange(row.name, "points", event.target.value),
                        style: { width: "100%", minWidth: 0, boxSizing: "border-box", background: "#05070d", border: "1px solid #273246", borderRadius: 10, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 18, textAlign: "center", padding: "8px 0" },
                      })
                    ),
                    React.createElement("label", { style: { display: "grid", gap: 4, minWidth: 0 } },
                      React.createElement("span", { style: { fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" } }, "GD DEDUCTION"),
                      React.createElement("input", {
                        type: "number",
                        min: 0,
                        value: row.gd,
                        onChange: (event) => handlePenaltyChange(row.name, "gd", event.target.value),
                        style: { width: "100%", minWidth: 0, boxSizing: "border-box", background: "#05070d", border: "1px solid #273246", borderRadius: 10, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 18, textAlign: "center", padding: "8px 0" },
                      })
                    )
                  )
                : React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#ff8aa9" } },
                    `${row.points > 0 ? `-${row.points} pts` : ""}${row.points > 0 && row.gd > 0 ? " · " : ""}${row.gd > 0 ? `-${row.gd} gd` : ""}`
                  )
              ))
          )
        ),
         cupFixture && Object.keys(groups).length >= 1 && React.createElement("details", { className: "results-disclosure" },
         React.createElement("summary", null, `Cup bracket · ${getCupFormatLabel(cupFixture.format)}`),
         React.createElement(KnockoutBracket, {
          groups,
          fixturesState,
          knockoutScores,
          nameMap,
          isHost,
          knockoutFormat: cupFixture.format,
          cupFixture,
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
              await apiSaveFixtures(auctionResultId, buildFixturePayload({
                groupFixtures: fixturesState,
                cupFixture,
                penaltyAdjustments,
                knockoutScores,
              }), user.token);
              setKnockoutPublished(true);
            } catch (_) {
              // Surface stays local until the next publish attempt.
            } finally {
              setKnockoutPublishing(false);
            }
          } : null,
          onRefresh: !isHost ? loadLatestFixtures : null,
          refreshing: loadingLatest,
         }))
      ),
      view === "matches" && groupsEnabled && React.createElement(
        "div",
        { style: { display: "grid", gap: 18 } },
        React.createElement("div", { className: "results-filters" },
          React.createElement("label", null, "Show matches for", React.createElement("select", { "aria-label": "Show matches for", value: matchTeamFilter, onChange: event => setMatchTeamFilter(event.target.value) },
            React.createElement("option", { value: "ALL" }, "All teams"),
            matchTeamOptions.map(name => React.createElement("option", { key: name, value: name }, clubLabels[name] ? `${clubLabels[name]} · ${name}` : name)))),
          hasFixtureSplit && React.createElement("label", null, "Fixture leg", React.createElement("select", { "aria-label": "Fixture leg", value: matchLegFilter, onChange: event => setMatchLegFilter(event.target.value) },
            [["ALL", "All fixtures"], ...Array.from({ length: fixtureLegCount(fixtureLeg) }, (_, index) => [`FIXTURE_${index + 1}`, `${["First", "Second", "Third"][index]} leg`]), ...(groupSections.some(section => section.leg === "EXTRA") ? [["EXTRA", "Additional fixtures"]] : [])].map(([value, label]) => React.createElement("option", { key: value, value }, label))))
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
                    React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 1 } }, section.title.replace("Fixture 1", "First leg").replace("Fixture 2", "Second leg"))
                  ),
                  React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, section.subtitle)
                ),
                React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, `${section.fixtures.filter(isPlayedFixture).length}/${section.fixtures.length} scored`)
              ),
              React.createElement(
                "div",
                { style: { display: "flex", flexDirection: "column", gap: 10 } },
                section.fixtures.map(fixture => React.createElement(ResultMatchRow, {
                  key: fixture.id, fixture, groupLabel: section.groupLabel,
                  canEdit: isHost || selectedName === fixture.home || selectedName === fixture.away,
                  teamLabels: clubLabels,
                  onSave: handleSaveFixtureScore, onUpload: setSelectedUploadFixture,
                }))
              )
            ))
      ),
      view === "squads" && React.createElement("section", { "aria-label": "Squads" },
        React.createElement("div", { className: "results-view-heading" },
          React.createElement("h2", null, "Squads"),
          React.createElement("div", { className: "results-actions" },
            React.createElement("button", { type: "button", onClick: () => setAnalyserOpen(true) }, "My formation & planner"),
            React.createElement("button", { type: "button", onClick: () => { setHistoryOwnerFilter("ALL"); setView("history"); } }, "Browse all players")
          )
        ),
        React.createElement("div", { className: "results-filters" },
          React.createElement("label", null, "Team", React.createElement("select", { "aria-label": "Team", value: selectedSquad, onChange: event => setSelectedSquad(event.target.value) },
            participants.map(p => React.createElement("option", { key: p.name, value: p.name }, p.name === selectedName ? `${p.name} (you)` : p.name))))
        ),
        participants.filter(p => p.name === (participants.some(p => p.name === selectedSquad) ? selectedSquad : participants[0]?.name)).map((participant) => {
          const index = participants.findIndex(p => p.name === participant.name);
          const valid = participant.squad.length >= SQUAD_MIN && participant.squad.length <= SQUAD_MAX;
          const spent = participant.squad.reduce((sum, player) => sum + getPlayerAcquisitionPrice(player, tiers), 0);
          return React.createElement("div", { key: participant.name, className: "results-squad" },
            React.createElement("div", { className: "results-squad-header", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" } },
              React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                React.createElement(TeamBadge, { name: participant.name, color: PCOLORS[index % PCOLORS.length] }),
                React.createElement("div", null,
                  React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 1 } }, participant.name),
                   React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#8290a8" } }, `${participant.squad.length} players · ${participant.budget}M left`)
                )
              ),
               React.createElement("label", { className: "results-club-choice" }, "FC 26 · ISL club",
                 React.createElement("select", { "aria-label": `ISL club for ${participant.name}`, value: clubSelections[participant.name] || "", disabled: participant.name !== user?.username || clubSaving,
                   onChange: event => selectClub(event.target.value) },
                   React.createElement("option", { value: "" }, "Choose your club"),
                   ISL_CLUBS.map(club => React.createElement("option", { key: club.id, value: club.id }, club.note ? `${club.name} (${club.note})` : club.name))),
                 React.createElement("small", { className: "results-muted" }, clubSaving ? "Saving your club…" : participant.name === user?.username ? "Shown on fixtures. Names vary by FC 26 squad update." : "This player chooses their own club.")
               ),
               !valid && React.createElement("span", {
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
               }, "Incomplete squad")
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
              React.createElement("span", { className: "results-muted", style: { alignSelf: "center" } }, `${spent}M spent`)
            ),
            React.createElement("ul", { className: "results-squad-list" },
              participant.squad.slice().sort((a, b) => b.rating - a.rating).map((player) => {
                const td = getTierData(player.rating, tiers);
                return React.createElement("li", {
                  key: player.id,
                },
                React.createElement("span", { style: { color: td.color } }, player.rating),
                React.createElement("span", { className: "results-muted" }, player.pos),
                React.createElement("strong", null, player.name),
                React.createElement("span", { className: "results-muted" }, `${getPlayerAcquisitionPrice(player, tiers)}M`));
              })
            )
          );
        })
      ),
      (view === "history" || view === "transfers") && React.createElement("section", { "aria-label": view === "transfers" ? "Transfers" : "Players", style: { display: "flex", flexDirection: "column", gap: 12 } },
        React.createElement("div", { className: "results-view-heading" },
          React.createElement("h2", null, view === "transfers" ? "Transfers" : "Players"),
          view === "history" && React.createElement("button", { className: "results-button", onClick: () => setView("squads") }, "← Back to squads")
        ),
        React.createElement("div", { className: "results-filters" },
          React.createElement("input", {
            type: "search", "aria-label": "Search players or owners",
            value: historySearch,
            onChange: (e) => setHistorySearch(e.target.value),
            placeholder: "Search player or owner…",
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          }),
          React.createElement("select", {
            "aria-label": "Player owner",
            value: historyOwnerFilter,
            onChange: (e) => setHistoryOwnerFilter(e.target.value),
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          },
          React.createElement("option", { value: "ALL" }, "All owners"),
          inventoryParticipants.map((participant) => React.createElement("option", { key: participant.name, value: participant.name }, participant.name))),
          React.createElement("details", { className: "results-extra-filters" },
            React.createElement("summary", null, `More filters${historyPosFilter !== "ALL" || historyTierFilter !== "ALL" ? " · active" : ""}`),
            React.createElement("div", { className: "results-filters", style: { margin: "10px 0 0" } },
          React.createElement("select", {
            "aria-label": "Player position",
            value: historyPosFilter,
            onChange: (e) => setHistoryPosFilter(e.target.value),
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          },
          React.createElement("option", { value: "ALL" }, "All positions"),
          Array.from(new Set([...purchasedPlayers, ...unpurchasedPlayers].map((player) => player.pos).filter(Boolean))).sort().map((pos) => React.createElement("option", { key: pos, value: pos }, pos))),
          React.createElement("select", {
            "aria-label": "Player tier",
            value: historyTierFilter,
            onChange: (e) => setHistoryTierFilter(e.target.value),
            style: { background: "#0d1119", color: "#fff", border: "1px solid #1f2937", borderRadius: 10, padding: "10px 12px" },
          },
          React.createElement("option", { value: "ALL" }, "All tiers"),
          Array.from(new Set([...purchasedPlayers, ...unpurchasedPlayers].map((player) => getTierKey(player.rating, tiers)))).sort().map((tier) => React.createElement("option", { key: tier, value: tier }, tier)))
          ))
        ),
        React.createElement("div", { style: { ...surfaceCard, padding: 16, display: "grid", gap: 16 } },
          React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" } },
            React.createElement("div", null,
              view === "transfers" && React.createElement("p", { className: "results-muted", style: { margin: 0 } }, "Choose players from your squad to list for transfer.")
            ),
            view === "transfers" && React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: listingDeadlinePassed ? "#FFB84D" : "#8fe7c0", maxWidth: "100%", display: "grid", gap: 4 } },
              React.createElement("div", null,
                transferSyncLoading
                  ? "Syncing transfer window…"
                  : !transferSessionId
                   ? "Listings will carry into the next transfer window."
                   : transferListingEditable
                     ? `Transfer window is live. List ${effectiveTransferWindow.requiredSalesMin || 2}-${effectiveTransferWindow.requiredSalesMax || 5} players from your own squad.`
                     : transferWindowAlreadyOpened
                       ? "Transfer listings are read-only here because the market is already open or closed."
                       : "Transfer listings are available here."
              ),
              listingDeadlineValid && React.createElement("div", { style: { color: listingDeadlinePassed ? "#FFB84D" : "#8fe7c0", fontWeight: 700 } }, listingDeadlineText),
              isHost && React.createElement("details", { className: "results-disclosure" },
                React.createElement("summary", null, "Manage listing deadline"),
                React.createElement("div", { className: "results-deadline-grid", style: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 } },
                 React.createElement("input", {
                    type: "date",
                    "aria-label": "Listing deadline date",
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
                    "aria-label": "Listing deadline hour",
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
                    "aria-label": "Listing deadline minute",
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
          view === "transfers" && React.createElement("details", { className: "results-disclosure" },
            React.createElement("summary", null, "Team budgets after listings"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 10 } },
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
          )),
          React.createElement("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
            [
              { key: "purchased", label: `Squad players (${filteredPurchasedPlayers.length})`, tone: "#FFD700" },
              { key: "unpurchased", label: `Unpurchased (${filteredUnpurchasedPlayers.length})`, tone: "#4FC3F7" },
              { key: "listed", label: `Listed (${filteredTransferListedPlayers.length})`, tone: "#FFB84D" },
            ].filter(item => view === "history" || item.key !== "unpurchased").map((item) => React.createElement("button", {
              key: item.key,
              "aria-pressed": historySectionFilter === item.key,
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
              title: historyOwnerFilter === selectedName ? "Your squad players" : "Squad players",
              subtitle: "Players owned by auction participants.",
              rows: filteredPurchasedPlayers.slice().sort((a, b) => {
                const ownerBias = Number(b.owner === selectedName) - Number(a.owner === selectedName);
                if (ownerBias !== 0) return ownerBias;
                return Number(b.rating || 0) - Number(a.rating || 0);
              }),
              empty: "No purchased players match the selected filters.",
              showOwner: true,
              showAction: view === "transfers",
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
              title: "Listed players",
              subtitle: "This section stays synced with the mid-season transfer window listings.",
              rows: filteredTransferListedPlayers.slice().sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)),
              empty: "No transfer-listed players match the selected filters.",
              showOwner: true,
              showAction: view === "transfers",
              showTransferPrice: true,
            },
          ].filter((section) => historySectionFilter === section.key).map((section) => React.createElement("div", {
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
            ),
            React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#aab6ca" } }, `${section.rows.length} players`)
          ),
          section.rows.length === 0
            ? React.createElement("div", { style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" } }, section.empty)
            : React.createElement("div", { style: { display: "grid" } }, section.rows.slice(0, inventoryLimit).map((player, index) => renderInventoryRow(player, index, {
                showOwner: section.showOwner,
                showAction: section.showAction,
                showTransferPrice: section.showTransferPrice,
              }))),
          section.rows.length > inventoryLimit && React.createElement("button", { className: "results-button", onClick: () => setInventoryLimit(limit => limit + 25) }, `Show more (${section.rows.length - inventoryLimit} remaining)`)
          ))
        )
      ),
      view === "awards" && React.createElement(React.Suspense, { fallback: React.createElement("p", { role: "status", className: "results-muted" }, "Loading awards…") }, React.createElement(BallonDorPanel, {
        auctionResultId,
        participants,
        fixtures: allFixtures,
        user,
        mode: "standings",
      })),
      selectedUploadFixture && React.createElement(React.Suspense, { fallback: React.createElement("p", { role: "status", className: "results-muted" }, "Loading player stats…") }, React.createElement(BallonDorPanel, {
        auctionResultId,
        participants,
        fixtures: allFixtures,
        user,
        mode: "entry",
        modal: true,
        leagueName,
        onClose: () => setSelectedUploadFixture(null),
        canGenerateLink: isHost,
        selectedFixtureId: selectedUploadFixture.id,
        allowedTeamNames: [selectedUploadFixture.home, selectedUploadFixture.away],
      }))
    )
  );
}
