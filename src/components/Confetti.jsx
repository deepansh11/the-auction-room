import React from "react";
import { PCOLORS } from "../game/constants.js";

export function Confetti({ active }) {
  if (!active) return null;
  
  const emojis = ["⚽", "🏆", "⭐", "✨", "🎯", "🔥", "💰", "🎪"];
  
  return React.createElement("div", {
    style: { position:"fixed", inset:0, pointerEvents:"none", zIndex:9999, overflow:"hidden" }
  }, 
    // Burst effect background
    React.createElement("div", {
      style: {
        position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)",
        width:200, height:200, background:"radial-gradient(circle, #FFD70055 0%, transparent 70%)",
        borderRadius:"50%", animation:"scaleIn .4s ease-out"
      }
    }),
    
    // Enhanced confetti pieces (100 instead of 60)
    Array.from({ length: 100 }, (_, i) => {
      const isEmoji = Math.random() > .6;
      const isSpinner = Math.random() > .8;
      const duration = 1.5 + Math.random() * 2;
      const delay = Math.random() * .5;
      
      return React.createElement("div", {
        key: i,
        style: {
          position:"absolute",
          left:`${Math.random()*100}%`,
          top: i < 50 ? `-${20 + Math.random()*30}px` : `${Math.random()*50}%`,
          width: isEmoji ? "28px" : `${4+Math.random()*10}px`,
          height: isEmoji ? "28px" : `${4+Math.random()*10}px`,
          background: isEmoji ? "transparent" : PCOLORS[i % PCOLORS.length],
          color: isEmoji ? "#fff" : "transparent",
          borderRadius: isEmoji ? "0" : (Math.random() > .5 ? "50%" : "2px"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: isEmoji ? "20px" : "0",
          animation: isSpinner
            ? `spinConfetti ${duration}s linear ${delay}s forwards`
            : `confettiFall ${duration}s ease-in ${delay}s forwards`,
          filter: "drop-shadow(0 0 4px rgba(255, 215, 0, .5))",
          transform: `rotate(${Math.random() * 360}deg)`,
        }},
        isEmoji ? emojis[Math.floor(Math.random() * emojis.length)] : null
      );
    })
  );
}
