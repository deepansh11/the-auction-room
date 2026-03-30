import React from "react";
import { Spinner } from "../components/Spinner.jsx";
import { BTN } from "../utils/styles.js";
import { apiLogin, apiRegister } from "../lib/api.js";

export function AuthScreen({ onAuth, pendingRoomCode }) {
  const [mode, setMode] = React.useState("login");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) { setError("Fill in all fields"); return; }
    setLoading(true); setError("");
    try {
      const result = mode === "register"
        ? await apiRegister(username.trim(), password)
        : await apiLogin(username.trim(), password);
      onAuth(result.user, pendingRoomCode, result.token);
    } catch (err) {
      setError(err?.message || "Authentication failed");
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", display:"flex", alignItems:"center",
      justifyContent:"center", padding:20 }
  },
    React.createElement("div", { style:{ width:"100%", maxWidth:420, animation:"fadeUp .5s ease" } },
      React.createElement("div", { style:{ textAlign:"center", marginBottom:36 } },
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:64, color:"#fff", letterSpacing:6, lineHeight:.9 } }, "THE AUCTION"),
        React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#FFD700", letterSpacing:10, marginTop:4 } }, "ROOM"),
        React.createElement("div", { style:{ width:50, height:2, background:"#FFD700", margin:"10px auto 0", borderRadius:1 } })
      ),
      React.createElement("div", { style:{ background:"#0a0c12", border:"1px solid #1e2230", borderRadius:14, padding:28 } },
        React.createElement("div", { style:{ display:"flex", gap:0, marginBottom:22, background:"#060810",
          borderRadius:8, padding:3 } },
          ["login","register"].map(m =>
            React.createElement("button", { key:m, onClick: () => setMode(m), style:{
              flex:1, background: mode===m ? "#FFD700" : "transparent",
              color: mode===m ? "#000" : "#666", border:"none", borderRadius:6,
              padding:"7px 0", cursor:"pointer", fontFamily:"'Bebas Neue'",
              fontSize:14, letterSpacing:1, transition:"all .2s"
            }}, m.toUpperCase())
          )
        ),
        ["Username","Password"].map((label, i) =>
          React.createElement("div", { key:i, style:{ marginBottom:14 } },
            React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#555",
              letterSpacing:2, marginBottom:5 } }, label.toUpperCase()),
            React.createElement("input", {
              type: i===1 ? "password" : "text",
              value: i===0 ? username : password,
              onChange: e => i===0 ? setUsername(e.target.value) : setPassword(e.target.value),
              onKeyDown: e => e.key === "Enter" && handleSubmit(),
              placeholder: label,
              style:{ width:"100%", background:"#0d0f16", border:"1px solid #1e2230",
                borderRadius:8, padding:"10px 14px", color:"#fff", fontSize:14,
                fontFamily:"'Exo 2'", outline:"none" }
            })
          )
        ),
        error && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12,
          color:"#FF3D71", marginBottom:12 } }, error),
        loading
          ? React.createElement(Spinner, null)
          : React.createElement("button", { onClick:handleSubmit, style:{ ...BTN.gold, width:"100%", marginTop:8 } },
              mode === "login" ? "SIGN IN →" : "CREATE ACCOUNT →"
            )
      )
    )
  );
}
