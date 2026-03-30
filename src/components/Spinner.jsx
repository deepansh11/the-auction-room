import React from "react";

export function Spinner() {
  return React.createElement("div", {
    style: { width:32, height:32, border:"3px solid #1e2230", borderTop:"3px solid #FFD700",
      borderRadius:"50%", animation:"spin 1s linear infinite", margin:"auto" }
  });
}
