import React from "react";
import { FifaPlayerCard } from "./FifaPlayerCard.jsx";
import { BTN } from "../utils/styles.js";
import { getTierData, getTierKey } from "../game/constants.js";

const SCRATCH_REVEAL_THRESHOLD = 0.5; // fraction of the overlay that must be cleared to auto-reveal

// FIFA-style gold card art: shield border, player silhouette, "?" mark, rays and sparkles.
function MysteryCardArt({ available, used }) {
  // FIFA shield path variants (outer → inner gap → second ring → fill)
  const pOuter = "M20,4 L70,4 Q80,2 90,4 L140,4 Q156,4 156,20 L156,172 Q156,186 142,193 L80,202 L18,193 Q4,186 4,172 L4,20 Q4,4 20,4Z";
  const pGap   = "M22,7 L70,7 Q80,5 90,7 L138,7 Q152,7 152,22 L152,171 Q152,184 139,191 L80,199 L21,191 Q8,184 8,171 L8,22 Q8,7 22,7Z";
  const pRing  = "M23,9 L70,9 Q80,7 90,9 L137,9 Q150,9 150,23 L150,170 Q150,183 138,190 L80,197 L22,190 Q10,183 10,170 L10,23 Q10,9 23,9Z";
  const pFill  = "M25,11 L70,11 Q80,9 90,11 L135,11 Q148,11 148,24 L148,168 Q148,181 136,188 L80,196 L24,188 Q12,181 12,168 L12,24 Q12,11 25,11Z";

  const rays = Array.from({ length: 20 }, (_, i) => {
    const a = (i * 18 - 90) * Math.PI / 180;
    const bold = i % 5 === 0;
    return React.createElement("line", {
      key: "r" + i, x1: 80, y1: 106,
      x2: Math.round(80 + Math.cos(a) * 130),
      y2: Math.round(106 + Math.sin(a) * 130),
      stroke: "#FFD700", strokeWidth: bold ? 1.4 : 0.5,
      opacity: bold ? 0.25 : 0.1,
    });
  });

  const sparklePos = [[22,28],[138,33],[15,88],[145,82],[20,152],[140,148],[55,18],[108,20],[38,174],[122,171],[80,22],[60,170],[100,168]];
  const sparkles = sparklePos.map(([x, y], i) =>
    React.createElement("g", { key: "sp" + i },
      React.createElement("circle", { cx: x, cy: y, r: 1.3, fill: "#FFD700", opacity: 0.9 }),
      React.createElement("line", { x1: x-4, y1: y,   x2: x+4, y2: y,   stroke: "#FFD700", strokeWidth: 0.6, opacity: 0.75 }),
      React.createElement("line", { x1: x,   y1: y-4, x2: x,   y2: y+4, stroke: "#FFD700", strokeWidth: 0.6, opacity: 0.75 }),
      React.createElement("line", { x1: x-2.5, y1: y-2.5, x2: x+2.5, y2: y+2.5, stroke: "#FFD700", strokeWidth: 0.4, opacity: 0.5 }),
      React.createElement("line", { x1: x+2.5, y1: y-2.5, x2: x-2.5, y2: y+2.5, stroke: "#FFD700", strokeWidth: 0.4, opacity: 0.5 })
    )
  );

  return React.createElement("svg", {
    viewBox: "0 0 160 202",
    style: {
      width: "100%", display: "block",
      filter: available
        ? "drop-shadow(0 0 10px #FFD700bb) drop-shadow(0 0 22px #FFA50066)"
        : "drop-shadow(0 0 3px #33280011)",
      opacity: used ? 0.45 : 1,
    },
  },
    React.createElement("defs", null,
      React.createElement("radialGradient", { id: "mca-bg", cx: "50%", cy: "44%", r: "65%" },
        React.createElement("stop", { offset: "0%", stopColor: "#1e1600" }),
        React.createElement("stop", { offset: "55%", stopColor: "#090700" }),
        React.createElement("stop", { offset: "100%", stopColor: "#000" })
      ),
      React.createElement("radialGradient", { id: "mca-ray", cx: "50%", cy: "53%", r: "56%" },
        React.createElement("stop", { offset: "0%", stopColor: "#FFD700", stopOpacity: "0.32" }),
        React.createElement("stop", { offset: "100%", stopColor: "#FFD700", stopOpacity: "0" })
      ),
      React.createElement("linearGradient", { id: "mca-bord", x1: "0%", y1: "0%", x2: "100%", y2: "100%" },
        React.createElement("stop", { offset: "0%",  stopColor: "#FFE566" }),
        React.createElement("stop", { offset: "50%", stopColor: "#A86000" }),
        React.createElement("stop", { offset: "100%",stopColor: "#FFD700" })
      ),
      React.createElement("clipPath", { id: "mca-clip" },
        React.createElement("path", { d: pFill })
      )
    ),
    // Triple-line gold border
    React.createElement("path", { d: pOuter, fill: "url(#mca-bord)" }),
    React.createElement("path", { d: pGap,   fill: "#030200" }),
    React.createElement("path", { d: pRing,  fill: "none", stroke: "#FFD700", strokeWidth: 1.5 }),
    React.createElement("path", { d: pFill,  fill: "url(#mca-bg)" }),

    // Interior (clipped to card fill shape)
    React.createElement("g", { clipPath: "url(#mca-clip)" },
      // Ambient glow
      React.createElement("rect", { x: 12, y: 11, width: 136, height: 185, fill: "url(#mca-ray)" }),
      // Rays
      ...rays,
      // Geometric crack lines
      React.createElement("line", { x1: 35, y1: 18, x2: 128, y2: 80, stroke: "#FFD700", strokeWidth: 0.5, opacity: 0.2 }),
      React.createElement("line", { x1: 125,y1: 18, x2:  32, y2: 80, stroke: "#FFD700", strokeWidth: 0.5, opacity: 0.2 }),
      React.createElement("line", { x1: 16, y1: 92, x2:  80, y2: 30, stroke: "#FFD700", strokeWidth: 0.4, opacity: 0.14 }),
      React.createElement("line", { x1: 144,y1: 92, x2:  80, y2: 30, stroke: "#FFD700", strokeWidth: 0.4, opacity: 0.14 }),
      React.createElement("line", { x1: 20, y1:148, x2:  56,y2: 183, stroke: "#FFD700", strokeWidth: 0.4, opacity: 0.12 }),
      React.createElement("line", { x1: 140,y1:148, x2: 104,y2: 183, stroke: "#FFD700", strokeWidth: 0.4, opacity: 0.12 }),
      // Sparkles
      ...sparkles,
      // ── Player image (covers inner card area, aspect-fitted) ──
      React.createElement("image", {
        href: "/mystery-player.png",
        x: 12, y: 11, width: 136, height: 185,
        preserveAspectRatio: "xMidYMid meet",
        opacity: used ? 0.4 : 1,
      }),
    )
  );
}

