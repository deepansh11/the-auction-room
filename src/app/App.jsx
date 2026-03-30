import React from "react";
import { apiAbandonSession, apiCreateRoom, apiGetCurrentUser, apiGetRoom, apiJoinRoom, apiListSessions, apiUpdateWishlists } from "../lib/api.js";
import { TIERS } from "../game/constants.js";
import { BTN } from "../utils/styles.js";
import { Spinner } from "../components/Spinner.jsx";
import { AuthScreen } from "../screens/AuthScreen.jsx";
import { PlayerDiscovery } from "../screens/PlayerDiscovery.jsx";
import { Dashboard } from "../screens/Dashboard.jsx";
import { SetupScreen } from "../screens/SetupScreen.jsx";
import { DrawScreen } from "../screens/DrawScreen.jsx";
import { BiddingScreen } from "../screens/BiddingScreen.jsx";
import { ResultsScreen } from "../screens/ResultsScreen.jsx";
import { getRoomCodeFromUrl, isValidRoomCode } from "../utils/roomUtils.js";
import { clearLocalAuthUser, getLocalAuthUser, setLocalAuthUser } from "../lib/localAuth.js";

/* ─────────────────────────────────────────────────────────────────────────────
   ROOT APP
───────────────────────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = React.useState(null);
  const [screen, setScreen] = React.useState("auth"); // auth | discover | dashboard | setup | draw | bidding | results
  const [session, setSession] = React.useState(null);
  const [finalParticipants, setFinalParticipants] = React.useState(null);
  const [wishlists, setWishlists] = React.useState({}); // { participantName: [playerId, ...] }
  const [loading, setLoading] = React.useState(true);
  const [pendingRoomCode, setPendingRoomCode] = React.useState(null);

  const screenForSession = React.useCallback((sessionStatus) => {
    if (sessionStatus === "complete") return "results";
    if (sessionStatus === "draw") return "draw";
    return "bidding";
  }, []);

  const findSessionByRoomCode = React.useCallback(async (roomCode) => {
    return apiGetRoom(roomCode);
  }, []);

  // Check for saved auth on mount
  React.useEffect(() => {
    (async () => {
      const savedUser = getLocalAuthUser();
      const urlRoomCode = getRoomCodeFromUrl();
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
          } catch (_err) {
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
    if (roomCode) {
      setPendingRoomCode(roomCode);
      setScreen("discover");
    } else {
      setScreen("discover");
    }
  };

  const handleLogout = async () => {
    clearLocalAuthUser();
    setUser(null);
    setWishlists({});
    setScreen("auth");
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
    if (!isValidRoomCode(roomCode)) {
      throw new Error("Invalid room code format");
    }
    const targetSession = await findSessionByRoomCode(roomCode);
    if (!targetSession) {
      throw new Error("Room not found");
    }
    // Add current user as participant if not already
    const joinedSession = await apiJoinRoom(roomCode, user.username, user?.token);
    const nextSession = joinedSession || targetSession;
    setSession(nextSession);
    setScreen(screenForSession(nextSession.status));
  };

  const handleStartSession = async (s, options = {}) => {
    const { deferNavigation = false, skipCreate = false } = options;
    const created = skipCreate ? null : await apiCreateRoom(s, user?.token);
    const nextSession = created || s;
    setSession(nextSession);
    if (!deferNavigation) {
      setScreen("draw");
    }
    return nextSession;
  };

  const handleLoadSession = (s) => {
    if (!s || typeof s !== "object" || !Array.isArray(s.participants)) {
      return;
    }
    setSession(s);
    if (s.status === "complete") {
      setFinalParticipants(s.participants);
      setScreen("results");
    } else {
      setScreen(screenForSession(s.status));
    }
  };

  const handleAbandonSession = async () => {
    if (!session?.id || !user?.token) {
      setSession(null);
      setScreen("discover");
      return;
    }
    try {
      await apiAbandonSession(session.id, user.token);
    } catch (err) {
      console.error("Failed to abandon session:", err);
    }
    setSession(null);
    setScreen("discover");
  };

  const handleBiddingEnd = async (participants) => {
    setFinalParticipants(participants);
    setScreen("results");
  };

  if (loading) return React.createElement("div", {
    style:{ minHeight:"100vh", background:"#04060a", display:"flex",
      alignItems:"center", justifyContent:"center" }
  }, React.createElement(Spinner, null));

  // nav bar for mid-session screens
  const Nav = () => React.createElement("div", { style:{
    position:"fixed", top:0, left:0, zIndex:500,
    display:"flex", gap:8, padding:"10px 16px"
  } },
    screen !== "discover" && React.createElement("button", {
      onClick: () => setScreen("discover"),
      style:{ ...BTN.ghost, fontSize:11 }
    }, "← DISCOVER")
  );

  return React.createElement("div", null,
    screen === "auth" && React.createElement(AuthScreen, { onAuth:handleAuth, pendingRoomCode }),
    screen === "discover" && user && React.createElement(PlayerDiscovery, {
      user,
      wishlists,
      onNewGame: () => setScreen("setup"),
      onJoinByCode: handleJoinByCode,
      onLoadSession: handleLoadSession,
      onWishlist: (playerId) => handleWishlist(user.username, playerId)
    }),
    screen === "dashboard" && user && React.createElement(Dashboard, {
      user, onLogout:handleLogout,
      onNewSession: () => setScreen("setup"),
      onLoadSession: handleLoadSession
    }),
    screen === "setup" && user && React.createElement(React.Fragment, null,
      React.createElement(Nav, null),
      React.createElement(SetupScreen, { user, onStart:handleStartSession })
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
      React.createElement(Nav, null),
      React.createElement(ResultsScreen, {
        participants: finalParticipants,
        wishlists,
        players: session?.playerPool || session?.shuffledPlayers || [],
        tiers: session?.tiers || TIERS,
        selectedName: user?.username,
      })
    )
  );
}
