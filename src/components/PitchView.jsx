import React from "react";
import { FORMATIONS, CAN_FILL, TIERS, getTierData } from "../game/constants.js";

// Scales a player's pitch-node diameter by their overall rating so star players visually stand out.
function ratingToNodeSize(rating) {
  const r = Number(rating) || 60;
  return Math.max(34, Math.min(64, 32 + (r - 60) * 0.72));
}

/**
 * @param {boolean} interactive - when true, slots and bench chips become drag-and-drop targets/sources.
 * @param {Record<string, number>} assignments - slotKey -> playerId, manual overrides that win over auto-fill.
 * @param {(slotKey: string, playerId: number) => void} onAssign
 * @param {(playerId: number) => void} onUnassign - called when a player is dropped back onto the bench.
 */
export function PitchView({ squad, formation, tiers = TIERS, interactive = false, assignments = {}, benchPinnedIds = new Set(), onAssign, onUnassign }) {
  const rows = FORMATIONS[formation] || FORMATIONS["4-3-3"];
  const allSlots = rows.flat();
  const usedIds = new Set();
  const squadById = new Map(squad.map((p) => [p.id, p]));

  // Manual assignments win first (if the player is still in the squad and not already placed elsewhere).
  const manualBySlot = {};
  allSlots.forEach((_, i) => {
    const slotKey = String(i);
    const playerId = assignments[slotKey];
    const player = playerId != null ? squadById.get(playerId) : null;
    if (player && !usedIds.has(player.id)) {
      manualBySlot[slotKey] = player;
      usedIds.add(player.id);
    }
  });

  const assigned = allSlots.map((slot, i) => {
    const slotKey = String(i);
    if (manualBySlot[slotKey]) return { slot, slotKey, player: manualBySlot[slotKey] };
    const compat = CAN_FILL[slot] || [slot];
    const best = squad
      .filter((p) => !usedIds.has(p.id) && compat.includes(p.pos) && !benchPinnedIds.has(p.id))
      .sort((a, b) => b.rating - a.rating)[0];
    if (best) usedIds.add(best.id);
    return { slot, slotKey, player: best || null };
  });

  const bench = squad.filter((p) => !usedIds.has(p.id));
  const missing = assigned.filter((a) => !a.player);

  let idx = 0;
  const pitchRows = rows.map((row) => row.map(() => assigned[idx++])).reverse();

  const handleDragStart = (playerId) => (e) => {
    if (!interactive) return;
    e.dataTransfer.setData("text/plain", String(playerId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleSlotDrop = (slotKey) => (e) => {
    if (!interactive) return;
    e.preventDefault();
    const playerId = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isFinite(playerId)) onAssign?.(slotKey, playerId);
  };

  const handleBenchDrop = (e) => {
    if (!interactive) return;
    e.preventDefault();
    const playerId = Number(e.dataTransfer.getData("text/plain"));
    if (Number.isFinite(playerId)) onUnassign?.(playerId);
  };

  const Node = ({ slot, slotKey, player }) => {
    const td = player ? getTierData(player.rating, tiers) : null;
    const size = player ? ratingToNodeSize(player.rating) : 40;
    return React.createElement("div", {
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 54 },
      onDragOver: interactive ? (e) => e.preventDefault() : undefined,
      onDrop: interactive ? handleSlotDrop(slotKey) : undefined,
    },
      React.createElement("div", {
        draggable: Boolean(interactive && player),
        onDragStart: player ? handleDragStart(player.id) : undefined,
        style: {
          width: size, height: size, borderRadius: "50%",
          background: player ? `radial-gradient(circle,${td.color}28,#0a1a0a)` : "#0a140a",
          border: `2px solid ${player ? td.color : "#1e3020"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: player ? `0 0 10px ${td.color}44` : "none",
          cursor: interactive && player ? "grab" : "default",
          transition: "width .2s, height .2s",
          flexShrink: 0,
        }
      }, player
        ? React.createElement("span", { style: { fontFamily: "'Bebas Neue'", fontSize: size > 48 ? 16 : 14, color: td.color } }, player.rating)
        : React.createElement("span", { style: { fontSize: 10, color: "#2a3a2a" } }, slot)
      ),
      React.createElement("span", {
        style: {
          fontFamily: "'Rajdhani'", fontSize: 8, fontWeight: 700,
          color: player ? "#bbb" : "#2a3a2a", textAlign: "center",
          maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
        }
      }, player ? player.name.split(" ").pop() : slot)
    );
  };

  return React.createElement("div", null,
    React.createElement("div", {
      style: {
        background: "linear-gradient(180deg,#071507 0%,#0d2a10 50%,#071507 100%)",
        borderRadius: 10, border: "1px solid #1a3520", padding: "12px 6px",
        position: "relative", overflow: "hidden",
      }
    },
      React.createElement("div", {
        style: {
          position: "absolute", inset: 0, opacity: .05,
          backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)",
          backgroundSize: "36px 36px", pointerEvents: "none"
        }
      }),
      React.createElement("div", {
        style: {
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          width: 64, height: 64, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,.05)", pointerEvents: "none"
        }
      }),
      pitchRows.map((row, ri) =>
        React.createElement("div", {
          key: ri, style: {
            display: "flex", justifyContent: "center", gap: 4,
            marginBottom: ri < pitchRows.length - 1 ? 6 : 0
          }
        },
          row.map((a, si) => React.createElement(Node, { key: si, ...a }))
        )
      )
    ),
    interactive && React.createElement("div", {
      style: { fontFamily: "'Rajdhani'", fontSize: 10, color: "#3a4a3a", marginTop: 6, textAlign: "center" }
    }, "Drag a player onto a slot to place them — drag onto the bench to remove"),
    // Bench: always shown in interactive mode (empty bench is still a valid drop target)
    (interactive || bench.length > 0) && React.createElement("div", {
      style: {
        marginTop: 10,
        border: interactive ? "1px dashed #1e3020" : "none",
        borderRadius: 7, padding: interactive ? "6px 8px" : 0,
        background: interactive && bench.length === 0 ? "#0a120a" : "transparent",
        transition: "background .2s",
      },
      onDragOver: interactive ? (e) => { e.preventDefault(); e.currentTarget.style.background = "#0d1e0d"; } : undefined,
      onDragLeave: interactive ? (e) => { e.currentTarget.style.background = bench.length === 0 ? "#0a120a" : "transparent"; } : undefined,
      onDrop: interactive ? (e) => { e.currentTarget.style.background = bench.length === 0 ? "#0a120a" : "transparent"; handleBenchDrop(e); } : undefined,
    },
      React.createElement("div", { style: { fontFamily: "'Bebas Neue'", fontSize: 10, color: "#444", letterSpacing: 2, marginBottom: bench.length > 0 ? 5 : 0 } },
        bench.length > 0 ? `BENCH (${bench.length})` : interactive ? "BENCH — drop here to unassign" : ""
      ),
      bench.length > 0 && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4 } },
        bench.map(p => {
          const td = getTierData(p.rating, tiers);
          return React.createElement("div", {
            key: p.id,
            draggable: interactive,
            onDragStart: handleDragStart(p.id),
            style: {
              background: td.bg, border: `1px solid ${td.border}`,
              borderRadius: 5, padding: "3px 8px",
              fontFamily: "'Rajdhani'", fontSize: 10, fontWeight: 700,
              display: "flex", gap: 4, alignItems: "center",
              cursor: interactive ? "grab" : "default",
            }
          },
            React.createElement("span", { style: { color: td.color } }, p.rating),
            React.createElement("span", { style: { color: "#ccc" } }, p.name.split(" ").pop()),
            React.createElement("span", { style: { color: "#555", fontSize: 9 } }, p.pos)
          );
        })
      )
    )
  );
}
