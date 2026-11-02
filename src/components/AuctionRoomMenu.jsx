import React from "react";

export function AuctionRoomMenu({ roomCode, isHost, busy, backupPending, abandonedCount,
  onCopy, onBackup, onReadmit, onLeave, onSkip, pickerName }) {
  const ref = React.useRef(null);
  const [confirmLeave, setConfirmLeave] = React.useState(false);
  React.useEffect(() => {
    const outside = event => {
      if (ref.current && !ref.current.contains(event.target)) { ref.current.open = false; setConfirmLeave(false); }
    };
    const escape = event => { if (event.key === "Escape" && ref.current?.open) { ref.current.open = false; ref.current.querySelector("summary")?.focus(); setConfirmLeave(false); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, []);
  const action = callback => () => { ref.current.open = false; callback(); };
  return React.createElement("details", { ref, className: "auction-room-menu", onToggle: event => { if (!event.currentTarget.open) setConfirmLeave(false); } },
    React.createElement("summary", null, "Room options"),
    React.createElement("div", { className: "auction-room-menu__content" },
      roomCode && React.createElement("div", { className: "auction-muted" }, `Room ${roomCode}`),
      roomCode && React.createElement("button", { type: "button", onClick: action(onCopy) }, "Copy room code"),
      isHost && React.createElement("button", { type: "button", onClick: action(onBackup), disabled: backupPending }, backupPending ? "Downloading…" : "Download backup"),
      isHost && abandonedCount > 0 && React.createElement("button", { type: "button", onClick: action(onReadmit) }, `Readmit players (${abandonedCount})`),
      onSkip && React.createElement("button", { type: "button", onClick: action(onSkip), disabled: busy }, `Skip ${pickerName}`),
      !confirmLeave
        ? React.createElement("button", { type: "button", className: "auction-danger", disabled: busy, onClick: () => setConfirmLeave(true) }, isHost ? "Cancel auction…" : "Leave auction…")
        : React.createElement("div", { className: "auction-leave-confirm" },
          React.createElement("p", null, isHost ? "Cancel this auction for everyone?" : "Leave this auction? Your host will need to readmit you."),
          React.createElement("button", { type: "button", disabled: busy, className: "auction-danger", onClick: action(onLeave) }, isHost ? "Yes, cancel auction" : "Yes, leave auction"),
          React.createElement("button", { type: "button", onClick: () => setConfirmLeave(false) }, "Keep playing")
        )
    )
  );
}
