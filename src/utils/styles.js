/* Runs once at module load — injects Google Fonts + global keyframes */
(function injectStyles() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;600;800&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --pitch-0: #050a08;
      --pitch-1: #0a1711;
      --pitch-2: #123224;
      --surface: rgba(8, 18, 13, 0.82);
      --surface-2: rgba(10, 23, 16, 0.9);
      --line: rgba(255, 255, 255, 0.08);
      --gold: #8fe7c0;
      --cyan: #4fc3f7;
      --green: #00ff88;
      --orange: #ff6b35;
      --red: #ff3d71;
      --text: #e5edf8;
      --muted: #8ea0ba;
    }
    html, body, #root { min-height: 100%; }
    body {
      background:
        radial-gradient(circle at top, rgba(79,195,247,.12), transparent 35%),
        radial-gradient(circle at bottom right, rgba(143,231,192,.12), transparent 28%),
        linear-gradient(180deg, var(--pitch-1), var(--pitch-0) 65%);
      font-family: 'Exo 2', sans-serif;
      overflow-x: hidden;
      color: var(--text);
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      background:
        linear-gradient(90deg, transparent 0 24%, rgba(255,255,255,.03) 24% 24.6%, transparent 24.6% 49.4%, rgba(255,255,255,.03) 49.4% 50.6%, transparent 50.6% 75.4%, rgba(255,255,255,.03) 75.4% 76%, transparent 76% 100%),
        radial-gradient(circle at center, rgba(255,255,255,.03) 0 1px, transparent 1px 100%);
      background-size: 100% 100%, 40px 40px;
      opacity: .55;
      mix-blend-mode: screen;
    }
    #root { position: relative; z-index: 1; }
    button {
      font-family: 'Bebas Neue', sans-serif;
      letter-spacing: 1px;
      color: var(--text);
      transition: filter .18s ease, background .18s ease, border-color .18s ease, color .18s ease, box-shadow .18s ease;
      -webkit-font-smoothing: antialiased;
      appearance: none;
    }
    input, textarea, select {
      background: rgba(8, 18, 13, 0.96) !important;
      color: var(--text) !important;
      border: 1px solid rgba(255, 255, 255, 0.14) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 10px 26px rgba(0,0,0,.18);
      caret-color: var(--gold);
    }
    input::placeholder, textarea::placeholder {
      color: rgba(142, 160, 186, 0.75);
    }
    input:focus, textarea:focus, select:focus {
      border-color: rgba(79, 195, 247, 0.55) !important;
      box-shadow: 0 0 0 3px rgba(79, 195, 247, 0.14), 0 10px 26px rgba(0,0,0,.18);
      outline: none;
    }
    ::selection { background: rgba(143, 231, 192, .28); color: #fff; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #06110c; }
    ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #3a5e4f, #1b352a); border-radius: 999px; }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    button:hover { filter: brightness(1.08); }
    @keyframes fadeUp    { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
    @keyframes scaleIn   { from { opacity:0; transform:scale(.9); } to { opacity:1; transform:scale(1); } }
    @keyframes flipCard  { from { opacity:0; transform:rotateY(90deg) scale(.85); } to { opacity:1; transform:rotateY(0) scale(1); } }
    @keyframes slideR    { from { opacity:0; transform:translateX(-20px); } to { opacity:1; transform:translateX(0); } }
    @keyframes rowIn     { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
    @keyframes toastDrop { from { opacity:0; transform:translateX(-50%) translateY(-12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    @keyframes pulse     { 0%,100% { opacity:1; } 50% { opacity:.6; } }
    @keyframes confettiFall { to { transform:translateY(110vh) rotate(720deg); opacity:0; } }
    @keyframes spinConfetti { to { transform:translateY(110vh) rotateZ(1800deg); opacity:0; } }
    @keyframes shimmer   { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
    @keyframes spin      { to { transform:rotate(360deg); } }
  `;
  document.head.appendChild(style);
})();

export const BTN = {
  primary: { background:"linear-gradient(135deg,#4FC3F7,#00FF88)", color:"#031018", border:"none",
    borderRadius:10, padding:"11px 28px", fontSize:17, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:2, boxShadow:"0 8px 20px rgba(79,195,247,.18)" },
  gold: { background:"linear-gradient(135deg,#4FC3F7,#8fe7c0)", color:"#06110c", border:"none",
    borderRadius:10, padding:"11px 28px", fontSize:17, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:2, boxShadow:"0 8px 22px rgba(79,195,247,.16)" },
  ghost: { background:"rgba(8, 18, 13, 0.35)", color:"var(--text)", border:"1px solid rgba(255,255,255,.10)",
    borderRadius:12, padding:"7px 16px", fontSize:14, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:1, backdropFilter:"blur(10px)" },
  danger: { background:"rgba(255,61,113,.12)", color:"#ff7b9d", border:"1px solid rgba(255,61,113,.25)",
    borderRadius:12, padding:"7px 16px", fontSize:14, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:1 },
  green: { background:"linear-gradient(135deg,#00FF88,#00CC66)", color:"#031018", border:"none",
    borderRadius:12, padding:"8px 18px", fontSize:15, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:1 },
};
