import React from "react";

const IST_OFFSET_MINUTES = 330; // +5:30 from UTC
const COUNTDOWN_END_HOUR = 22; // 10 PM
const COUNTDOWN_END_MINUTE = 0;

const getIstNow = () => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + IST_OFFSET_MINUTES * 60000);
};

const getRemaining = () => {
  const now = getIstNow();
  const end = new Date(now);
  end.setHours(COUNTDOWN_END_HOUR, COUNTDOWN_END_MINUTE, 0, 0);
  // only count down until today 10 PM IST; after that, show expired
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return null;

  const totalSec = Math.floor(diff / 1000);
  const hours = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const secs = String(totalSec % 60).padStart(2, "0");

  return { total: diff, hours, mins, secs };
};

export function CountdownTimer() {
  const [remaining, setRemaining] = React.useState(getRemaining());
  const [celebrating, setCelebrating] = React.useState(false);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (remaining === null && !celebrating) {
      setCelebrating(true);
      const celebrationTimer = setTimeout(() => setCelebrating(false), 5000);
      return () => clearTimeout(celebrationTimer);
    }
  }, [remaining, celebrating]);

  if (celebrating) {
    return (
      <div style={styles.celebrationOverlay}>
        <div style={styles.celebrationBox}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🎉 Auction starts now! 🎉</div>
          <div style={{ fontSize: 14 }}>Get ready for bidding!</div>
        </div>
      </div>
    );
  }

  if (!remaining) {
    return (
      <div style={styles.container}>
        Auction starts in : 00:00:00
      </div>
    );
  }

  const soon = remaining.total <= 10 * 60 * 1000;

  return (
    <div style={{ ...styles.container, borderColor: soon ? "#FFB000" : "#888", color: soon ? "#FFB000" : "#fff" }}>
      Auction starts in : {remaining.hours}:{remaining.mins}:{remaining.secs}
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    background: "rgba(10, 12, 18, 0.9)",
    border: "1px solid #888",
    borderRadius: 10,
    padding: "8px 14px",
    fontFamily: "'Rajdhani', system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.35)",
    pointerEvents: "none",
  },
  celebrationOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.45)",
    pointerEvents: "none",
  },
  celebrationBox: {
    background: "rgba(255, 255, 255, 0.95)",
    borderRadius: 14,
    padding: "18px 24px",
    boxShadow: "0 10px 26px rgba(0,0,0,0.35)",
    color: "#111",
    textAlign: "center",
    maxWidth: 320,
  },
};
