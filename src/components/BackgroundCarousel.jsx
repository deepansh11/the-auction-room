import React from "react";
import { FOOTBALL_THEME } from "../theme/footballTheme.js";

import bg1 from "../assets/stadium-background.webp";
import bg2 from "../assets/4a982bd7c8e2725d44fbd4a5e48008bd.jpg";
import bg3 from "../assets/6e5d1c70f357802f03082386fb560f67.jpg";
import bg4 from "../assets/9f74601ef562f2052b26c1b36211eae5.jpg";
import bg5 from "../assets/aea0c9c519e2be3102581abe25082d2c.jpg";
import bg6 from "../assets/acf43a6379c220d72288d01b7c1f04d2.jpg";

const slides = [bg1, bg2, bg3, bg4, bg5, bg6];

export function BackgroundCarousel({ intervalMs = 7000, paused = false }) {
  const [index, setIndex] = React.useState(0);
  const [reducedMotion, setReducedMotion] = React.useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  React.useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    if (paused || reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((current) => (current + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, paused, reducedMotion]);

  return React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      zIndex: 0,
      overflow: "hidden",
      pointerEvents: "none",
      background: FOOTBALL_THEME.background,
    }
  },
    slides.map((src, slideIndex) => slideIndex !== index && (paused || reducedMotion || slideIndex !== (index + slides.length - 1) % slides.length) ? null : React.createElement("div", {
      key: src,
      style: {
        position: "absolute",
        inset: 0,
        backgroundImage: `url(${src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        opacity: slideIndex === index ? 1 : 0,
        transform: paused || reducedMotion ? "none" : slideIndex === index ? "scale(1.05)" : "scale(1.12)",
        transition: paused || reducedMotion ? "none" : "opacity 1.2s ease, transform 8s ease",
        filter: "saturate(1.08) contrast(1.02) brightness(0.45)",
      }
    })),
    React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, rgba(5,8,14,.28) 0%, rgba(4,6,10,.72) 100%)",
      }
    }),
    React.createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "radial-gradient(circle at top, rgba(79,195,247,.16), transparent 40%), radial-gradient(circle at bottom right, rgba(255,215,0,.12), transparent 32%)",
      }
    })
  );
}
