import React from "react";
import { Spinner } from "../components/Spinner.jsx";
import { BTN } from "../utils/styles.js";
import { apiForgotPassword, apiLogin, apiRegister, apiResetPassword } from "../lib/api.js";
import { setAnalyticsAuthToken, trackEvent } from "../lib/analytics.js";
import { FOOTBALL_THEME, createSurfaceStyle } from "../theme/footballTheme.js";

export function AuthScreen({ onAuth, pendingRoomCode }) {
  const [mode, setMode] = React.useState("login"); // login | register | forgot
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [resetToken, setResetToken] = React.useState("");
  const [resetTokenInput, setResetTokenInput] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const switchMode = (m) => {
    setMode(m);
    setError("");
    setInfo("");
    setResetToken("");
    setResetTokenInput("");
    setNewPassword("");
  };

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) { setError("Fill in all fields"); return; }
    setLoading(true); setError("");
    try {
      const result = mode === "register"
        ? await apiRegister(username.trim(), password, email.trim())
        : await apiLogin(username.trim(), password);
      setAnalyticsAuthToken(result.token);
      trackEvent(mode === "register" ? "register_success" : "login_success");
      onAuth(result.user, pendingRoomCode, result.token);
    } catch (err) {
      trackEvent(mode === "register" ? "register_failed" : "login_failed");
      setError(err?.message || "Authentication failed");
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const handleRequestReset = async () => {
    if (!username.trim()) { setError("Enter your username first"); return; }
    setLoading(true); setError(""); setInfo("");
    try {
      const result = await apiForgotPassword(username.trim());
      setResetToken(result.token || result.resetToken || "");
      setResetTokenInput(result.token || result.resetToken || "");
      setInfo("This app doesn't send emails yet, so here's your reset code directly — copy it below and set a new password. It expires in 30 minutes.");
      trackEvent("password_reset_requested");
    } catch (err) {
      setError(err?.message || "Could not start password reset");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetTokenInput.trim() || !newPassword.trim()) { setError("Enter the reset code and a new password"); return; }
    setLoading(true); setError("");
    try {
      const result = await apiResetPassword(username.trim(), resetTokenInput.trim(), newPassword);
      setAnalyticsAuthToken(result.token);
      trackEvent("password_reset_completed");
      onAuth(result.user, pendingRoomCode, result.token);
    } catch (err) {
      setError(err?.message || "Could not reset password");
      setLoading(false);
    }
  };

  const field = (label, value, onChange, type = "text") =>
    React.createElement("div", { key: label, style:{ marginBottom:14 } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:11, color:"#cbd5e1",
        letterSpacing:2, marginBottom:5 } }, label.toUpperCase()),
      React.createElement("input", {
        type,
        value,
        onChange: e => onChange(e.target.value),
        onKeyDown: e => e.key === "Enter" && (mode === "forgot" ? (resetToken ? handleConfirmReset() : handleRequestReset()) : handleSubmit()),
        placeholder: label,
        style:{ width:"100%", background:"#0d0f16", border:"1px solid #1e2230",
          borderRadius:8, padding:"10px 14px", color:"#fff", fontSize:14,
          fontFamily:"'Exo 2'", outline:"none" }
      })
    );

  return React.createElement("div", {
    style:{ minHeight:"100vh", background:"transparent", display:"flex", alignItems:"center",
      justifyContent:"center", padding:20 }
  },
    React.createElement("div", { style:{ width:"100%", maxWidth:420, animation:"fadeUp .5s ease", position:"relative", zIndex:2 } },
      React.createElement("div", { style:{ textAlign:"center", marginBottom:36 } },
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:64, color:"#fff", letterSpacing:6, lineHeight:.9, textShadow:"0 4px 24px rgba(0,0,0,.35)" } }, "THE AUCTION"),
      React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:22, color:"#4FC3F7", letterSpacing:10, marginTop:4, textShadow:"0 2px 12px rgba(79,195,247,.22)" } }, "ROOM"),
      React.createElement("div", { style:{ width:60, height:3, background:"linear-gradient(90deg,#4FC3F7,#8fe7c0)", margin:"10px auto 0", borderRadius:999, boxShadow:"0 0 18px rgba(79,195,247,.35)" } })
      ),
    React.createElement("div", { style:{ ...createSurfaceStyle({ padding: 28, radius: 18, elevated: true }), background:"rgba(8,18,13,.90)", border:"1px solid rgba(143,231,192,.16)", backdropFilter:"blur(16px)" } },
      mode !== "forgot" && React.createElement("div", { style:{ display:"flex", gap:0, marginBottom:22, background:"rgba(255,255,255,.04)",
          borderRadius:8, padding:3 } },
          ["login","register"].map(m =>
            React.createElement("button", { key:m, onClick: () => switchMode(m), style:{
              flex:1, background: mode===m ? "linear-gradient(135deg,#4FC3F7,#00FF88)" : "transparent",
              color: mode===m ? "#071018" : "#7b879a", border:"none", borderRadius:6,
              padding:"7px 0", cursor:"pointer", fontFamily:"'Bebas Neue'",
              fontSize:14, letterSpacing:1, transition:"all .2s"
            }}, m.toUpperCase())
          )
        ),

        mode === "forgot" && React.createElement("div", { style:{ fontFamily:"'Bebas Neue'", fontSize:20, color:FOOTBALL_THEME.gold,
          letterSpacing:2, marginBottom:18, textAlign:"center" } }, "RESET PASSWORD"),

        (mode === "login" || mode === "register") && [
          field("Username", username, setUsername),
          mode === "register" && field("Email (optional)", email, setEmail, "email"),
          field("Password", password, setPassword, "password"),
        ],

        mode === "forgot" && !resetToken && field("Username", username, setUsername),

        mode === "forgot" && resetToken && React.createElement(React.Fragment, null,
          React.createElement("div", { style:{
            background:"#8fe7c016", border:"1px solid #8fe7c055", borderRadius:8, padding:"10px 12px",
            marginBottom:14, fontFamily:"'Rajdhani'", fontSize:12, color:"#8fe7c0", wordBreak:"break-all"
          } }, "Reset code: ", React.createElement("b", null, resetToken)),
          field("Reset code", resetTokenInput, setResetTokenInput),
          field("New password", newPassword, setNewPassword, "password"),
        ),

        info && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12,
          color:"#00FF88", marginBottom:12 } }, info),
        error && React.createElement("div", { style:{ fontFamily:"'Rajdhani'", fontSize:12,
          color:"#FF3D71", marginBottom:12 } }, error),

        loading
          ? React.createElement(Spinner, null)
          : React.createElement(React.Fragment, null,
              mode === "login" && React.createElement("button", { onClick:handleSubmit, style:{ ...BTN.gold, width:"100%", marginTop:8 } }, "SIGN IN →"),
              mode === "register" && React.createElement("button", { onClick:handleSubmit, style:{ ...BTN.gold, width:"100%", marginTop:8 } }, "CREATE ACCOUNT →"),
              mode === "forgot" && !resetToken && React.createElement("button", { onClick:handleRequestReset, style:{ ...BTN.gold, width:"100%", marginTop:8 } }, "SEND RESET CODE →"),
              mode === "forgot" && resetToken && React.createElement("button", { onClick:handleConfirmReset, style:{ ...BTN.gold, width:"100%", marginTop:8 } }, "SET NEW PASSWORD →")
            ),

        mode === "login" && React.createElement("div", { style:{ textAlign:"center", marginTop:14 } },
          React.createElement("button", {
            onClick: () => switchMode("forgot"),
            style:{ background:"none", border:"none", color:"#666", fontFamily:"'Rajdhani'", fontSize:12,
              cursor:"pointer", textDecoration:"underline" }
          }, "Forgot password?")
        ),
        mode === "forgot" && React.createElement("div", { style:{ textAlign:"center", marginTop:14 } },
          React.createElement("button", {
            onClick: () => switchMode("login"),
            style:{ background:"none", border:"none", color:"#666", fontFamily:"'Rajdhani'", fontSize:12,
              cursor:"pointer", textDecoration:"underline" }
          }, "← Back to sign in")
        )
      )
    )
  );
}