/**
 * Persistent mystery card widget in the bidding sidebar.
 * Shows as a full card; clicking it (when available) opens the disclaimer → scratch modal.
 */
export function MysteryCard({ available, used, revealedPlayer, price, hasPool, affordable, squadHasRoom, onClick }) {
  const statusText = used
    ? (revealedPlayer ? `Revealed: ${revealedPlayer.name}` : "Already used this auction")
    : !hasPool
      ? "No candidates reserved for you"
      : !squadHasRoom
        ? "Squad is full"
        : !affordable
          ? `Need ${price}M free budget`
          : null;

  return React.createElement("div", null,
    React.createElement("style", null, `
      @keyframes mcGlow {
        0%, 100% { box-shadow: 0 0 14px #FFD70044, 0 2px 24px #FFA50022; border-color:#FFD70066; }
        50%       { box-shadow: 0 0 28px #FFD700aa, 0 2px 36px #FFA50044; border-color:#FFD700cc; }
      }
      @keyframes mcShimmer {
        0%   { transform: translateX(-160%) skewX(-20deg); }
        100% { transform: translateX(260%)  skewX(-20deg); }
      }
      @keyframes mcPulse {
        0%, 100% { transform: scale(1); }
        50%       { transform: scale(1.04); }
      }
    `),
    React.createElement("button", {
      type: "button",
      onClick: available ? onClick : undefined,
      disabled: !available,
      style: {
        width: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
        background: used
          ? "linear-gradient(160deg,#0d0d0d,#0a0c12)"
          : "linear-gradient(160deg,#1a1200,#110d00 55%,#0a0c12)",
        border: `1px solid ${available ? "#FFD70077" : used ? "#2a2200" : "#1e2028"}`,
        borderRadius: 14,
        padding: "10px 8px 8px",
        cursor: available ? "pointer" : "default",
        textAlign: "center",
        animation: available ? "mcGlow 2.2s ease-in-out infinite" : "none",
        opacity: used ? 0.7 : 1,
      },
    },
      available && React.createElement("div", {
        style: {
          position: "absolute", top: 0, left: 0, width: "35%", height: "100%",
          background: "linear-gradient(90deg, transparent, #FFD70015, transparent)",
          animation: "mcShimmer 2.8s ease-in-out infinite",
          pointerEvents: "none",
        },
      }),
      React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10, width: "100%" },
      },
        React.createElement("div", {
          style: {
            flex: 1, fontFamily: "'Bebas Neue'", fontSize: 13, letterSpacing: 2,
            color: used ? "#555" : "#FFD700", textAlign: "left",
          },
        }, "MYSTERY CARD"),
        React.createElement("span", {
          style: {
            fontFamily: "'Bebas Neue'", fontSize: 12, color: "#FFD700",
            background: "#FFD70018", border: "1px solid #FFD70044",
            borderRadius: 5, padding: "2px 7px",
          },
        }, `${price}M`)
      ),
      React.createElement("div", {
        style: {
          width: "100%", display: "flex", justifyContent: "center", marginBottom: 8,
          animation: available ? "mcPulse 2.2s ease-in-out infinite" : "none",
        },
      },
        React.createElement("div", { style: { width: 116, flexShrink: 0 } },
          React.createElement(MysteryCardArt, { available, used })
        )
      ),
      available
        ? React.createElement("div", {
            style: {
              fontFamily: "'Bebas Neue'", fontSize: 12, letterSpacing: 2,
              color: "#000", background: "linear-gradient(135deg,#FFD700,#FFA500)",
              borderRadius: 6, padding: "4px 12px", width: "100%",
            },
          }, "TAP TO REVEAL")
        : React.createElement("div", {
            style: {
              fontFamily: "'Rajdhani'", fontSize: 10, color: "#666",
              textAlign: "center", lineHeight: 1.4, width: "100%",
            },
          }, statusText || "")
    )
  );
}

