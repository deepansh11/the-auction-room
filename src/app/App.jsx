import React from "react";
import { apiAbandonSession, apiCreateRoom, apiGetCurrentUser, apiGetRoom, apiJoinRoom, apiListSessions, apiRestoreSessionBackup, apiStartTransferWindow, apiUpdateWishlists, isAuthExpiredError } from "../lib/api.js";
import { TIERS } from "../game/constants.js";
import { Spinner } from "../components/Spinner.jsx";
import { AuthScreen } from "../screens/AuthScreen.jsx";
import { PlayerDiscovery } from "../screens/PlayerDiscovery.jsx";
import { SetupScreen } from "../screens/SetupScreen.jsx";
import { DrawScreen } from "../screens/DrawScreen.jsx";
import { BiddingScreen } from "../screens/BiddingScreen.jsx";
import { ResultsScreen } from "../screens/ResultsScreen.jsx";
import { BallonDorPanel } from "../components/BallonDorPanel.jsx";
import { BoisBanner } from "../components/BoisBanner.jsx";
import { BackgroundCarousel } from "../components/BackgroundCarousel.jsx";
import { FOOTBALL_THEME } from "../theme/footballTheme.js";
import { getBallonDorUploadParamsFromUrl, getRoomCodeFromUrl, isValidRoomCode } from "../utils/roomUtils.js";
import { clearLocalAuthUser, getLocalAuthUser, setLocalAuthUser } from "../lib/localAuth.js";
import { setAnalyticsAuthToken, trackEvent, trackScreenView } from "../lib/analytics.js";
import { normalizeSessionRecord } from "../utils/sessionData.js";

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = React.useState(null);
  const [screen, setScreen] = React.useState("auth"); // auth | discover | setup | draw | bidding | results | performance-upload
  const [session, setSession] = React.useState(null);
  const [finalParticipants, setFinalParticipants] = React.useState(null);
  const [wishlists, setWishlists] = React.useState({}); // { participantName: [playerId, ...] }
  const [loading, setLoading] = React.useState(true);
  const [pendingRoomCode, setPendingRoomCode] = React.useState(null);
  const [lastRoomCode, setLastRoomCode] = React.useState(() => localStorage.getItem("lastRoomCode") || "");
  const [publicBallonDorUpload, setPublicBallonDorUpload] = React.useState(null);

  const clearLastRoomCode = React.useCallback(() => {
    setLastRoomCode("");
    localStorage.removeItem("lastRoomCode");
  }, []);

  const forceAuthScreen = React.useCallback(() => {
    clearLocalAuthUser();
    setUser(null);
    setSession(null);
    setFinalParticipants(null);
    setWishlists({});
    setAnalyticsAuthToken("");
    setScreen("auth");
  }, []);

  const isRoomMissingError = React.useCallback((err) => {
    const message = String(err?.message || "").toLowerCase();
    return message.includes("room not found") || message.includes("session not found");
  }, []);

  const screenForSession = React.useCallback((sessionStatus) => {
    if (sessionStatus === "complete") return "results";
    if (sessionStatus === "draw") return "draw";
    return "bidding";
  }, []);

  const findSessionByRoomCode = React.useCallback(async (roomCode) => {
    return apiGetRoom(roomCode, user?.token);
  }, [user?.token]);

  React.useEffect(() => {
    setAnalyticsAuthToken(user?.token || "");
  }, [user?.token]);

  React.useEffect(() => {
    const handleAuthExpired = () => {
      forceAuthScreen();
    };

    window.addEventListener("fc:auth-expired", handleAuthExpired);
    return () => window.removeEventListener("fc:auth-expired", handleAuthExpired);
  }, [forceAuthScreen]);

  React.useEffect(() => {
    if (!user) return;
    trackScreenView(screen);
  }, [screen, user]);

  React.useLayoutEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (document.documentElement) document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };

    resetScroll();
    const raf = window.requestAnimationFrame(resetScroll);
    return () => window.cancelAnimationFrame(raf);
  }, [screen]);

  // Check for saved auth on mount
  React.useEffect(() => {
    (async () => {
      const savedUser = getLocalAuthUser();
      const urlRoomCode = getRoomCodeFromUrl();
      const uploadParams = getBallonDorUploadParamsFromUrl();
      if (uploadParams) {
        setPublicBallonDorUpload(uploadParams);
        if (savedUser?.token) {
          setUser(savedUser);
          setWishlists(savedUser.wishlists || {});
        }
        setScreen("performance-upload");
        setLoading(false);
        return;
      }
      if (savedUser) { 
        if (!savedUser?.token) {
          clearLocalAuthUser();
          setUser(null);
          setWishlists({});
          if (urlRoomCode && isValidRoomCode(urlRoomCode)) {
            setPendingRoomCode(urlRoomCode);
          }
          setScreen("auth");
          setLoading(false);
          return;
        }

        let hydratedUser = savedUser;
        if (savedUser?.token) {
          try {
            const serverUser = await apiGetCurrentUser(savedUser.token);
            hydratedUser = { ...savedUser, ...serverUser, token: savedUser.token };
            setLocalAuthUser(hydratedUser);
          } catch (err) {
            if (isAuthExpiredError(err)) {
              clearLocalAuthUser();
              setUser(null);
              setSession(null);
              setFinalParticipants(null);
              setWishlists({});
              setAnalyticsAuthToken("");
              if (urlRoomCode && isValidRoomCode(urlRoomCode)) {
                setPendingRoomCode(urlRoomCode);
              }
              setScreen("auth");
              setLoading(false);
              return;
            }
            hydratedUser = savedUser;
          }
        }

        setUser(hydratedUser); 
        setWishlists(hydratedUser.wishlists || {});
        if (urlRoomCode && isValidRoomCode(urlRoomCode)) {
          setPendingRoomCode(urlRoomCode);
          setScreen("discover");
        } else {
          try {
            const sessions = await apiListSessions(hydratedUser.username, hydratedUser.token);
            const resumable = sessions.find((s) => s.status === "draw" || s.status === "active");
            if (resumable) {
              if (resumable?.roomCode) {
                setLastRoomCode(resumable.roomCode);
                localStorage.setItem("lastRoomCode", resumable.roomCode);
              }
              setSession(resumable);
              setScreen(screenForSession(resumable.status));
            } else {
              setScreen("discover");
            }
          } catch (_err) {
            setScreen("discover");
          }
        }
      } else if (urlRoomCode && isValidRoomCode(urlRoomCode)) {
        // No user but there's a room code - set it and go to auth
        setPendingRoomCode(urlRoomCode);
        setScreen("auth");
      }
      setLoading(false);
    })();
  }, []);

  // Auto-join room after login if pendingRoomCode is set
  React.useEffect(() => {
    if (user && pendingRoomCode && screen === "discover") {
      (async () => {
        try {
          if (!isValidRoomCode(pendingRoomCode)) {
            throw new Error("Invalid room code format");
          }
          const targetSession = await findSessionByRoomCode(pendingRoomCode);
          if (!targetSession) {
            throw new Error("Room not found");
          }
          const joinedSession = await apiJoinRoom(pendingRoomCode, user.username, user?.token);
          const nextSession = joinedSession || targetSession;
          if (nextSession?.roomCode) {
            setLastRoomCode(nextSession.roomCode);
            localStorage.setItem("lastRoomCode", nextSession.roomCode);
          }
          setSession(nextSession);
          setPendingRoomCode(null);
          setScreen(screenForSession(nextSession.status));
        } catch (err) {
          console.error("Failed to join room:", err);
          setPendingRoomCode(null);
        }
      })();
    }
  }, [user, pendingRoomCode, screen, findSessionByRoomCode, screenForSession]);

  const handleAuth = async (u, roomCode, token) => {
    const nextUser = { ...u, token: token || u?.token || "" };
    setLocalAuthUser(nextUser);
    setUser(nextUser);
    setWishlists(u.wishlists || {});
    setAnalyticsAuthToken(nextUser.token);
    trackEvent("auth_success", { username: u?.username });
    if (roomCode) {
      setPendingRoomCode(roomCode);
      setScreen("discover");
    } else {
      setScreen("discover");
    }
  };

  const handleLogout = async () => {
    trackEvent("logout");
    forceAuthScreen();
  };

  const handleWishlist = async (participantName, playerId) => {
    let nextWishlists = null;

    setWishlists(prev => {
      const current = prev[participantName] || [];
      const updated = current.includes(playerId)
        ? current.filter(id => id !== playerId)
        : [...current, playerId];
      const newWl = { ...prev, [participantName]: updated };
      nextWishlists = newWl;
      return newWl;
    });

    if (user && nextWishlists) {
      const current = getLocalAuthUser();
      if (current) {
        const next = { ...current, wishlists: nextWishlists };
        setLocalAuthUser(next);
        setUser(next);
      }

      try {
        await apiUpdateWishlists(nextWishlists, user.token);
      } catch (err) {
        console.error("Failed to persist wishlist:", err);
      }
    }
  };

  const handleJoinByCode = async (roomCode) => {
    const normalizedRoomCode = String(roomCode || "").toUpperCase();
    if (!isValidRoomCode(normalizedRoomCode)) {
      throw new Error("Invalid room code format");
    }
    const targetSession = await findSessionByRoomCode(normalizedRoomCode);
    if (!targetSession) {
      if (normalizedRoomCode === lastRoomCode) {
        clearLastRoomCode();
      }
      throw new Error("Room not found");
    }
    // Add current user as participant if not already
    const joinedSession = await apiJoinRoom(normalizedRoomCode, user.username, user?.token);
    const nextSession = joinedSession || targetSession;
    if (nextSession?.roomCode) {
      setLastRoomCode(nextSession.roomCode);
      localStorage.setItem("lastRoomCode", nextSession.roomCode);
    }
    trackEvent("room_joined", { roomCode: normalizedRoomCode });
    setSession(nextSession);
    setScreen(screenForSession(nextSession.status));
  };

  const handleStartSession = async (s, options = {}) => {
    const { deferNavigation = false, skipCreate = false } = options;
    const created = skipCreate ? null : await apiCreateRoom(s, user?.token);
    const nextSession = normalizeSessionRecord(created || s);
    if (nextSession?.roomCode) {
      setLastRoomCode(nextSession.roomCode);
      localStorage.setItem("lastRoomCode", nextSession.roomCode);
    }
    if (!skipCreate) {
      trackEvent("room_created", {
        participantCount: s?.participantNames?.length || 0,
        mysteryEnabled: Boolean(s?.mysteryEnabled),
        groupsEnabled: Boolean(s?.groupsEnabled),
      });
    }
    setSession(nextSession);
    if (!deferNavigation) {
      setScreen("draw");
    }
    return nextSession;
  };

  const handleLoadSession = (s) => {
    const normalized = normalizeSessionRecord(s);
    if (!normalized || typeof normalized !== "object" || !Array.isArray(normalized.participants)) {
      return;
    }
    if (normalized?.roomCode) {
      setLastRoomCode(normalized.roomCode);
      localStorage.setItem("lastRoomCode", normalized.roomCode);
    }
    setSession(normalized);
    if (normalized.status === "complete") {
      setFinalParticipants(normalized.participants);
      setScreen("results");
    } else {
      setScreen(screenForSession(normalized.status));
    }
  };

  const handleAbandonSession = async () => {
    if (!session?.id || !user?.token) {
      setSession(null);
      setScreen("discover");
      return;
    }
    trackEvent("session_abandoned", { sessionId: session.id, isHost: session.host === user.username });
    try {
      await apiAbandonSession(session.id, user.token);
    } catch (err) {
      console.error("Failed to abandon session:", err);
    }
    setSession(null);
    setScreen("discover");
  };

  const handleBiddingEnd = async (participants) => {
    trackEvent("auction_completed", { sessionId: session?.id, participantCount: participants?.length || 0 });
    setFinalParticipants(participants);
    setScreen("results");
  };

  const handleStartTransferWindow = async (result) => {
    const resultId = result?.sessionId || result?.id || session?.id || "";
    if (!resultId) throw new Error("Result ID not available");
    const transferSession = await apiStartTransferWindow(resultId, user?.token);
    if (transferSession?.roomCode) {
      setLastRoomCode(transferSession.roomCode);
      localStorage.setItem("lastRoomCode", transferSession.roomCode);
    }
    setSession(transferSession);
    setScreen("bidding");
    return transferSession;
  };

  const handleRestoreSessionBackup = async (backup) => {
    const restoredSession = await apiRestoreSessionBackup(backup, user?.token);
    if (restoredSession?.roomCode) {
      setLastRoomCode(restoredSession.roomCode);
      localStorage.setItem("lastRoomCode", restoredSession.roomCode);
    }
    setFinalParticipants(null);
    setSession(restoredSession);
    setScreen(screenForSession(restoredSession?.status));
    return restoredSession;
  };

  const handleRejoinLast = async () => {
    if (!lastRoomCode) return;
    try {
      await handleJoinByCode(lastRoomCode);
    } catch (err) {
      if (isRoomMissingError(err)) {
        clearLastRoomCode();
      }
      throw err;
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    if (!user || screen !== "discover" || !lastRoomCode) return;

    (async () => {
      try {
        const room = await findSessionByRoomCode(lastRoomCode);
        if (!room && !cancelled) {
          clearLastRoomCode();
        }
      } catch (err) {
        if (!cancelled && isRoomMissingError(err)) {
          clearLastRoomCode();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, screen, lastRoomCode, findSessionByRoomCode, clearLastRoomCode, isRoomMissingError]);

  if (loading) return React.createElement("div", {
    style:{ minHeight:"100vh", background:FOOTBALL_THEME.background, display:"flex",
      alignItems:"center", justifyContent:"center" }
  }, React.createElement(Spinner, null));

  return React.createElement("div", {
    style: {
      minHeight: "100vh",
      position: "relative",
      isolation: "isolate",
      background: FOOTBALL_THEME.background,
      color: "#fff",
      overflowX: "hidden",
    }
  },
    React.createElement(BackgroundCarousel, null),
    React.createElement("div", { style: { position: "relative", zIndex: 1 } },
      user?.role === "bois" && React.createElement(BoisBanner, null),
      screen === "auth" && React.createElement(AuthScreen, { onAuth:handleAuth, pendingRoomCode }),
      screen === "discover" && user && React.createElement(PlayerDiscovery, {
        user,
        wishlists,
        onLogout: handleLogout,
        onNewGame: () => setScreen("setup"),
        onJoinByCode: handleJoinByCode,
        onRejoinLast: handleRejoinLast,
        lastRoomCode,
        onLoadSession: handleLoadSession,
        onRestoreBackup: handleRestoreSessionBackup,
        onWishlist: (playerId) => handleWishlist(user.username, playerId)
      }),
      screen === "setup" && user && React.createElement(React.Fragment, null,
        React.createElement(SetupScreen, { user, onStart:handleStartSession, onBackToDiscover: () => setScreen("discover") })
      ),
      screen === "draw" && session && React.createElement(React.Fragment, null,
        React.createElement(DrawScreen, {
          session,
          user,
          onComplete: () => setScreen("bidding"),
          onAbandon: handleAbandonSession,
        })
      ),
      screen === "bidding" && session && React.createElement(React.Fragment, null,
        React.createElement(BiddingScreen, {
          session, user, wishlists,
          onWishlist: handleWishlist,
          onEnd: handleBiddingEnd,
          onAbandon: handleAbandonSession,
        })
      ),
      screen === "results" && finalParticipants && React.createElement(React.Fragment, null,
        React.createElement(ResultsScreen, {
          participants: finalParticipants,
          wishlists,
          players: session?.playerPool || session?.shuffledPlayers || [],
          tiers: session?.tiers || TIERS,
          selectedName: user?.username,
          auctionResultId: session?.id || session?.sessionId || "",
          user,
          host: session?.host || "",
          groupsEnabled: Boolean(session?.groupsEnabled),
          groups: session?.groups || {},
          fixtures: session?.fixtures || {},
          fixtureLeg: session?.fixtureLeg || "single",
          knockoutFormat: session?.knockoutFormat || "quarterFinal",
          seasonInfo: session?.seasonInfo || {},
          transferWindow: session?.transferWindow || {},
          onStartTransferWindow: handleStartTransferWindow,
          onBackToDiscover: () => setScreen("discover"),
          onRefresh: () => {},
        })
      ),
      screen === "performance-upload" && publicBallonDorUpload && React.createElement("div", { style: { maxWidth: 1180, margin: "0 auto", padding: "20px 18px 40px", position: "relative", zIndex: 1 } },
        React.createElement(BallonDorPanel, {
          auctionResultId: publicBallonDorUpload.auctionResultId,
          publicAccessToken: publicBallonDorUpload.token,
          selectedFixtureId: publicBallonDorUpload.fixtureId || "",
          mode: "upload",
          onClose: () => {
            window.history.replaceState({}, document.title, window.location.pathname);
            setPublicBallonDorUpload(null);
            setScreen(user ? "discover" : "auth");
          },
          user,
        })
      )
    )
  );
}
