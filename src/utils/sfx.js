export function sfx(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.connect(ctx.destination);
    const tone = (f, t, d, v = .2, wave = "sine") => {
      const o = ctx.createOscillator(); o.type = wave; o.connect(g);
      o.frequency.value = f;
      g.gain.setValueAtTime(v, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + d);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + d + .01);
    };
    if (type === "pick")    { tone(523,.0,.1,.25); tone(784,.1,.2,.2); }
    if (type === "pass")    { tone(330,.0,.2,.15,"sawtooth"); }
    if (type === "open")    { [261,329,392,523].forEach((f,i) => tone(f,i*.1,.3,.2)); }
    if (type === "sold")    { [523,659,784,1047].forEach((f,i) => tone(f,i*.07,.25,.22)); }
    if (type === "tick")    { tone(880,.0,.04,.1); }
    if (type === "reveal")  { tone(200,.0,.05,.15,"sawtooth"); tone(880,.1,.4,.2); }
    if (type === "wishlist"){ tone(660,.0,.08,.18); tone(880,.1,.15,.14); }
  } catch (_) {}
}
