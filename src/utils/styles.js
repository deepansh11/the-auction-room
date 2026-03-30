/* Runs once at module load — injects Google Fonts + global keyframes */
(function injectStyles() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;600;800&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #04060a; font-family: 'Exo 2', sans-serif; overflow-x: hidden; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: #08090d; }
    ::-webkit-scrollbar-thumb { background: #252830; border-radius: 2px; }
    input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
    button:hover { filter: brightness(1.1); }
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
  gold: { background:"linear-gradient(135deg,#FFD700,#FFA500)", color:"#000", border:"none",
    borderRadius:10, padding:"11px 28px", fontSize:17, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:2, boxShadow:"0 4px 18px #FFD70033" },
  ghost: { background:"transparent", color:"#888", border:"1px solid #252830",
    borderRadius:8, padding:"7px 16px", fontSize:14, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:1 },
  danger: { background:"#FF3D7122", color:"#FF3D71", border:"1px solid #FF3D7144",
    borderRadius:8, padding:"7px 16px", fontSize:14, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:1 },
  green: { background:"linear-gradient(135deg,#00FF88,#00CC66)", color:"#000", border:"none",
    borderRadius:8, padding:"8px 18px", fontSize:15, cursor:"pointer",
    fontFamily:"'Bebas Neue'", letterSpacing:1 },
};
