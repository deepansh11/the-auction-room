import React from "react";

export function ResponsiveAuctionPanel({ open, onClose, children }) {
  const [mobile, setMobile] = React.useState(() => typeof matchMedia !== "undefined" && matchMedia("(max-width: 760px)").matches);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const media = matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  React.useEffect(() => {
    const dialog = ref.current;
    if (!mobile || !dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [mobile, open]);
  if (!mobile) return React.createElement("aside", { className: "auction-sidebar", "aria-label": "Squad, teams and activity" }, children);
  return React.createElement("dialog", { ref, className: "auction-panel-dialog", "aria-label": "Squad, teams and activity", onCancel: onClose, onClose,
    onClick: event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } } },
    React.createElement("button", { className: "auction-panel-close", type: "button", onClick: onClose, autoFocus: true }, "Close panel ✕"),
    children
  );
}
