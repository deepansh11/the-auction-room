import React from "react";
import {
  apiCreateFixtureBallonDorUploadLink, apiGetBallonDorSubmissions, apiGetPublicBallonDorUploadContext,
  apiSaveBallonDorSubmission, apiSavePublicBallonDorSubmission,
} from "../lib/api.js";
import { BALLON_DOR_FORMULA, buildBallonDorRanking, manualStatRows, statCount } from "../../backend/shared/ballonDor.js";
import { generateBallonDorUploadLink } from "../utils/roomUtils.js";
import "../styles/matchStats.css";

const EMPTY = Object.freeze([]);
function upsert(submissions, next) {
  return [next, ...submissions.filter(submission => submission.id !== next.id)];
}

function PlayerLeaderboard({ submissions, loading, error, onRetry }) {
  const [limit, setLimit] = React.useState(20);
  const ranking = React.useMemo(() => buildBallonDorRanking(submissions).filter(player => player.goals || player.assists), [submissions]);
  return <section className="match-stats awards-table" aria-label="Ballon d’Or standings">
    <header className="match-stats__header"><div><h2>Ballon d’Or standings</h2><p>{BALLON_DOR_FORMULA}.</p></div>
      <button type="button" disabled={loading} onClick={onRetry}>{loading ? "Refreshing…" : "Refresh stats"}</button></header>
    <p className="match-stats__hint">Ratings and Player of the Match do not affect points. Existing saved goals and assists use this formula too.</p>
    {error && <p role="alert" className="match-stats__error">{error}</p>}
    {loading ? <p role="status">Loading match stats…</p> : ranking.length === 0 ? <p className="match-stats__hint">No goals or assists recorded yet.</p> : <>
      <div className="awards-table__head" aria-hidden="true"><span>#</span><span>Player</span><span>Goals</span><span>Assists</span><span>Points</span></div>
      <ol className="awards-table__list">{ranking.slice(0, limit).map((player, index) => <li key={player.playerKey} className="awards-table__row">
        <span className="match-stats__hint">{index + 1}</span>
        <div><strong>{player.playerName}</strong><small>{player.teams.join(", ")}</small></div>
        <span aria-label={`${player.goals} goals`}>{player.goals}</span><span aria-label={`${player.assists} assists`}>{player.assists}</span>
        <div className="awards-table__points"><strong>{player.ballonDorScore}</strong>{player.hatTrickCount > 0 && <small>+{player.hatTrickCount} bonus</small>}</div>
      </li>)}</ol>
      {ranking.length > limit && <button type="button" onClick={() => setLimit(value => value + 20)}>Show more players</button>}
      <p className="match-stats__hint">Ties: more goals, then more assists, then player name. A six-goal match earns two bonuses.</p>
    </>}
  </section>;
}

