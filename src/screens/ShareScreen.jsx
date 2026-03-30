import React from "react";
import { Toast } from "../components/Toast.jsx";
import { BTN } from "../utils/styles.js";
import { sfx } from "../utils/sfx.js";

export function ShareScreen({ roomCode, onContinue }) {
  const [toast, setToast] = React.useState(null);
  const baseUrl = window.location.origin;
  const shareLink = `${baseUrl}?join=${roomCode}`;

  const showToast = (msg, color="#FFD700") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2400);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      sfx("pick");
      showToast(`✓ ${label} copied!`, "#00FF88");
    }).catch(() => {
      showToast("Failed to copy", "#FF3D71");
    });
  };

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }
  },
    toast && React.createElement(Toast, toast),
    React.createElement("div", { style:{ width:"100%", maxWidth:500, animation:"fadeUp .5s ease", textAlign:"center" } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:60, color:"#FFD700", letterSpacing:5,
        textShadow:"0 0 50px #FFD70055", marginBottom:16 } }, "🎪"),
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:48, color:"#fff", letterSpacing:3, lineHeight:.9, marginBottom:24 } }, "SHARE\nYOUR ROOM"),
      React.createElement("p", { style:{ fontFamily:"'Rajdhani'", fontSize:14, color:"#666", marginBottom:28, lineHeight:1.6 } },
        "Share the room code or link with other players. They can join your auction once they're logged in."
      ),

      React.createElement("div", { style:{ background:"#0a0c12", border:"1px solid #1e2230", borderRadius:10, padding:20, marginBottom:24 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:3, marginBottom:12 } }, "ROOM CODE"),
        React.createElement("div", { style:{ background:"#0d0f16", border:"2px solid #FFD700", borderRadius:8, padding:16, marginBottom:12 } },
          React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:36, color:"#FFD700", letterSpacing:4, marginBottom:8 } }, roomCode),
          React.createElement("button", {
            onClick: () => copyToClipboard(roomCode, "Room Code"),
            style:{ ...BTN.ghost, color:"#FFD700", border:"1px solid #FFD70044", width:"100%", padding:"8px 12px" }
          }, "📋 COPY CODE")
        ),

        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555", letterSpacing:3, marginBottom:12 } }, "SHARE LINK"),
        React.createElement("div", { style:{ background:"#0d0f16", border:"1px solid #1e2230", borderRadius:8, padding:8, marginBottom:12, fontSize:11, color:"#888", fontFamily:"'Rajdhani'", wordBreak:"break-all" } },
          shareLink
        ),
        React.createElement("button", {
          onClick: () => copyToClipboard(shareLink, "Link"),
          style:{ ...BTN.ghost, color:"#00FF88", border:"1px solid #00FF8844", width:"100%", padding:"8px 12px" }
        }, "🔗 COPY LINK")
      ),

      React.createElement("div", { style:{ display:"flex", flexDirection:"column", gap:10 } },
        React.createElement("button", {
          onClick: () => { sfx("reveal"); onContinue(); },
          style:{ ...BTN.gold, width:"100%", padding:"12px 16px" }
        }, "✓ CONTINUE TO AUCTION"),
        React.createElement("span", { style:{ fontFamily:"'Rajdhani'", fontSize:11, color:"#555" } },
          "Players can join at any time before the first lot opens"
        )
      )
    )
  );
}
