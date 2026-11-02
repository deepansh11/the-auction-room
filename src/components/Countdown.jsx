import React from "react";
import { deadlinePassed, formatCountdown } from "../lib/countdown.js";

// The parent only updates once at expiry, not once a second with the text.
export function useDeadlinePassed(deadlineAt) {
  const [passed, setPassed] = React.useState(() => deadlinePassed(deadlineAt));
  React.useEffect(() => {
    let timer;
    const check = () => {
      setPassed(deadlinePassed(deadlineAt));
      if (Number.isFinite(deadlineAt) && deadlineAt > Date.now()) {
        timer = setTimeout(check, Math.min(2147483647, deadlineAt - Date.now() + 5));
      }
    };
    check();
    return () => clearTimeout(timer);
  }, [deadlineAt]);
  return passed;
}

export function CountdownText({ deadlineAt }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    setNow(Date.now());
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (deadlinePassed(deadlineAt)) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadlineAt]);
  if (!Number.isFinite(deadlineAt) || deadlineAt <= 0) return "No listing deadline set";
  return deadlinePassed(deadlineAt, now) ? "Listing deadline reached" : `Listing deadline in ${formatCountdown(deadlineAt - now)}`;
}
