import React from "react";

const IST_OFFSET_MINUTES = 330; // +5:30 from UTC
const COUNTDOWN_END_HOUR = 22; // 10 PM

const getIstNow = () => {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + IST_OFFSET_MINUTES * 60000);
};

const isAuctionTimeReached = () => {
  const now = getIstNow();
  return now.getHours() >= COUNTDOWN_END_HOUR;
};

export function BoisBanner() {
  const [showBanner, setShowBanner] = React.useState(() => {
    // Only show if not dismissed in localStorage AND auction hasn't started
    const dismissed = localStorage.getItem("boisBannerDismissed");
    return !dismissed && !isAuctionTimeReached();
  });

  React.useEffect(() => {
    const checkTime = setInterval(() => {
      // Hide banner if auction time is reached
      if (isAuctionTimeReached()) {
        setShowBanner(false);
      }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(checkTime);
  }, []);

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem("boisBannerDismissed", "true");
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.bannerContainer}>
        <h1 style={styles.title}>Boiiis ⚽</h1>
        <p style={styles.message}>
          Planning a football auction night — basically us trying to build teams, overpay for random players, and roast each other the whole time 😄
        </p>
        <p style={styles.message}>
          Should be a fun, chill scene. Come through, we'll keep it simple — good vibes, some chaos, and a lot of banter.
        </p>
        <button style={styles.dismissBtn} onClick={handleDismiss}>
          Let's Go! 🚀
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(2px)",
  },
  bannerContainer: {
    background: "linear-gradient(135deg, #1a1f2e 0%, #0f1419 100%)",
    borderRadius: 14,
    padding: "32px 28px",
    maxWidth: 420,
    boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "#fff",
    textAlign: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    margin: "0 0 16px 0",
    fontFamily: "'Rajdhani', system-ui, sans-serif",
    color: "#FFB000",
  },
  message: {
    fontSize: 14,
    lineHeight: 1.6,
    margin: "12px 0",
    fontFamily: "system-ui, -apple-system, sans-serif",
    color: "#ddd",
  },
  dismissBtn: {
    marginTop: 20,
    padding: "10px 20px",
    background: "#FFB000",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    color: "#000",
    cursor: "pointer",
    fontFamily: "'Rajdhani', system-ui, sans-serif",
    transition: "background 0.2s",
  },
};