// Canvas-based scratch layer. Sits absolutely positioned over the hidden card preview and
// erases itself (destination-out) as the user drags across it, revealing the DOM underneath.
function ScratchLayer({ width, height, disabled, onRevealed }) {
  const canvasRef = React.useRef(null);
  const drawingRef = React.useRef(false);
  const revealedRef = React.useRef(false);
  const [cleared, setCleared] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // Black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // Subtle gold diagonal lines
    ctx.strokeStyle = "#FFD70018";
    ctx.lineWidth = 1;
    for (let x = -height; x < width + height; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }

    // Centre radial gold glow
    const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width * 0.5);
    glow.addColorStop(0, "rgba(255,215,0,0.18)");
    glow.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    // Golden "SCRATCH TO REVEAL" text
    ctx.shadowColor = "#FFD700";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 15px 'Bebas Neue', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCRATCH TO REVEAL", width / 2, height / 2 + 6);
    ctx.shadowBlur = 0;
  }, [width, height]);

  const scratchAt = (x, y) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();
  };

  const checkProgress = () => {
    if (revealedRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clearedPx = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 37) {
      total += 1;
      if (data[i] === 0) clearedPx += 1;
    }
    if (total > 0 && clearedPx / total >= SCRATCH_REVEAL_THRESHOLD) {
      revealedRef.current = true;
      setCleared(true);
      onRevealed?.();
    }
  };

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  if (disabled) return null;

  return React.createElement("canvas", {
    ref: canvasRef,
    style: {
      position: "absolute", inset: 0, borderRadius: 14,
      touchAction: "none", cursor: "grab",
      opacity: cleared ? 0 : 1, transition: cleared ? "opacity .5s ease" : "none",
      pointerEvents: cleared ? "none" : "auto",
    },
    onPointerDown: (e) => { drawingRef.current = true; const { x, y } = pointFromEvent(e); scratchAt(x, y); checkProgress(); },
    onPointerMove: (e) => { if (!drawingRef.current) return; const { x, y } = pointFromEvent(e); scratchAt(x, y); checkProgress(); },
    onPointerUp: () => { drawingRef.current = false; },
    onPointerLeave: () => { drawingRef.current = false; },
  });
}

