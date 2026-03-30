import React from "react";
import { sfx } from "../utils/sfx.js";
import { getTierData, getTierKey, TIERS, POS_GROUPS, getPosGroup } from "../game/constants.js";

export function PlayerRow({ player, onPick, owned, ownerName, ownerColor, cantAfford, isWishlist, onWishlist, tiers=TIERS, animDelay=0 }) {
  const td = getTierData(player.rating, tiers);
  const tk = getTierKey(player.rating, tiers);
  const pg = POS_GROUPS[getPosGroup(player.pos)];

  return React.createElement("div", {
    style: {
      display:"grid", gridTemplateColumns:"36px 38px 1fr 44px 50px 28px 88px",
      alignItems:"center", gap:8,
      padding:"7px 10px", borderRadius:7, marginBottom:3,
      background: owned ? "#08090d" : "#0d0f16",
      border:`1px solid ${owned ? "#111318" : cantAfford ? "#111" : td.border}`,
      opacity: owned ? .4 : cantAfford ? .45 : 1,
      animation:`rowIn .22s ease ${animDelay}s both`,
    }
  },
    React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:19, color:td.color, textAlign:"center", lineHeight:1 } }, player.rating),
    React.createElement("div", { style:{
      fontFamily:"'Rajdhani'", fontSize:10, fontWeight:700, color:pg.color,
      background:`${pg.color}18`, borderRadius:4, textAlign:"center", padding:"2px 0", letterSpacing:1
    }}, player.pos),
    React.createElement("div", { style:{ minWidth:0 } },
      React.createElement("div", { style:{ fontFamily:"'Exo 2'", fontSize:13, fontWeight:600,
        color: owned ? "#444" : "#ddd", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" } }, player.name),
      React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#444" } }, player.club),
    ),
    React.createElement("div", { style:{
      fontFamily:"'Bebas Neue'", fontSize:10, color:td.color,
      background:td.bg, border:`1px solid ${td.border}`,
      borderRadius:4, textAlign:"center", padding:"2px 4px"
    }}, tk),
    React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12, fontWeight:700, color:td.color, textAlign:"right" } },
      `${td.price}M`),
    React.createElement("button", {
      onClick: () => { sfx("wishlist"); onWishlist(player.id); },
      style: { background:"none", border:"none", cursor:"pointer", fontSize:14,
        color: isWishlist ? "#FF3D71" : "#333", padding:0 }
    }, isWishlist ? "❤️" : "🤍"),
    React.createElement("div", { style:{ textAlign:"right" } },
      owned
        ? React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:ownerColor, fontWeight:700 } }, `✓ ${ownerName}`)
        : cantAfford
          ? React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:10, color:"#333" } }, "can't afford")
          : onPick
            ? React.createElement("button", {
                onClick: () => onPick(player),
                style: { background:`linear-gradient(135deg,${td.color},${td.color}aa)`, color:"#000",
                  border:"none", borderRadius:6, padding:"4px 10px", fontSize:11, cursor:"pointer",
                  fontFamily:"'Bebas Neue'", letterSpacing:1 }
              }, "PICK")
            : React.createElement("span", { style:{ color:"#333", fontSize:12 } }, "—")
    )
  );
}
