import React from "react";
import { loadPlayersFromCsv } from "../data/csvPlayerLoader.js";
import { BUDGET, MYSTERY_CARD_PRICE, TIERS, getTierKey, getPosGroup } from "../game/constants.js";
import { cloneTierConfig, normalizeTiers } from "../game/tierUtils.js";
import { generateRoomCode } from "../utils/roomUtils.js";
import { recommendedPlayerExclusions, validateAuctionSetup } from "../lib/setupValidation.js";
import { ShareScreen } from "./ShareScreen.jsx";
import { fixtureLegCount } from "../../backend/shared/fixtureLegs.js";
import "../styles/setup.css";

const PLAYERS_PER_PERSON = 26;
const PAGE_SIZE = 40;

export function SetupScreen({ user, onStart, onBackToDiscover }) {
  const [sessionName, setSessionName] = React.useState(`${user.username}'s Auction`);
  const [count, setCount] = React.useState(5);
  const [names, setNames] = React.useState(() => Array.from({ length: 5 }, (_, i) => i === 0 ? user.username : `Player ${i + 1}`));
  const [roomCode, setRoomCode] = React.useState(generateRoomCode);
  const [basePlayers, setBasePlayers] = React.useState([]);
  const [loadingPool, setLoadingPool] = React.useState(true);
  const [poolError, setPoolError] = React.useState("");
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [excludedIds, setExcludedIds] = React.useState(new Set());
  const [search, setSearch] = React.useState("");
  const [poolOpen, setPoolOpen] = React.useState(false);
  const [poolLimit, setPoolLimit] = React.useState(PAGE_SIZE);
  const [tierConfig, setTierConfig] = React.useState(() => cloneTierConfig(TIERS));
  const [budget, setBudget] = React.useState(String(BUDGET));
  const [mysteryEnabled, setMysteryEnabled] = React.useState(true);
  const [groupsEnabled, setGroupsEnabled] = React.useState(true);
  const [groupCount, setGroupCount] = React.useState(2);
  const [fixtureLeg, setFixtureLeg] = React.useState("single");
  const [sessionData, setSessionData] = React.useState(null);
  const [copyStatus, setCopyStatus] = React.useState("");
  const [creatingRoom, setCreatingRoom] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [showValidation, setShowValidation] = React.useState(false);
  const creatingRef = React.useRef(false);
  const copyTimer = React.useRef(null);
  const countRef = React.useRef(count);
  countRef.current = count;

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    return () => clearTimeout(copyTimer.current);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingPool(true);
    setPoolError("");
    loadPlayersFromCsv().then(players => {
      if (cancelled) return;
      setBasePlayers(players);
      setExcludedIds(recommendedPlayerExclusions(players, countRef.current));
    }).catch(() => {
      if (!cancelled) setPoolError("Could not load the player catalogue. Check your connection and try again.");
    }).finally(() => { if (!cancelled) setLoadingPool(false); });
    return () => { cancelled = true; };
  }, [loadAttempt]);

  React.useEffect(() => { setPoolLimit(PAGE_SIZE); }, [search]);
  const maxGroups = Math.max(1, Math.min(5, Math.floor(count / 2)));
  const updateCount = nextCount => {
    setCount(nextCount);
    setNames(previous => Array.from({ length: nextCount }, (_, index) => previous[index] || (index === 0 ? user.username : `Player ${index + 1}`)));
    setGroupCount(previous => Math.min(previous, Math.max(1, Math.min(5, Math.floor(nextCount / 2)))));
    setExcludedIds(recommendedPlayerExclusions(basePlayers, nextCount));
  };
  const sortedPlayers = React.useMemo(() => basePlayers.filter(player => player.rating >= 80).slice().sort((a, b) => b.rating - a.rating), [basePlayers]);
  const selectedPlayers = React.useMemo(() => sortedPlayers.filter(player => !excludedIds.has(player.id)), [sortedPlayers, excludedIds]);
  const filteredPlayers = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedPlayers.filter(player => !query || player.name.toLowerCase().includes(query) || player.pos.toLowerCase().includes(query));
  }, [sortedPlayers, search]);
  const normalizedTiers = React.useMemo(() => normalizeTiers(tierConfig), [tierConfig]);
  const tierStats = React.useMemo(() => {
    const counts = {};
    selectedPlayers.forEach(player => { const tier = getTierKey(player.rating, normalizedTiers); counts[tier] = (counts[tier] || 0) + 1; });
    return counts;
  }, [selectedPlayers, normalizedTiers]);
  const positionCounts = React.useMemo(() => {
    const counts = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    selectedPlayers.forEach(player => { counts[getPosGroup(player.pos)]++; });
    return counts;
  }, [selectedPlayers]);
  const validation = validateAuctionSetup({ name: sessionName, names, budget, players: selectedPlayers, tiers: normalizedTiers, host: user.username });
  const targetPoolSize = count * PLAYERS_PER_PERSON;
  const copyValue = async (value, label) => {
    try { await navigator.clipboard.writeText(value); setCopyStatus(`${label} copied`); }
    catch { setCopyStatus("Copy failed. You can select and copy the code manually."); }
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyStatus(""), 2400);
  };
  const updateTier = (key, field, value) => setTierConfig(previous => ({ ...previous, [key]: { ...previous[key], [field]: field === "color" ? value : Number(value) } }));
  const togglePlayer = id => setExcludedIds(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const createRoom = async event => {
    event.preventDefault();
    if (creatingRef.current || loadingPool || poolError) return;
    setShowValidation(true);
    if (validation.length) return;
    creatingRef.current = true;
    setCreatingRoom(true); setSubmitError("");
    try {
      // Only options/selections are submitted. Lot assignment and pick order remain server-owned.
      const persisted = await onStart({
        id: `session:${Date.now()}`, roomCode, name: sessionName.trim(), budgetPerBidder: Number(budget),
        tiers: normalizedTiers, selectedPlayers, participantNames: names.map(name => name.trim()),
        mysteryEnabled, groupsEnabled, groupCount, fixtureLeg,
      }, { deferNavigation: true });
      if (!persisted?.roomCode) throw new Error("Room creation did not return a room code. Please check before retrying.");
      setSessionData(persisted);
    } catch (error) { setSubmitError(error.message || "Could not create the room. Please try again."); }
    finally { creatingRef.current = false; setCreatingRoom(false); }
  };

  if (sessionData) return React.createElement(ShareScreen, {
    roomCode: sessionData.roomCode,
    onContinue: () => onStart(sessionData, { skipCreate: true }),
  });

  return React.createElement("main", { className: "setup-page" },
    React.createElement("header", { className: "setup-header" },
      React.createElement("div", null, React.createElement("h1", null, "New auction"), React.createElement("p", null, "Set up your room. Share the invitation after it’s created.")),
      onBackToDiscover && React.createElement("button", { type: "button", onClick: onBackToDiscover, disabled: creatingRoom }, "← Home")
    ),
    React.createElement("form", { onSubmit: createRoom, noValidate: true },
      React.createElement("fieldset", { disabled: creatingRoom, className: "setup-fields" },
        React.createElement("section", { className: "setup-card", "aria-labelledby": "setup-basics" },
          React.createElement("h2", { id: "setup-basics" }, "Room basics"),
          React.createElement("label", { className: "setup-field" }, "Auction name",
            React.createElement("input", { value: sessionName, maxLength: 120, onChange: event => setSessionName(event.target.value), autoComplete: "off" })),
          React.createElement("div", { className: "setup-grid" },
            React.createElement("label", { className: "setup-field" }, "Participants",
              React.createElement("select", { "aria-label": "Participants", value: count, onChange: event => updateCount(Number(event.target.value)) },
                Array.from({ length: 9 }, (_, i) => i + 2).map(number => React.createElement("option", { key: number, value: number }, `${number} participants`)))),
            React.createElement("label", { className: "setup-field" }, "Budget per participant (M)",
              React.createElement("input", { type: "number", min: 1, step: "any", inputMode: "decimal", value: budget, onChange: event => setBudget(event.target.value) }))
          ),
          React.createElement("p", { className: "setup-hint", style: { marginBottom: 0 } }, "You’ll host the room. Friends claim the open seats when they join with your code—no names needed now.")
        ),
        React.createElement("details", { className: "setup-card setup-options" },
          React.createElement("summary", null, "Game options", React.createElement("span", null, `${mysteryEnabled ? "Mystery Card on" : "Mystery Card off"} · ${groupsEnabled ? `${groupCount} ${groupCount === 1 ? "group" : "groups"}, ${fixtureLegCount(fixtureLeg)} ${fixtureLeg === "single" ? "leg" : "legs"}` : "No group stage"}`)),
          React.createElement("div", { className: "setup-option-content" },
            React.createElement("label", { className: "setup-check" }, React.createElement("input", { type: "checkbox", checked: mysteryEnabled, onChange: event => setMysteryEnabled(event.target.checked) }),
              React.createElement("span", null, "Enable Mystery Card", React.createElement("small", null, `One use per participant, for ${MYSTERY_CARD_PRICE}M. Eligible players are rated 87+ and are not goalkeepers.`))),
            React.createElement("label", { className: "setup-check" }, React.createElement("input", { type: "checkbox", checked: groupsEnabled, onChange: event => setGroupsEnabled(event.target.checked) }),
              React.createElement("span", null, "Create group-stage fixtures", React.createElement("small", null, "Random groups and round-robin matches for after the draft."))),
            groupsEnabled && React.createElement("div", { className: "setup-grid" },
              React.createElement("label", { className: "setup-field" }, "Number of groups", React.createElement("select", { "aria-label": "Number of groups", value: groupCount, onChange: event => setGroupCount(Number(event.target.value)) },
                Array.from({ length: maxGroups }, (_, index) => index + 1).map(number => React.createElement("option", { key: number, value: number }, `${number} ${number === 1 ? "group" : "groups"}`)))),
              React.createElement("label", { className: "setup-field" }, "Fixture legs", React.createElement("select", { "aria-label": "Fixture legs", value: fixtureLeg, onChange: event => setFixtureLeg(event.target.value) },
                React.createElement("option", { value: "single" }, "Single · one match per pair"), React.createElement("option", { value: "double" }, "Double · home and away"), React.createElement("option", { value: "triple" }, "Triple · three matches per pair")))
            ),
            groupsEnabled && React.createElement("p", { className: "setup-hint" }, `About ${Math.ceil(count / groupCount)} teams per group · ${fixtureLegCount(fixtureLeg)} ${fixtureLeg === "single" ? "match" : "matches"} per pairing. Extra fixtures balance uneven groups. Cup fixtures can be added later from Standings.`)
          )
        ),
        React.createElement("details", { className: "setup-card setup-options", onToggle: event => setPoolOpen(event.currentTarget.open) },
          React.createElement("summary", null, "Player pool", React.createElement("span", null, loadingPool ? "Loading catalogue…" : `${selectedPlayers.length} selected · ${count} lots`)),
          poolOpen && React.createElement("div", { className: "setup-option-content" },
            React.createElement("p", { className: "setup-hint" }, `Recommended: ${targetPoolSize} players (${PLAYERS_PER_PERSON} per participant), rated 80+. Changing participant count resets this selection.`),
            React.createElement("div", { className: "setup-actions" },
              React.createElement("button", { type: "button", onClick: () => setExcludedIds(recommendedPlayerExclusions(basePlayers, count)) }, "Use recommended pool"),
              React.createElement("button", { type: "button", onClick: () => setExcludedIds(new Set()) }, "Select all"),
              React.createElement("button", { type: "button", onClick: () => setExcludedIds(new Set(sortedPlayers.map(player => player.id))) }, "Clear selection")
            ),
            React.createElement("p", { className: "setup-hint" }, Object.entries(positionCounts).map(([key, value]) => `${key} ${value}`).join(" · ")),
            React.createElement("label", { className: "setup-field" }, "Search player pool", React.createElement("input", { type: "search", value: search, onChange: event => setSearch(event.target.value), placeholder: "Name or position" })),
            React.createElement("div", { className: "setup-pool", role: "group", "aria-label": "Player selection" },
              filteredPlayers.slice(0, poolLimit).map(player => React.createElement("label", { key: player.id, className: "setup-pool-row" },
                React.createElement("input", { type: "checkbox", checked: !excludedIds.has(player.id), onChange: () => togglePlayer(player.id), "aria-label": `Include ${player.name}` }),
                React.createElement("span", null, player.name), React.createElement("small", null, player.pos), React.createElement("strong", null, player.rating))),
              !filteredPlayers.length && React.createElement("p", { className: "setup-hint" }, "No players match your search.")
            ),
            filteredPlayers.length > poolLimit && React.createElement("button", { type: "button", onClick: () => setPoolLimit(limit => limit + PAGE_SIZE) }, `Show more (${filteredPlayers.length - poolLimit} remaining)`)
          )
        ),
        React.createElement("details", { className: "setup-card setup-options" },
          React.createElement("summary", null, "Tier prices", React.createElement("span", null, Object.entries(normalizedTiers).map(([key, tier]) => `${key} ${tier.price}M`).join(" · "))),
          React.createElement("div", { className: "setup-option-content" },
            React.createElement("p", { className: "setup-hint" }, "Rating ranges must not overlap. Every selected player needs a price tier."),
            React.createElement("div", { className: "setup-tier-grid" }, Object.entries(tierConfig).map(([key, tier]) =>
              React.createElement("fieldset", { key, className: "setup-tier" },
                React.createElement("legend", null, `${key} · ${tierStats[key] || 0} players`),
                React.createElement("div", { className: "setup-grid" },
                  [["min", "Min rating"], ["max", "Max rating"], ["price", "Price (M)"]].map(([field, label]) =>
                    React.createElement("label", { key: field, className: "setup-field" }, label,
                      React.createElement("input", { type: "number", min: field === "price" ? 1 : 0, max: field === "price" ? undefined : 100, value: tier[field], "aria-label": `${key} ${label}`, onChange: event => updateTier(key, field, event.target.value) }))),
                  React.createElement("label", { className: "setup-field" }, "Colour", React.createElement("input", { type: "color", value: tier.color, "aria-label": `${key} colour`, onChange: event => updateTier(key, "color", event.target.value) }))
                )
              )))
          )
        ),
        React.createElement("details", { className: "setup-card setup-options" },
          React.createElement("summary", null, "Invitation settings", React.createElement("span", null, `Room ${roomCode}`)),
          React.createElement("div", { className: "setup-option-content" },
            React.createElement("p", { className: "setup-hint" }, "The code becomes joinable after you create the room. You’ll get a sharing screen next."),
            React.createElement("code", { className: "setup-room-code" }, roomCode),
            React.createElement("div", { className: "setup-actions" },
              React.createElement("button", { type: "button", onClick: () => copyValue(roomCode, "Room code") }, "Copy code"),
              React.createElement("button", { type: "button", onClick: () => copyValue(`${window.location.origin}?join=${roomCode}`, "Invitation link") }, "Copy link"),
              React.createElement("button", { type: "button", onClick: () => { setRoomCode(generateRoomCode()); setCopyStatus(""); } }, "Generate new code")
            ),
            React.createElement("details", { className: "setup-seat-reservations" },
              React.createElement("summary", null, "Reserve seats by username (optional)"),
              React.createElement("p", { className: "setup-hint" }, "Normally, friends claim open seats after joining. Enter exact account usernames only if you want to reserve seats; leave “Player 2”, “Player 3”, etc. for open seats."),
              React.createElement("div", { className: "setup-names" }, names.map((name, index) =>
                React.createElement("label", { key: index, className: "setup-field" }, index === 0 ? "You · Host" : `Participant ${index + 1}`,
                  React.createElement("input", { value: name, readOnly: index === 0, maxLength: 40, autoComplete: "off", spellCheck: false,
                    onChange: event => setNames(previous => previous.map((entry, position) => position === index ? event.target.value : entry)) }))))
            ),
            copyStatus && React.createElement("p", { role: "status", className: "setup-hint" }, copyStatus)
          )
        )
      ),
      poolError && React.createElement("div", { className: "setup-error", role: "alert" }, poolError,
        React.createElement("button", { type: "button", onClick: () => setLoadAttempt(attempt => attempt + 1) }, "Try loading again")),
      showValidation && validation.length > 0 && React.createElement("div", { className: "setup-error", role: "alert" },
        React.createElement("strong", null, "Check your setup"), React.createElement("ul", null, validation.map(error => React.createElement("li", { key: error }, error)))),
      submitError && React.createElement("p", { className: "setup-error", role: "alert" }, submitError),
      React.createElement("footer", { className: "setup-create" },
        React.createElement("div", null, React.createElement("strong", null, `${count} participants · ${selectedPlayers.length} players`),
          React.createElement("p", { className: "setup-hint" }, `${budget || "—"}M per participant · ${count} lots`),
          !loadingPool && !poolError && selectedPlayers.length !== targetPoolSize && React.createElement("p", { className: "setup-hint" }, `Custom pool · recommended ${targetPoolSize} players`)),
        React.createElement("button", { className: "setup-primary", type: "submit", disabled: loadingPool || Boolean(poolError) || creatingRoom },
          creatingRoom ? "Creating room…" : loadingPool ? "Loading players…" : "Create room →")
      )
    )
  );
}
