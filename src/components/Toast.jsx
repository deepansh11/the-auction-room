import React from "react";

export function Toast({ msg, color }) {
  return React.createElement("div", {
    style: { position:"fixed", top:18, left:"50%", transform:"translateX(-50%)",
      background:"#0d0f14", border:`1.5px solid ${color}`, borderRadius:10,
      padding:"9px 22px", zIndex:9998, fontFamily:"'Bebas Neue'", fontSize:18,
      color, letterSpacing:2, boxShadow:`0 0 20px ${color}44`,
      animation:"toastDrop .3s ease both", whiteSpace:"nowrap" }
  }, msg);
}