/**
 * Full-screen scratch-reveal modal. The real player card renders underneath from the start;
 * the canvas overlay hides it until the user scratches enough of it away.
 */
export function MysteryScratchModal({ player, tiers, price, revealing, onScratchComplete, onClose }) {
  const [revealed, setRevealed] = React.useState(false);
  const firedRef = React.useRef(false);

  const handleRevealed = () => {
    setRevealed(true);
    if (!firedRef.current) {
      firedRef.current = true;
      onScratchComplete?.();
    }
  };

  if (!player) {
    return React.createElement("div", {
      style: { position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
      onClick: onClose,
    },
      React.createElement("div", { style: { color: "#888", fontFamily: "'Rajdhani'" } }, "No mystery candidate available.")
    );
  }

  const tierData = getTierData(player.rating, tiers);
  const tierKey = getTierKey(player.rating, tiers);
  const cardWidth = 260;
  const cardHeight = 300;

  return React.createElement("div", {
    style: {
      position: "fixed", inset: 0, background: "#000000cc", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    },
  },
    React.createElement("div", {
      style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: "scaleIn .3s ease" },
      onClick: (e) => e.stopPropagation(),
    },
      React.createElement("div", {
        style: { fontFamily: "'Bebas Neue'", fontSize: 26, color: "#FFD700", letterSpacing: 3, textShadow: "0 0 24px #FFD70077" },
      }, revealed ? "PLAYER REVEALED!" : "MYSTERY CARD"),
      React.createElement("div", { style: { position: "relative", width: cardWidth, height: cardHeight } },
        React.createElement(FifaPlayerCard, { player, tierData, tierKey }),
        React.createElement(ScratchLayer, { width: cardWidth, height: cardHeight, disabled: revealed, onRevealed: handleRevealed })
      ),
      !revealed && React.createElement("div", {
        style: { fontFamily: "'Rajdhani'", fontSize: 12, color: "#999", textAlign: "center", maxWidth: 260 },
      }, `Scratch the card to reveal your player. Confirming spends a flat ${price}M, win or lose.`),
      revealed && React.createElement("div", {
        style: { fontFamily: "'Rajdhani'", fontSize: 12, color: revealing ? "#FFD700" : "#00FF88", fontWeight: 700 },
      }, revealing ? "⏳ Adding to your squad…" : `✅ Added to your squad for ${price}M`),
      React.createElement("button", {
        onClick: onClose,
        disabled: revealed && revealing,
        style: { ...BTN.ghost, opacity: revealed && revealing ? 0.6 : 1 },
      }, revealed ? "CLOSE" : "CANCEL")
    )
  );
}