export function BallonDorPanel({ auctionResultId, participants = EMPTY, fixtures = EMPTY, user,
  mode = "standings", publicAccessToken = "", leagueName = "", onClose, canGenerateLink = false,
  selectedFixtureId = "", allowedTeamNames = EMPTY, modal = false }) {
  const isPublic = Boolean(publicAccessToken);
  const entryMode = mode === "upload" || mode === "entry"; // Keep the existing caller/API contract.
  const [submissions, setSubmissions] = React.useState([]);
  const [context, setContext] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const [fixtureId, setFixtureId] = React.useState(selectedFixtureId);
  const [teamName, setTeamName] = React.useState("");
  const [draft, setDraft] = React.useState({ key: "", rows: [] });
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [linkMessage, setLinkMessage] = React.useState("");
  const [linkBusy, setLinkBusy] = React.useState(false);
  const dialogRef = React.useRef(null);
  const titleId = React.useId();

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError("");
    const request = isPublic
      ? apiGetPublicBallonDorUploadContext(auctionResultId, publicAccessToken, selectedFixtureId)
      : user?.token ? apiGetBallonDorSubmissions(auctionResultId, user.token) : Promise.reject(new Error("Sign in to view or enter match stats."));
    request.then(data => {
      if (cancelled) return;
      if (isPublic) { setContext(data); setSubmissions(data.submissions || []); }
      else setSubmissions(data);
    }).catch(error => { if (!cancelled) setLoadError(error.message || "Could not load match stats."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [auctionResultId, isPublic, publicAccessToken, selectedFixtureId, user?.token, loadAttempt]);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (modal && entryMode && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [modal, entryMode]);

  const resolvedFixtures = isPublic ? context?.fixtures || EMPTY : fixtures;
  const resolvedTeams = isPublic ? context?.participants || EMPTY : participants;
  const fixedFixtureId = isPublic ? context?.fixedFixtureId || selectedFixtureId : selectedFixtureId;
  const activeFixtureId = fixedFixtureId || fixtureId;
  const activeFixture = resolvedFixtures.find(fixture => String(fixture.id) === String(activeFixtureId));
  const availableTeams = React.useMemo(() => {
    if (!activeFixture) return [];
    const names = new Set([activeFixture.home, activeFixture.away]);
    return resolvedTeams.filter(team => names.has(team.name) && (!allowedTeamNames.length || allowedTeamNames.includes(team.name))
      && (isPublic || canGenerateLink || team.name === user?.username));
  }, [activeFixture, resolvedTeams, allowedTeamNames, isPublic, canGenerateLink, user?.username]);
  React.useEffect(() => {
    if (!fixedFixtureId && !resolvedFixtures.some(fixture => String(fixture.id) === String(fixtureId))) setFixtureId(String(resolvedFixtures[0]?.id || ""));
  }, [fixedFixtureId, fixtureId, resolvedFixtures]);
  React.useEffect(() => {
    if (!availableTeams.some(team => team.name === teamName)) setTeamName(availableTeams.find(team => team.name === user?.username)?.name || availableTeams[0]?.name || "");
  }, [availableTeams, teamName, user?.username]);
  const selectedTeam = availableTeams.find(team => team.name === teamName);
  const saved = React.useMemo(() => submissions.find(submission => String(submission.fixtureId) === String(activeFixtureId) && submission.mappedParticipantName === teamName), [submissions, activeFixtureId, teamName]);
  const draftKey = JSON.stringify([auctionResultId, activeFixtureId, teamName]);
  React.useEffect(() => {
    if (draft.key !== draftKey || !dirtyRef.current) {
      setDraft({ key: draftKey, rows: manualStatRows(selectedTeam, saved) });
      dirtyRef.current = false; setDirty(false);
    }
  }, [draftKey, selectedTeam, saved, draft.key]);

  const canDiscard = () => !dirtyRef.current || window.confirm("Discard your unsaved player stats?");
  const select = callback => { if (!savingRef.current && canDiscard()) { dirtyRef.current = false; setDirty(false); setError(""); setSuccess(""); callback(); } };
  const requestClose = () => { if (!savingRef.current && canDiscard()) onClose?.(); };
  const updateRow = (id, field, value) => {
    dirtyRef.current = true; setDirty(true); setError(""); setSuccess("");
    setDraft(previous => ({ ...previous, rows: previous.rows.map(player => player.id === id ? { ...player, [field]: value } : player) }));
  };
  const save = async event => {
    event.preventDefault();
    if (savingRef.current || loading || loadError) return;
    if (!activeFixture || !selectedTeam || !draft.rows.length || draft.key !== draftKey) { setError("Choose a match and team with a squad before saving."); return; }
    if (draft.rows.some(player => statCount(player.goals) === null || statCount(player.assists) === null)) { setError("Goals and assists must be non-negative whole numbers."); return; }
    savingRef.current = true; setSaving(true); setError(""); setSuccess("");
    try {
      const payload = { fixtureId: String(activeFixtureId), mappedParticipantName: teamName,
        players: draft.rows.map(player => ({ id: player.id, name: player.name, goals: statCount(player.goals), assists: statCount(player.assists) })) };
      const savedSubmission = isPublic
        ? await apiSavePublicBallonDorSubmission(auctionResultId, payload, publicAccessToken, fixedFixtureId)
        : await apiSaveBallonDorSubmission(auctionResultId, payload, user?.token);
      dirtyRef.current = false; setDirty(false);
      setSubmissions(previous => upsert(previous, savedSubmission));
      setSuccess("Stats saved. Saving again replaces this team’s stats for this match—it won’t add them twice.");
    } catch (error) { setError(error.message || "Could not save. Your changes are still here."); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const copyLink = async () => {
    if (!activeFixtureId || linkBusy) return;
    setLinkBusy(true); setLinkMessage("");
    try {
      const data = await apiCreateFixtureBallonDorUploadLink(auctionResultId, activeFixtureId, user.token);
      await navigator.clipboard.writeText(generateBallonDorUploadLink(auctionResultId, data.uploadToken, activeFixtureId));
      setLinkMessage("Match stats link copied.");
    } catch (error) { setLinkMessage(error.message || "Could not copy the link."); }
    finally { setLinkBusy(false); }
  };

  if (!entryMode) return <PlayerLeaderboard submissions={submissions} loading={loading} error={loadError} onRetry={() => setLoadAttempt(value => value + 1)} />;
  const Tag = modal ? "dialog" : "section";
  const rows = draft.key === draftKey ? draft.rows : [];
  return <Tag ref={modal ? dialogRef : undefined} className={`match-stats match-stats-editor${modal ? " match-stats-dialog" : ""}`} aria-labelledby={titleId}
    onCancel={modal ? event => { event.preventDefault(); requestClose(); } : undefined}
    onClick={modal ? event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose();
    } : undefined}>
    <header className="match-stats__header"><div><h2 id={titleId}>Player match stats</h2>
      <p>{activeFixture ? `${activeFixture.home} vs ${activeFixture.away}` : "Choose a match"}{(context?.leagueName || leagueName) ? ` · ${context?.leagueName || leagueName}` : ""}</p></div>
      {onClose && <button type="button" onClick={requestClose} disabled={saving}>Close ✕</button>}</header>
    <p className="match-stats__hint">Enter goals and assists. Leave zero for players without a contribution.</p>
    {loadError && <div role="alert" className="match-stats__error">{loadError} <button type="button" onClick={() => setLoadAttempt(value => value + 1)}>Try again</button></div>}
    {loading && <p role="status">Loading saved match stats…</p>}
    <form onSubmit={save} noValidate>
      <fieldset disabled={saving || loading || Boolean(loadError)}>
        <div className="match-stats__selection">
          {!fixedFixtureId && <label>Match<select aria-label="Stats match" value={fixtureId} onChange={event => select(() => setFixtureId(event.target.value))}>
            <option value="">Select match</option>{resolvedFixtures.map(fixture => <option key={fixture.id} value={fixture.id}>{fixture.home} vs {fixture.away}</option>)}</select></label>}
          <label>Team<select aria-label="Stats team" value={teamName} onChange={event => select(() => setTeamName(event.target.value))}>
            <option value="">Select team</option>{availableTeams.map(team => <option key={team.name} value={team.name}>{team.name}</option>)}</select></label>
        </div>
        {saved && <p className="match-stats__hint">Saved stats loaded for this team. Edit them below to make a correction.</p>}
        <div className="match-stats__row match-stats__row--head" aria-hidden="true"><span>Player</span><span>Goals</span><span>Assists</span></div>
        <div className="match-stats__players">{rows.map(player => <div key={player.id} className="match-stats__row">
          <div><strong>{player.name}</strong>{player.pos && <small>{player.pos}</small>}{player.legacy && <small>Previously saved entry</small>}</div>
          {["goals", "assists"].map(field => <input key={field} type="number" min="0" step="1" inputMode="numeric" value={player[field]}
            aria-label={`${player.name} ${field}`} onChange={event => updateRow(player.id, field, event.target.value)} />)}
        </div>)}</div>
        {!rows.length && !loading && <p className="match-stats__hint">No squad is available for this team. Ask the host to check the auction result.</p>}
        {error && <p role="alert" className="match-stats__error">{error}</p>}
        {success && <p role="status" className="match-stats__success">{success}</p>}
        <footer className="match-stats__footer">
          <span className="match-stats__hint">{dirty ? "Unsaved changes" : ""}</span>
          {dirty && <button type="button" onClick={() => { setDraft({ key: draftKey, rows: manualStatRows(selectedTeam, saved) }); dirtyRef.current = false; setDirty(false); setError(""); }}>Discard changes</button>}
          <button type="submit" className="match-stats__save" disabled={!rows.length || !teamName}>{saving ? "Saving…" : "Save goals & assists"}</button>
        </footer>
      </fieldset>
    </form>
    <details className="match-stats__more"><summary>Scoring & sharing</summary><p>{BALLON_DOR_FORMULA}. Ratings and Player of the Match are not used.</p>
      {!isPublic && canGenerateLink && user?.token && <button type="button" disabled={!activeFixtureId || linkBusy || saving} onClick={copyLink}>{linkBusy ? "Copying…" : "Copy match stats link"}</button>}
      {linkMessage && <p role="status">{linkMessage}</p>}</details>
  </Tag>;
}
