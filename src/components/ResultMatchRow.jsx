import React from "react";

export function ResultMatchRow({ fixture, groupLabel, canEdit, onSave, onUpload, teamLabels = {} }) {
  const homeLabel = teamLabels[fixture.home] || fixture.home;
  const awayLabel = teamLabels[fixture.away] || fixture.away;
  const homeAccessible = homeLabel === fixture.home ? fixture.home : `${homeLabel} (${fixture.home})`;
  const awayAccessible = awayLabel === fixture.away ? fixture.away : `${awayLabel} (${fixture.away})`;
  const [open, setOpen] = React.useState(false);
  const [home, setHome] = React.useState(fixture.homeGoals ?? "");
  const [away, setAway] = React.useState(fixture.awayGoals ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const id = React.useId();
  React.useEffect(() => {
    if (!open) { setHome(fixture.homeGoals ?? ""); setAway(fixture.awayGoals ?? ""); }
  }, [open, fixture.homeGoals, fixture.awayGoals]);
  const played = [fixture.homeGoals, fixture.awayGoals].every(value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
  const dirty = String(home) !== String(fixture.homeGoals ?? "") || String(away) !== String(fixture.awayGoals ?? "");
  const save = async event => {
    event.preventDefault();
    if (saving || !canEdit) return;
    if ((home === "") !== (away === "")) { setError("Enter both scores, or clear both to remove the result."); return; }
    setSaving(true); setError("");
    try { await onSave(groupLabel, fixture.id, home === "" ? null : Number(home), away === "" ? null : Number(away)); setOpen(false); }
    catch (error) { setError(error.message || "Could not save this result. Your changes are still here."); }
    finally { setSaving(false); }
  };
  return React.createElement("article", { className: "result-match" },
    React.createElement("button", { type: "button", className: "result-match-summary", "aria-expanded": open, "aria-controls": id,
      "aria-label": `${homeAccessible} vs ${awayAccessible}: ${played ? `${fixture.homeGoals}–${fixture.awayGoals}` : "not played"}`,
      onClick: () => { if (!saving) setOpen(value => !value); } },
      React.createElement("span", { className: "result-match-team" }, homeLabel, homeLabel !== fixture.home && React.createElement("small", { className: "result-match-owner" }, fixture.home)),
      React.createElement("strong", { className: "result-match-score" }, played ? `${fixture.homeGoals} – ${fixture.awayGoals}` : "vs"),
      React.createElement("span", { className: "result-match-team" }, awayLabel, awayLabel !== fixture.away && React.createElement("small", { className: "result-match-owner" }, fixture.away)),
      React.createElement("span", { className: "results-muted result-match-state" }, played ? "FT" : `Round ${fixture.round || 1}`),
      React.createElement("span", { className: "results-muted result-match-disclosure" }, open ? "Close ▴" : canEdit ? "Edit / stats ▾" : "Details ▾")
    ),
    open && React.createElement("div", { id, className: "result-match-editor" },
      canEdit ? React.createElement("form", { onSubmit: save },
        dirty && React.createElement("p", { className: "results-muted", role: "status" }, "Unsaved changes — use Save result to update the standings."),
        React.createElement("div", { className: "result-score-inputs" },
          React.createElement("label", null, homeAccessible,
            React.createElement("input", { type: "number", min: 0, step: 1, inputMode: "numeric", value: home, disabled: saving, onChange: event => setHome(event.target.value), "aria-label": `${fixture.home} goals` })),
          React.createElement("label", null, awayAccessible,
            React.createElement("input", { type: "number", min: 0, step: 1, inputMode: "numeric", value: away, disabled: saving, onChange: event => setAway(event.target.value), "aria-label": `${fixture.away} goals` }))
        ),
        error && React.createElement("p", { role: "alert", className: "results-error" }, error),
        React.createElement("div", { className: "results-actions" },
          React.createElement("button", { type: "submit", disabled: saving, className: "results-primary" }, saving ? "Saving…" : "Save result"),
          played && React.createElement("button", { type: "button", disabled: saving, onClick: () => { setHome(""); setAway(""); } }, "Clear score"),
          React.createElement("button", { type: "button", disabled: saving, onClick: () => onUpload({ ...fixture, groupLabel }) }, "Enter player stats")
        )
      ) : React.createElement("p", { className: "results-muted" }, "Only the host or teams in this match can edit the score or enter stats.")
    )
  );
}
