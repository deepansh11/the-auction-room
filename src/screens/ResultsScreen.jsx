import React from "react";
import { SquadAnalyser } from "../widgets/SquadAnalyser.jsx";
import { BUDGET, PCOLORS, SQUAD_MIN, SQUAD_MAX, TIERS, getTierData, getTierKey } from "../game/constants.js";
import { computeGroupTable, computeKnockoutMatchups } from "../game/groupsFixtures.js";
import { MYSTERY_CARD_PRICE } from "../game/constants.js";
import { apiGetFixtures } from "../lib/api.js";
import { downloadSquadImage } from "../utils/squadImage.js";
import { apiSaveAuctionPoints, apiSaveFixtures } from "../lib/api.js";
import { trackEvent } from "../lib/analytics.js";

// ── World Cup Knockout Bracket ────────────────────────────────────────────────
function KnockoutBracket({ groups, fixturesState, knockoutScores, onScoreChange }) {
  const groupLabels = Object.keys(groups || {}).sort();
  const matchups = computeKnockoutMatchups(groupLabels);

  // Resolve a seeding key like "1A" to the actual team name from the standing table
  function resolveSeed(key) {
    const pos = parseInt(key[0], 10) - 1;
    const grpLabel = key.slice(1);
    const tbl = computeGroupTable(groups[grpLabel] || [], fixturesState[grpLabel] || []);
    return tbl[pos]?.name || key;
  }

  function getWinner(matchId, homeTeam, awayTeam) {
    const sc = knockoutScores[matchId] || {};
    const hg = Number(sc.homeGoals);
    const ag = Number(sc.awayGoals);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) return null;
    return hg > ag ? homeTeam : ag > hg ? awayTeam : null;
  }

  function MatchLine({ matchId, homeKey, awayKey, label }) {
    const home = resolveSeed(homeKey);
    const away = resolveSeed(awayKey);
    const sc = knockoutScores[matchId] || {};
    const winner = getWinner(matchId, home, away);
    const rowStyle = (team) => ({
      display: "flex", alignItems: "center", gap: 8,
      background: winner === team ? "#FFD70015" : "#0d0f16",
      border: `1px solid ${winner === team ? "#FFD70044" : "#1e2028"}`,
      borderRadius: 6, padding: "5px 8px", marginBottom: 3,
    });
    return React.createElement("div", { style: { minWidth: 220 } },
      React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 4 } }, label),
      React.createElement("div", { style: rowStyle(home) },
        React.createElement("span", { style: { flex: 1, fontFamily: "'Exo 2'", fontSize: 12, color: winner === home ? "#FFD700" : "#ccc", fontWeight: winner === home ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, home),
        React.createElement("input", {
          type: "number", min: 0, value: sc.homeGoals ?? "",
          onChange: (e) => onScoreChange(matchId, "homeGoals", e.target.value),
          style: { width: 34, background: "#05070d", border: "1px solid #1e2028", borderRadius: 4, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 13, textAlign: "center", padding: "2px 0" }
        })
      ),
      React.createElement("div", { style: rowStyle(away) },
        React.createElement("span", { style: { flex: 1, fontFamily: "'Exo 2'", fontSize: 12, color: winner === away ? "#FFD700" : "#ccc", fontWeight: winner === away ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, away),
        React.createElement("input", {
          type: "number", min: 0, value: sc.awayGoals ?? "",
          onChange: (e) => onScoreChange(matchId, "awayGoals", e.target.value),
          style: { width: 34, background: "#05070d", border: "1px solid #1e2028", borderRadius: 4, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 13, textAlign: "center", padding: "2px 0" }
        })
      ),
      winner && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 9, color: "#FFD700", marginTop: 3, letterSpacing: 1 } }, `→ ${winner} advances`)
    );
  }

  // Build final matchup from semi-final winners
  const sfMatchups = matchups.filter(m => m.round === "R16");
  const half = Math.ceil(sfMatchups.length / 2);
  const leftSFs = sfMatchups.slice(0, half);
  const rightSFs = sfMatchups.slice(half);

  // For 2 groups: leftSFs = [SF1], rightSFs = [SF2]
  const leftWinners = leftSFs.map(m => getWinner(m.id, resolveSeed(m.homeKey), resolveSeed(m.awayKey)));
  const rightWinners = rightSFs.map(m => getWinner(m.id, resolveSeed(m.homeKey), resolveSeed(m.awayKey)));

  const finalHomeTeam = leftWinners[0] || (leftSFs[0] ? `W:${leftSFs[0].id}` : "SF1 Winner");
  const finalAwayTeam = rightWinners[0] || (rightSFs[0] ? `W:${rightSFs[0].id}` : "SF2 Winner");
  const finalWinner = getWinner("FINAL", finalHomeTeam, finalAwayTeam);
  const finalSc = knockoutScores["FINAL"] || {};

  return React.createElement("div", { style: { background: "#07080f", border: "1px solid #FFD70033", borderRadius: 14, padding: 24, marginTop: 8 } },
    React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 20, color: "#FFD700", letterSpacing: 3, textAlign: "center", marginBottom: 20 } }, "KNOCKOUT STAGE"),
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 0 } },
      // Left column — semi-finals
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, flex: 1 } },
        leftSFs.map(m => React.createElement(MatchLine, { key: m.id, matchId: m.id, homeKey: m.homeKey, awayKey: m.awayKey, label: `SEMI-FINAL (${m.homeKey} v ${m.awayKey})` }))
      ),
      // Bracket connector lines
      React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", flexShrink: 0 } },
        React.createElement("div", { style: { width: 24, height: "50%", borderTop: "1px solid #FFD70044", borderRight: "1px solid #FFD70044" } }),
        React.createElement("div", { style: { width: 24, height: "50%", borderBottom: "1px solid #FFD70044", borderRight: "1px solid #FFD70044" } })
      ),
      // Center — trophy + final
      React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, minWidth: 200 } },
        React.createElement("img", { src: "/world-cup-trophy.png", alt: "World Cup", style: { width: 80, height: "auto", filter: "drop-shadow(0 0 12px #FFD700aa)" } }),
        React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 13, color: "#FFD700", letterSpacing: 2, marginBottom: 4 } }, "FINAL"),
        React.createElement("div", { style: { background: "#0d0f16", border: "1px solid #FFD70044", borderRadius: 8, padding: "8px 12px", width: "100%" } },
          [
            { team: finalHomeTeam, side: "homeGoals" },
            { team: finalAwayTeam, side: "awayGoals" },
          ].map(({ team, side }) =>
            React.createElement("div", { key: side, style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } },
              React.createElement("span", { style: { flex: 1, fontFamily: "'Exo 2'", fontSize: 12, color: finalWinner === team ? "#FFD700" : "#ccc", fontWeight: finalWinner === team ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, team),
              React.createElement("input", {
                type: "number", min: 0, value: finalSc[side] ?? "",
                onChange: (e) => onScoreChange("FINAL", side, e.target.value),
                style: { width: 34, background: "#05070d", border: "1px solid #1e2028", borderRadius: 4, color: "#FFD700", fontFamily: "'Bebas Neue'", fontSize: 13, textAlign: "center", padding: "2px 0" }
              })
            )
          )
        ),
        finalWinner && React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 14, color: "#FFD700", letterSpacing: 2, textAlign: "center", textShadow: "0 0 16px #FFD700aa" } }, `🏆 ${finalWinner}`)
      ),
      // Right bracket connector
      React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", flexShrink: 0 } },
        React.createElement("div", { style: { width: 24, height: "50%", borderTop: "1px solid #FFD70044", borderLeft: "1px solid #FFD70044" } }),
        React.createElement("div", { style: { width: 24, height: "50%", borderBottom: "1px solid #FFD70044", borderLeft: "1px solid #FFD70044" } })
      ),
      // Right column — semi-finals
      React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16, flex: 1 } },
        rightSFs.map(m => React.createElement(MatchLine, { key: m.id, matchId: m.id, homeKey: m.homeKey, awayKey: m.awayKey, label: `SEMI-FINAL (${m.homeKey} v ${m.awayKey})` }))
      )
    )
  );
}

// Reconcile placeholder names ("Player 2", "Player 3" …) with real participant names.
// Placeholder "Player N" maps to participants[N-1] (since participants are stored in original sequence order).
function buildNameMap(participants, groups) {
  const realNames = new Set((participants || []).map((p) => p.name));
  const nameMap = {};
  Object.values(groups || {}).flat().forEach((name) => {
    if (!realNames.has(name) && /^player\s+\d+$/i.test(String(name || ""))) {
      const n = parseInt(String(name).match(/\d+/)[0], 10);
      const real = (participants || [])[n - 1]?.name;
      if (real) nameMap[name] = real;
    }
  });
  return nameMap;
}

export function ResultsScreen({
  participants, wishlists, players=[], tiers=TIERS, selectedName, auctionResultId, user, host="", onRefresh,
  groupsEnabled=false, groups={}, fixtures={},
}) {
  const isHost = Boolean(host && user?.username && host === user.username);
  const [view, setView] = React.useState("squads");
  const [analyserOpen, setAnalyserOpen] = React.useState(false);
  const [pointsData, setPointsData] = React.useState({});
  const [savingPoints, setSavingPoints] = React.useState(false);
  const [fixturesState, setFixturesState] = React.useState(() => {
    const f = fixtures || {};
    // eslint-disable-next-line no-unused-vars
    const { _knockout, ...groupFixtures } = f;
    return groupFixtures;
  });
  const [savingFixtureId, setSavingFixtureId] = React.useState("");
  const [knockoutScores, setKnockoutScores] = React.useState(() => (fixtures || {})._knockout || {});
  const [knockoutPublishing, setKnockoutPublishing] = React.useState(false);
  const [knockoutPublished, setKnockoutPublished] = React.useState(false);
  const [loadingLatest, setLoadingLatest] = React.useState(false);
  const knockoutSaveTimerRef = React.useRef(null);
  const saveFixturesTimerRef = React.useRef(null);
  const nameMap = React.useMemo(() => buildNameMap(participants, groups), [participants, groups]);

  React.useEffect(() => {
    const f = fixtures || {};
    // eslint-disable-next-line no-unused-vars
    const { _knockout, ...groupFixtures } = f;
    setFixturesState(groupFixtures);
    setKnockoutScores((prev) => Object.keys(prev).length > 0 ? prev : (_knockout || {}));
  }, [fixtures]);

  // Load latest fixtures once on mount (picks up knockout scores published by host)
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
    } catch (_) {}
    finally { setLoadingLatest(false); }
  }, [auctionResultId, user?.token]);

  React.useEffect(() => {
    loadLatestFixtures();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionResultId]);

  const allPicks = participants.flatMap(p =>
    p.squad.map(pl => ({ ...pl, owner:p.name, ownerIdx:participants.findIndex(x=>x.name===p.name) }))
  );

  // A player can be owned by more than one participant (e.g. a Mystery Card duplicate reveal).
  // Points reflect the real player's performance, so award/save them once per unique player,
  // while still listing every owner that has them.
  const uniquePicks = React.useMemo(() => {
    const byId = new Map();
    allPicks.forEach((pl) => {
      const existing = byId.get(pl.id);
      if (existing) {
        existing.owners.push(pl.owner);
      } else {
        byId.set(pl.id, { ...pl, owners: [pl.owner] });
      }
    });
    return Array.from(byId.values());
  }, [participants]);

  // Initialize points data from all players
  React.useEffect(() => {
    const initialized = {};
    uniquePicks.forEach(pl => {
      initialized[pl.id] = 0;
    });
    setPointsData(initialized);
  }, []);

  const handlePointsChange = (playerId, value) => {
    setPointsData(prev => ({
      ...prev,
      [playerId]: Math.max(0, parseInt(value) || 0)
    }));
  };

  const handleSavePoints = async () => {
    if (!auctionResultId) {
      alert("Auction ID not available. Cannot save points.");
      return;
    }

    const pointsArray = uniquePicks
      .filter(pl => pointsData[pl.id] > 0)
      .map(pl => ({
        playerId: pl.id,
        playerName: pl.name,
        pointsAwarded: pointsData[pl.id]
      }));

    if (pointsArray.length === 0) {
      alert("Please enter points for at least one player.");
      return;
    }

    setSavingPoints(true);
    try {
      await apiSaveAuctionPoints(auctionResultId, pointsArray, user?.token);
      trackEvent("points_saved", { playerCount: pointsArray.length });
      alert("Points saved successfully!");
      onRefresh && onRefresh();
    } catch (err) {
      alert("Failed to save points: " + err.message);
    } finally {
      setSavingPoints(false);
    }
  };

  // Goals are auto-synced: every edit updates the local table immediately, then persists to the
  // backend shortly after (debounced) so the points/GD table stays in sync without extra clicks.
  const handleFixtureGoalChange = (groupLabel, fixtureId, side, rawValue) => {
    const value = rawValue === "" ? null : Math.max(0, parseInt(rawValue, 10) || 0);
    setFixturesState((prev) => {
      const next = {
        ...prev,
        [groupLabel]: (prev[groupLabel] || []).map((f) => f.id === fixtureId
          ? { ...f, [side === "home" ? "homeGoals" : "awayGoals"]: value }
          : f
        ),
      };

      if (auctionResultId) {
        setSavingFixtureId(fixtureId);
        if (saveFixturesTimerRef.current) clearTimeout(saveFixturesTimerRef.current);
        saveFixturesTimerRef.current = setTimeout(async () => {
          try {
            await apiSaveFixtures(auctionResultId, { ...next, _knockout: knockoutScores }, user?.token);
            trackEvent("fixture_goal_entered", { group: groupLabel });
          } catch (err) {
            // Silently retry on next edit — the local table already reflects the change.
          } finally {
            setSavingFixtureId("");
          }
        }, 500);
      }

      return next;
    });
  };

  return React.createElement("div", { style:{ minHeight:"100vh", background:"#04060a", color:"#fff" } },
    React.createElement(SquadAnalyser, {
      participants,
      wishlists,
      players,
      tiers,
      selectedName,
      onClose: () => setAnalyserOpen(false),
      hidden: !analyserOpen,
    }),
    React.createElement("div", { style:{ maxWidth:960, margin:"0 auto", padding:"36px 20px" } },
      React.createElement("div", { style:{ textAlign:"center", marginBottom:26, animation:"fadeUp .5s ease" } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:64, color:"#FFD700",
          letterSpacing:6, textShadow:"0 0 50px #FFD70055" } }, "DRAFT COMPLETE"),
        React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:14, color:"#555", letterSpacing:2 } },
          `${players.length} players · ${participants.length} teams · GL HF ⚽`)
      ),
      React.createElement("div", { style:{ display:"flex", gap:8, justifyContent:"center", marginBottom:22, flexWrap:"wrap" } },
        [...(groupsEnabled ? ["groups"] : []), "squads","history","points"].map(v =>
          React.createElement("button", { key:v, onClick: () => setView(v), style:{
            background: view===v ? "#FFD700" : "#0d0f16", color: view===v ? "#000" : "#888",
            border:`1px solid ${view===v ? "#FFD700" : "#1e2028"}`,
            borderRadius:8, padding:"7px 18px", cursor:"pointer",
            fontFamily:"'Bebas Neue'", fontSize:14, letterSpacing:1
          }}, v==="groups" ? "🏆 GROUPS" : v==="squads" ? "SQUADS" : v==="history" ? "ALL PICKS" : "🏆 POINTS")
        ),
        React.createElement("button", { onClick: () => setAnalyserOpen(true), style:{
          background:"#FFD70018", color:"#FFD700", border:"1px solid #FFD70044",
          borderRadius:8, padding:"7px 18px", cursor:"pointer",
          fontFamily:"'Bebas Neue'", fontSize:14, letterSpacing:1
        }}, "📊 ANALYSER")
      ),

      view==="groups" && React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:26 } },
        Object.entries(groups).length === 0
          ? React.createElement("div", { style:{ textAlign:"center", padding:"40px 0", color:"#333",
              fontFamily:"'Rajdhani'", fontSize:15 } }, "No groups configured for this auction")
          : React.createElement(React.Fragment, null,
              // ── Group tables + fixtures ──
              Object.entries(groups).map(([label, teams]) => {
                const groupFixtures = fixturesState[label] || [];
                const table = computeGroupTable(teams, groupFixtures);
                return React.createElement("div", { key:label, style:{ background:"#0a0c12", border:"1px solid #1e2230", borderRadius:12, padding:18 } },
                  React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#4FC3F7", letterSpacing:2, marginBottom:12 } }, `GROUP ${label}`),
                  // Table (top)
                  React.createElement("div", { style:{ marginBottom:16 } },
                    React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:2, marginBottom:8 } }, "TABLE"),
                    React.createElement("table", { style:{ width:"100%", borderCollapse:"collapse" } },
                      React.createElement("thead", null,
                        React.createElement("tr", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#555" } },
                          ["TEAM","P","W","D","L","GD","PTS"].map(h =>
                            React.createElement("th", { key:h, style:{ textAlign: h==="TEAM" ? "left" : "center", padding:"3px 4px" } }, h)
                          )
                        )
                      ),
                      React.createElement("tbody", null,
                        table.map((row, i) =>
                          React.createElement("tr", { key:row.name, style:{
                            background: i===0 ? "#FFD70012" : i===1 ? "#4FC3F70a" : "transparent",
                            fontFamily:"'Rajdhani'", fontSize:12, color:"#ccc"
                          }},
                            React.createElement("td", { style:{ padding:"5px 4px", fontWeight:700, color: i===0 ? "#FFD700" : i===1 ? "#4FC3F7" : "#ccc" } },
                              `${i+1}. ${row.name}`),
                            React.createElement("td", { style:{ textAlign:"center" } }, row.played),
                            React.createElement("td", { style:{ textAlign:"center" } }, row.won),
                            React.createElement("td", { style:{ textAlign:"center" } }, row.drawn),
                            React.createElement("td", { style:{ textAlign:"center" } }, row.lost),
                            React.createElement("td", { style:{ textAlign:"center" } }, row.gd > 0 ? `+${row.gd}` : row.gd),
                            React.createElement("td", { style:{ textAlign:"center", fontWeight:700, color:"#FFD700" } }, row.points)
                          )
                        )
                      )
                    )
                  ),
                  // Fixtures (below table)
                  React.createElement("div", null,
                    React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:2, marginBottom:8 } }, "FIXTURES"),
                    React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:6 } },
                      groupFixtures.map((f) =>
                        React.createElement("div", { key:f.id, style:{
                          display:"grid", gridTemplateColumns:"1fr 40px 14px 40px 1fr", alignItems:"center", gap:6,
                          background:"#0d0f16", borderRadius:7, padding:"6px 10px"
                        }},
                          React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:12, color:"#ccc", textAlign:"right", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" } }, f.home),
                          React.createElement("input", {
                            type:"number", min:0, value: f.homeGoals ?? "",
                            onChange: (e) => handleFixtureGoalChange(label, f.id, "home", e.target.value),
                            style:{ width:40, background:"#05070d", border:"1px solid #1e2028", borderRadius:5,
                              color:"#FFD700", fontFamily:"'Bebas Neue'", fontSize:13, textAlign:"center", padding:"3px 0" }
                          }),
                          React.createElement("span", { style:{ color:"#444", textAlign:"center", fontSize:11 } }, "–"),
                          React.createElement("input", {
                            type:"number", min:0, value: f.awayGoals ?? "",
                            onChange: (e) => handleFixtureGoalChange(label, f.id, "away", e.target.value),
                            style:{ width:40, background:"#05070d", border:"1px solid #1e2028", borderRadius:5,
                              color:"#FFD700", fontFamily:"'Bebas Neue'", fontSize:13, textAlign:"center", padding:"3px 0" }
                          }),
                          React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:12, color:"#ccc", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" } }, f.away)
                        )
                      ),
                      savingFixtureId && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#FFD700" } }, "⏳ Syncing…")
                    )
                  )
                );
              }),

              // ── Knockout Bracket ──
              Object.keys(groups).length >= 2 && React.createElement(KnockoutBracket, {
                groups,
                fixturesState,
                knockoutScores,
                onScoreChange: (matchId, side, value) => {
                  setKnockoutScores(prev => {
                    const next = {
                      ...prev,
                      [matchId]: { ...(prev[matchId] || {}), [side]: value === "" ? null : Math.max(0, Number(value) || 0) }
                    };
                    // Debounce-save to backend so other users see updates
                    if (auctionResultId && user?.token) {
                      if (knockoutSaveTimerRef.current) clearTimeout(knockoutSaveTimerRef.current);
                      knockoutSaveTimerRef.current = setTimeout(async () => {
                        try {
                          await apiSaveFixtures(auctionResultId, { ...fixturesState, _knockout: next }, user.token);
                        } catch (_) {}
                      }, 600);
                    }
                    return next;
                  });
                },
              })
            )
      ),

      view==="squads" && React.createElement("div", { style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 } },
        [...participants].sort((a,b) => b.squad.length-a.squad.length).map((p, i) => {
          const valid = p.squad.length>=SQUAD_MIN && p.squad.length<=SQUAD_MAX;
          const spent = BUDGET - p.budget;
          return React.createElement("div", { key:i, style:{
            background:"#0a0c12", border:`1px solid ${PCOLORS[i]}33`,
            borderRadius:14, padding:16, boxShadow:`0 0 16px ${PCOLORS[i]}08`
          } },
            React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 } },
              React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:PCOLORS[i] } }, p.name),
              React.createElement("div", { style:{ display:"flex", gap:5, alignItems:"center" } },
                React.createElement("span", { style:{
                  fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
                  color: valid?"#00FF88":"#FF3D71",
                  background: valid?"#00FF8814":"#FF3D7114",
                  border:`1px solid ${valid?"#00FF8833":"#FF3D7133"}`,
                  borderRadius:4, padding:"2px 6px"
                }}, `${p.squad.length}p ${valid?"✓":"⚠"}`),
                React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555" } }, `${spent}M`)
              )
            ),
            React.createElement("div", { style:{ marginBottom:10 } },
              React.createElement("button", {
                onClick: () => downloadSquadImage(p, { formation: "4-3-3", tiers }),
                style:{
                  background:"#0d0f16",
                  border:"1px solid #00FF8844",
                  borderRadius:6,
                  color:"#00FF88",
                  padding:"4px 10px",
                  cursor:"pointer",
                  fontFamily:"'Bebas Neue'",
                  fontSize:11,
                  letterSpacing:1
                }
              }, "DOWNLOAD SQUAD")
            ),
            React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:3 } },
              p.squad.sort((a,b) => b.rating-a.rating).map(pl => {
                const td = getTierData(pl.rating, tiers);
                return React.createElement("div", { key:pl.id, style:{
                  background:td.bg, border:`1px solid ${td.border}`, borderRadius:5, padding:"2px 6px",
                  fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700,
                  display:"flex", gap:4, alignItems:"center"
                }},
                  React.createElement("span", { style:{ color:td.color } }, pl.rating),
                  React.createElement("span", { style:{ color:"#ccc" } }, pl.name.split(" ").pop()),
                  React.createElement("span", { style:{ color:"#555", fontSize:9 } }, pl.pos)
                );
              })
            )
          );
        })
      ),

      view==="history" && React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:3 } },
        allPicks.sort((a,b) => b.rating-a.rating).map((pl, i) => {
          const td = getTierData(pl.rating, tiers);
          return React.createElement("div", { key:i, style:{
            display:"grid", gridTemplateColumns:"28px 32px 32px 1fr 110px 44px",
            alignItems:"center", gap:10, background:"#0a0c12", borderRadius:7, padding:"7px 12px",
            borderLeft:`3px solid ${td.color}`,
            animation:`rowIn .22s ease ${Math.min(i*.015,.5)}s both`
          }},
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", color:"#333", fontSize:12 } }, `#${i+1}`),
            React.createElement("span", { style:{ fontFamily:"'Bebas Neue'", fontSize:16, color:td.color } }, pl.rating),
            React.createElement("span", { style:{
              fontFamily:"'Rajdhani'", fontSize:9, fontWeight:700,
              color:PCOLORS[pl.ownerIdx], background:`${PCOLORS[pl.ownerIdx]}18`,
              borderRadius:3, textAlign:"center", padding:"2px 0"
            }}, pl.pos),
            React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:12, fontWeight:600, color:"#e0e0e0",
              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" } }, pl.name),
            React.createElement("span", { style:{ fontFamily:"'Exo 2'", fontSize:11, color:PCOLORS[pl.ownerIdx], fontWeight:700 } }, pl.owner),
            React.createElement("span", { style:{
              fontFamily:"'Rajdhani'", fontSize:10, color:td.color,
              background:td.bg, borderRadius:4, textAlign:"center", padding:"2px 0"
            }}, getTierKey(pl.rating, tiers))
          );
        })
      ),

      view==="points" && React.createElement("div", { style:{ maxWidth:800, margin:"0 auto" } },
        React.createElement("div", { style:{ marginBottom:20 } },
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:24, color:"#FFD700", letterSpacing:2, marginBottom:10 } }, "AWARD POINTS TO PLAYERS"),
          React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:13, color:"#555" } }, "Enter the championship points for each player. The player with the highest total wins the tournament!")
        ),
        React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
          uniquePicks.sort((a,b) => b.rating-a.rating).map(pl => {
            const td = getTierData(pl.rating, tiers);
            return React.createElement("div", { key:pl.id, style:{
              background:"#0a0c12", border:`1px solid ${td.border}33`, borderRadius:10, padding:14,
              display:"flex", alignItems:"center", justifyContent:"space-between"
            } },
              React.createElement("div", { style:{ minWidth:0, flex:1 } },
                React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:15, color:"#fff", marginBottom:2 } }, pl.name),
                React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#666" } },
                  `${pl.pos} · ${pl.rating} (${getTierKey(pl.rating, tiers)}) · ${pl.owners.join(", ")}`)
              ),
              React.createElement("input", {
                type:"number",
                min:0,
                max:999,
                value:pointsData[pl.id] || 0,
                onChange: (e) => handlePointsChange(pl.id, e.target.value),
                style:{
                  background:"#05070d", border:`1px solid ${td.border}`, borderRadius:6, color:td.color,
                  fontFamily:"'Bebas Neue'", fontSize:18, fontWeight:700,
                  width:60, height:40, textAlign:"center", padding:0,
                  cursor:"pointer"
                }
              })
            );
          })
        ),
        React.createElement("div", { style:{ display:"flex", gap:12, marginTop:24 } },
          React.createElement("button", {
            onClick: () => setView("squads"),
            style:{
              flex:1, background:"#0d0f16", color:"#888", border:"1px solid #1e2028",
              borderRadius:8, padding:10, cursor:"pointer",
              fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:1
            }
          }, "CANCEL"),
          React.createElement("button", {
            onClick: handleSavePoints,
            disabled: savingPoints,
            style:{
              flex:1, background:"#FFD700", color:"#000", border:"none",
              borderRadius:8, padding:10, cursor:"pointer",
              fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:1,
              opacity: savingPoints ? 0.6 : 1
            }
          }, savingPoints ? "SAVING…" : "✓ SAVE POINTS")
        )
      )
    )
  );
}
