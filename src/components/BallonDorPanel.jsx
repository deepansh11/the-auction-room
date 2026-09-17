import React from "react";
import { recognize } from "tesseract.js";
import {
  apiCreateFixtureBallonDorUploadLink,
  apiGetBallonDorSubmissions,
  apiGetPublicBallonDorUploadContext,
  apiSaveBallonDorSubmission,
  apiSavePublicBallonDorSubmission,
} from "../lib/api.js";
import { buildBallonDorRanking, extractFeaturedPlayerCard, parsePerformanceCaptureText, validatePerformanceCaptureDraft } from "../utils/performanceCapture.js";
import { generateBallonDorUploadLink } from "../utils/roomUtils.js";

function emptyPlayerRow(index) {
  return {
    id: `manual-${index}-${Date.now()}`,
    name: "",
    rating: "",
    goals: "",
    assists: "",
    isPlayerOfTheMatch: false,
  };
}

function emptyDraft() {
  return {
    markers: {},
    players: [],
    rawText: "",
  };
}

function surfaceStyle() {
  return {
    background: "#0d1119",
    border: "1px solid #1f2937",
    borderRadius: 16,
    padding: 16,
  };
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function computeOcrQualityScore(text, parsed) {
  const normalizedText = String(text || "").replace(/,/g, ".");
  const lines = normalizedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rosterLines = lines.filter((line) => /^(GK|RB|LB|CB|RCB|LCB|RWB|LWB|CDM|RDM|LDM|CM|RCM|LCM|CAM|RAM|LAM|RM|LM|RW|LW|RF|LF|CF|ST|AM|DM)\b/i.test(line));
  const decimalRatings = rosterLines.reduce((count, line) => count + (/\b(?:[4-9]\.\d|10(?:\.0)?)\b/.test(line) ? 1 : 0), 0);
  const scoredRows = rosterLines.reduce((count, line) => count + (/\b(?:[4-9]\.\d|10(?:\.0)?)\b.*\b\d+\b.*\b\d+\b/.test(line) ? 1 : 0), 0);
  const detectedCount = parsed.players.length - (parsed.missingVisiblePlayerCount || 0);
  const ratedCount = (parsed.players || []).filter((player) => Number.isFinite(Number(player?.rating))).length;
  const namedCount = (parsed.players || []).filter((player) => String(player?.name || "").trim()).length;
  return (detectedCount * 1000) + (namedCount * 50) + (ratedCount * 15) + (decimalRatings * 12) + (scoredRows * 8);
}

function preprocessForOcr(file, crop, { contrast = 1.35, saturation = 1.2, threshold = 185 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const sourceX = Math.max(0, Math.floor(img.width * crop.x));
      const sourceY = Math.max(0, Math.floor(img.height * crop.y));
      const sourceWidth = Math.max(1, Math.floor(img.width * crop.width));
      const sourceHeight = Math.max(1, Math.floor(img.height * crop.height));
      const scale = Math.min(2.2, 1900 / Math.max(sourceWidth || 1, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(900, Math.ceil(sourceWidth * scale));
      canvas.height = Math.max(300, Math.ceil(sourceHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not prepare the uploaded image for scanning."));
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = `contrast(${contrast}) saturate(${saturation})`;
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      if (Number.isFinite(threshold)) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        for (let i = 0; i < data.length; i += 4) {
          const luminance = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          const target = luminance > threshold ? 255 : 0;
          data[i] = target;
          data[i + 1] = target;
          data[i + 2] = target;
        }
        ctx.putImageData(imageData, 0, 0);
      }
      URL.revokeObjectURL(objectUrl);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read the selected image."));
    };
    img.src = objectUrl;
  });
}

async function scanRosterRegion(file) {
  const variants = [
    {
      crop: { x: 0.02, y: 0.14, width: 0.54, height: 0.78 },
      image: { contrast: 1.35, saturation: 1.2, threshold: 185 },
    },
    {
      crop: { x: 0.015, y: 0.135, width: 0.565, height: 0.79 },
      image: { contrast: 1.45, saturation: 1.1, threshold: 176 },
    },
    {
      crop: { x: 0.015, y: 0.27, width: 0.79, height: 0.61 },
      image: { contrast: 1.45, saturation: 1.05, threshold: 170 },
    },
    {
      crop: { x: 0.012, y: 0.11, width: 0.58, height: 0.82 },
      image: { contrast: 1.2, saturation: 1.05, threshold: null },
    },
    {
      crop: { x: 0.08, y: 0.19, width: 0.74, height: 0.5 },
      image: { contrast: 1.3, saturation: 1.1, threshold: null },
    },
  ];

  let bestResult = { text: "", parsed: emptyDraft(), detectedCount: 0, missingCount: Number.POSITIVE_INFINITY };
  for (const variant of variants) {
    const processedCanvas = await withTimeout(
      preprocessForOcr(file, variant.crop, variant.image),
      5000,
      "Image preprocessing timed out."
    );
    const result = await withTimeout(
      recognize(processedCanvas, "eng", { logger: () => undefined }),
      18000,
      "OCR scan timed out."
    );
    const text = String(result?.data?.text || "").trim();
    const parsed = parsePerformanceCaptureText(text);
    const detectedCount = parsed.players.length - (parsed.missingVisiblePlayerCount || 0);
    const missingCount = parsed.missingVisiblePlayerCount || 0;
    const ratedCount = (parsed.players || []).filter((player) => Number.isFinite(Number(player?.rating))).length;
    const qualityScore = computeOcrQualityScore(text, parsed);
    const bestQualityScore = bestResult.qualityScore ?? Number.NEGATIVE_INFINITY;
    if (
      qualityScore > bestQualityScore
      || (
        qualityScore === bestQualityScore
        && (detectedCount > bestResult.detectedCount
          || (detectedCount === bestResult.detectedCount && missingCount < bestResult.missingCount))
      )
    ) {
      bestResult = { text, parsed, detectedCount, missingCount, qualityScore };
    }
    if (detectedCount >= 12 && ratedCount >= 10) {
      break;
    }
  }

  const featuredCard = extractFeaturedPlayerCard(bestResult.text, bestResult.parsed?.lines || []);
  if (featuredCard?.name) {
    const ratingRecoveryVariant = {
      crop: { x: 0.63, y: 0.08, width: 0.18, height: 0.18 },
      image: { contrast: 1.4, saturation: 1.05, threshold: null },
    };
    const ratingRecoveryCanvas = await withTimeout(
      preprocessForOcr(file, ratingRecoveryVariant.crop, ratingRecoveryVariant.image),
      5000,
      "Image preprocessing timed out."
    );
    const ratingRecoveryResult = await withTimeout(
      recognize(ratingRecoveryCanvas, "eng", { logger: () => undefined }),
      18000,
      "OCR scan timed out."
    );
    const ratingRecoveryText = String(ratingRecoveryResult?.data?.text || "").trim();
    const ratingMatch = ratingRecoveryText.match(/\b(10(?:\.0)?|[4-9](?:\.\d)?)\b/);
    const featuredRating = ratingMatch ? Number.parseFloat(ratingMatch[1]) : null;
    const bestKeys = (bestResult.parsed?.players || []).map((player) => normalizePlayerKey(player?.name || ""));
    const featuredKey = normalizePlayerKey(featuredCard.name);
    if (featuredKey && !bestKeys.includes(featuredKey)) {
      const featuredPlayerRow = {
        id: `scan-featured-${Date.now()}`,
        name: featuredCard.name,
        rating: Number.isFinite(featuredRating) ? featuredRating : "",
        goals: 0,
        assists: 0,
        isPlayerOfTheMatch: false,
      };
      const mergedPlayers = [featuredPlayerRow, ...(bestResult.parsed.players || [])];
      bestResult = {
        ...bestResult,
        parsed: {
          ...bestResult.parsed,
          players: mergedPlayers,
          missingVisiblePlayerCount: Math.max(0, (bestResult.parsed.missingVisiblePlayerCount || 0) - 1),
        },
        detectedCount: mergedPlayers.length,
        missingCount: Math.max(0, (bestResult.missingCount || 0) - 1),
      };
    }
  }

  return bestResult;
}

function normalizeParticipants(participants = []) {
  return (Array.isArray(participants) ? participants : [])
    .map((participant) => typeof participant === "string" ? { name: participant } : participant)
    .filter((participant) => participant?.name);
}

function PlayerLeaderboard({ submissions, loading, title = "Ballon d'Or Table", subtitle = "" }) {
  const ranking = React.useMemo(() => buildBallonDorRanking(submissions), [submissions]);
  const leader = ranking[0];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={surfaceStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, color: "#FFD700", letterSpacing: 2 }}>{title}</div>
            {subtitle ? <div style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: "#8ea0ba", marginTop: 4 }}>{subtitle}</div> : null}
          </div>
          <div style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" }}>
            {loading ? "Loading…" : `${submissions.length} reviewed uploads`}
          </div>
        </div>
        {loading ? (
          <div style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: "#7f8ea6" }}>Loading submissions…</div>
        ) : !leader ? (
          <div style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: "#7f8ea6" }}>No performance uploads yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ background: "linear-gradient(135deg,#151f2f,#0f1726)", border: "1px solid rgba(255,215,0,.25)", borderRadius: 18, padding: 18 }}>
              <div style={{ fontFamily: "'Rajdhani'", fontSize: 11, color: "#FFD700", letterSpacing: 2, textTransform: "uppercase" }}>Current leader</div>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 34, color: "#fff", letterSpacing: 2, marginTop: 6 }}>{leader.playerName}</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12 }}>
                <div><div style={{ fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" }}>Score</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, color: "#FFD700" }}>{leader.ballonDorScore}</div></div>
                <div><div style={{ fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" }}>RR</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, color: "#4FC3F7" }}>{leader.averageRating || "—"}</div></div>
                <div><div style={{ fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" }}>G</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, color: "#8fe7c0" }}>{leader.goals}</div></div>
                <div><div style={{ fontFamily: "'Rajdhani'", fontSize: 11, color: "#7f8ea6" }}>AST</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 26, color: "#8fe7c0" }}>{leader.assists}</div></div>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {ranking.slice(0, 20).map((entry, index) => (
                <div key={entry.playerName} style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) repeat(4,70px)", gap: 10, alignItems: "center", background: "#08111a", border: "1px solid #1e293b", borderRadius: 12, padding: "10px 12px" }}>
                  <div style={{ fontFamily: "'Bebas Neue'", fontSize: 18, color: index === 0 ? "#FFD700" : "#8ea0ba" }}>#{index + 1}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Exo 2'", fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.playerName}</div>
                    <div style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" }}>{entry.teams.join(", ") || "—"}</div>
                  </div>
                  <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Rajdhani'", fontSize: 10, color: "#7f8ea6" }}>Score</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, color: "#FFD700" }}>{entry.ballonDorScore}</div></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Rajdhani'", fontSize: 10, color: "#7f8ea6" }}>RR</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, color: "#4FC3F7" }}>{entry.averageRating || "—"}</div></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Rajdhani'", fontSize: 10, color: "#7f8ea6" }}>G</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, color: "#8fe7c0" }}>{entry.goals}</div></div>
                  <div style={{ textAlign: "center" }}><div style={{ fontFamily: "'Rajdhani'", fontSize: 10, color: "#7f8ea6" }}>AST</div><div style={{ fontFamily: "'Bebas Neue'", fontSize: 20, color: "#8fe7c0" }}>{entry.assists}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function BallonDorPanel({
  auctionResultId,
  participants = [],
  fixtures = [],
  user,
  mode = "standings",
  publicAccessToken = "",
  leagueName = "",
  onClose,
  canGenerateLink = false,
  selectedFixtureId = "",
  allowedTeamNames = [],
}) {
  const isPublicUpload = Boolean(publicAccessToken);
  const isUploadMode = mode === "upload";
  const participantOptions = normalizeParticipants(participants);

  const [submissions, setSubmissions] = React.useState([]);
  const [loading, setLoading] = React.useState(!isPublicUpload);
  const [saving, setSaving] = React.useState(false);
  const [ocrBusy, setOcrBusy] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [selectedFileName, setSelectedFileName] = React.useState("");
  const [draft, setDraft] = React.useState(emptyDraft);
  const [mappedParticipantName, setMappedParticipantName] = React.useState("");
  const [fixtureId, setFixtureId] = React.useState("");
  const [error, setError] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [copiedLink, setCopiedLink] = React.useState("");
  const [publicContext, setPublicContext] = React.useState({ loading: isPublicUpload, leagueName: "", participants: [], fixtures: [], fixedFixtureId: "" });
  const [compactLayout, setCompactLayout] = React.useState(() => (typeof window !== "undefined" ? window.innerWidth < 720 : false));
  const fileInputRef = React.useRef(null);

  const resolvedLeagueName = isPublicUpload ? publicContext.leagueName : leagueName;
  const fixedFixtureId = isPublicUpload ? publicContext.fixedFixtureId : selectedFixtureId;
  const resolvedFixtures = React.useMemo(() => {
    const source = isPublicUpload ? publicContext.fixtures : fixtures;
    return (Array.isArray(source) ? source : []).filter((fixture) => fixture?.home && fixture?.away);
  }, [fixtures, isPublicUpload, publicContext.fixtures]);
  const fixtureScopedTeams = React.useMemo(() => {
    if (!fixedFixtureId) return [];
    const fixture = resolvedFixtures.find((item) => String(item.id) === String(fixedFixtureId));
    return fixture ? [fixture.home, fixture.away] : [];
  }, [fixedFixtureId, resolvedFixtures]);
  const resolvedParticipants = React.useMemo(() => {
    const baseParticipants = isPublicUpload ? publicContext.participants : participantOptions;
    const whitelist = new Set((allowedTeamNames.length > 0 ? allowedTeamNames : fixtureScopedTeams).map((name) => String(name)));
    if (whitelist.size === 0) return baseParticipants;
    return baseParticipants.filter((participant) => whitelist.has(participant.name));
  }, [allowedTeamNames, fixtureScopedTeams, isPublicUpload, participantOptions, publicContext.participants]);

  React.useEffect(() => {
    if (!isPublicUpload) return undefined;
    let cancelled = false;
    setPublicContext({ loading: true, leagueName: "", participants: [], fixtures: [], fixedFixtureId: selectedFixtureId || "" });
    apiGetPublicBallonDorUploadContext(auctionResultId, publicAccessToken, selectedFixtureId)
      .then((data) => {
        if (cancelled) return;
        setPublicContext({
          loading: false,
          leagueName: data.leagueName,
          participants: normalizeParticipants(data.participantNames),
          fixtures: Array.isArray(data.fixtures) ? data.fixtures : [],
          fixedFixtureId: data.fixedFixtureId || "",
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load upload page");
        setPublicContext((prev) => ({ ...prev, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [auctionResultId, isPublicUpload, publicAccessToken, selectedFixtureId]);

  const loadSubmissions = React.useCallback(async () => {
    if (isPublicUpload || !auctionResultId || !user?.token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await apiGetBallonDorSubmissions(auctionResultId, user.token);
      setSubmissions(Array.isArray(next) ? next : []);
    } catch (err) {
      setError(err.message || "Failed to load Ballon dOr submissions");
    } finally {
      setLoading(false);
    }
  }, [auctionResultId, isPublicUpload, user?.token]);

  React.useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  React.useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const filteredFixtures = React.useMemo(() => {
    const fixtureFiltered = fixedFixtureId
      ? resolvedFixtures.filter((fixture) => String(fixture.id) === String(fixedFixtureId))
      : resolvedFixtures;
    if (!mappedParticipantName) return fixtureFiltered;
    return fixtureFiltered.filter((fixture) => fixture.home === mappedParticipantName || fixture.away === mappedParticipantName);
  }, [fixedFixtureId, mappedParticipantName, resolvedFixtures]);

  React.useEffect(() => {
    if (!fixtureId) {
      if (filteredFixtures.length >= 1) setFixtureId(String(filteredFixtures[0].id));
      return;
    }
    if (!filteredFixtures.some((fixture) => String(fixture.id) === String(fixtureId))) {
      setFixtureId(filteredFixtures.length >= 1 ? String(filteredFixtures[0].id) : "");
    }
  }, [filteredFixtures, fixtureId]);

  React.useEffect(() => {
    if (resolvedParticipants.length === 1 && !mappedParticipantName) {
      setMappedParticipantName(resolvedParticipants[0].name);
    }
  }, [mappedParticipantName, resolvedParticipants]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const updateLayout = () => setCompactLayout(window.innerWidth < 720);
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  React.useEffect(() => {
    if (mappedParticipantName || resolvedParticipants.length === 0) return;
    const preferredTeam = resolvedParticipants.find((participant) => participant.name === user?.name)
      || resolvedParticipants[0];
    if (preferredTeam?.name) {
      setMappedParticipantName(preferredTeam.name);
    }
  }, [mappedParticipantName, resolvedParticipants, user?.name]);

  const validation = React.useMemo(() => validatePerformanceCaptureDraft({
    mappedParticipantName,
    fixtureId,
    draft,
    participants: resolvedParticipants,
    fixtures: resolvedFixtures,
  }), [draft, fixtureId, mappedParticipantName, resolvedFixtures, resolvedParticipants]);

  const processPickedImage = async (file) => {
    if (!file || !file.type?.startsWith("image/")) {
      setError("Please paste or upload a valid image file.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setSelectedFileName(file.name || "Pasted image");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    setOcrBusy(true);

    try {
      const scanResult = await scanRosterRegion(file);
      const rosterText = String(scanResult?.text || "").trim();
      const parsed = scanResult?.parsed || parsePerformanceCaptureText(rosterText);
      if (!rosterText) {
        throw new Error("The scan took too long or could not read text from this image.");
      }
      setDraft(parsed.players.length > 0 ? parsed : { ...parsed, players: [emptyPlayerRow(1)] });
      if (parsed.players.length === 0) {
        setError("The scan finished, but it could not detect enough player rows. You can still fill them in manually.");
      } else if (parsed.missingVisiblePlayerCount > 0) {
        setSuccessMessage(`Scanned ${parsed.players.length - parsed.missingVisiblePlayerCount} player row(s). Added ${parsed.missingVisiblePlayerCount} blank row(s) so you can finish the missing visible players manually.`);
      } else {
        setSuccessMessage(`Scanned ${parsed.players.length} player row(s). Review them and save.`);
      }
    } catch (err) {
      setDraft({ ...emptyDraft(), players: [emptyPlayerRow(1)] });
      setError(`Could not scan this image. You can still enter the data manually. ${err.message || ""}`.trim());
    } finally {
      setOcrBusy(false);
    }
  };

  const handleFilePicked = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await processPickedImage(file);
  };

  const handlePasteImage = React.useCallback((event) => {
    const clipboardItems = event.clipboardData?.items || [];
    const imageItem = Array.from(clipboardItems).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;

    event.preventDefault();
    const file = imageItem.getAsFile();
    if (file) {
      processPickedImage(file);
    }
  }, [processPickedImage]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.addEventListener("paste", handlePasteImage);
    return () => window.removeEventListener("paste", handlePasteImage);
  }, [handlePasteImage]);

  const updatePlayer = (rowId, field, value) => {
    setDraft((prev) => ({
      ...prev,
      players: (prev.players || []).map((player) => player.id === rowId ? { ...player, [field]: value } : player),
    }));
  };

  const addManualRow = () => {
    setDraft((prev) => ({
      ...prev,
      players: [...(prev.players || []), emptyPlayerRow((prev.players || []).length + 1)],
    }));
  };

  const removeRow = (rowId) => {
    setDraft((prev) => ({
      ...prev,
      players: (prev.players || []).filter((player) => player.id !== rowId),
    }));
  };

  const resetDraft = ({ preserveTeam = true, preserveFixture = false, preserveSuccess = false } = {}) => {
    setDraft(emptyDraft());
    if (!preserveFixture) setFixtureId("");
    setSelectedFileName("");
    if (!preserveSuccess) setSuccessMessage("");
    if (!preserveTeam) setMappedParticipantName("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
  };

  const handleCopyUploadLink = async () => {
    if (!auctionResultId || !user?.token || !fixtureId) return;
    setError("");
    try {
      const linkData = await apiCreateFixtureBallonDorUploadLink(auctionResultId, fixtureId, user.token);
      const shareLink = generateBallonDorUploadLink(auctionResultId, linkData.uploadToken, fixtureId);
      await navigator.clipboard.writeText(shareLink);
      setCopiedLink("Upload link copied");
      window.setTimeout(() => setCopiedLink(""), 2200);
    } catch (err) {
      setError(err.message || "Failed to generate upload link");
    }
  };

  const handleSave = async () => {
    const players = (draft.players || [])
      .map((player) => ({
        ...player,
        name: String(player.name || "").trim(),
        rating: player.rating === "" ? null : Number(player.rating),
        goals: player.goals === "" ? 0 : Number(player.goals || 0),
        assists: player.assists === "" ? 0 : Number(player.assists || 0),
        isPlayerOfTheMatch: Boolean(player.isPlayerOfTheMatch),
      }))
      .filter((player) => player.name);

    if (!mappedParticipantName || !fixtureId || players.length === 0) {
      setError("Select the team, match and at least one player row before saving.");
      return;
    }

    const fixture = resolvedFixtures.find((item) => String(item.id) === String(fixtureId));
    setSaving(true);
    setError("");
    setSuccessMessage("");
    try {
      const payload = {
        fixtureId,
        fixtureLabel: fixture ? `${fixture.home} vs ${fixture.away}` : fixtureId,
        mappedParticipantName,
        sourceFileName: selectedFileName || "",
        validation,
        players,
        submittedBy: isPublicUpload ? mappedParticipantName : user?.username || mappedParticipantName,
      };
      if (isPublicUpload) {
        await apiSavePublicBallonDorSubmission(auctionResultId, payload, publicAccessToken, fixedFixtureId);
      } else {
        await apiSaveBallonDorSubmission(auctionResultId, payload, user?.token);
        await loadSubmissions();
      }
      setSuccessMessage("Performance upload saved.");
      resetDraft({ preserveTeam: true, preserveFixture: true, preserveSuccess: true });
    } catch (err) {
      setError(err.message || "Failed to save Ballon dOr submission");
    } finally {
      setSaving(false);
    }
  };

  if (!isUploadMode) {
    return (
      <PlayerLeaderboard
        submissions={submissions}
        loading={loading}
        title="Ballon d'Or Standings"
        subtitle="Live leaderboard from reviewed match-by-match player uploads."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={surfaceStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 8 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue'", fontSize: 28, color: "#FFD700", letterSpacing: 2 }}>
              {isPublicUpload ? "Upload Match Performance" : "Review Match Performance"}
            </div>
            <p style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: "#8ea0ba", lineHeight: 1.6, margin: "8px 0 0" }}>
              Upload only the player table. We scan the roster rows in-browser and save only the reviewed player stats.
            </p>
            {resolvedLeagueName ? <div style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6", marginTop: 8 }}>{resolvedLeagueName}</div> : null}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {!isPublicUpload && canGenerateLink && user?.token ? (
              <button onClick={handleCopyUploadLink} disabled={!fixtureId} style={{ background: "#0d1119", color: "#8fe7c0", border: "1px solid rgba(143,231,192,.28)", borderRadius: 999, padding: "10px 16px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 13, letterSpacing: 1, opacity: fixtureId ? 1 : 0.55 }}>
                COPY PLAYER UPLOAD LINK
              </button>
            ) : null}
            {onClose ? (
              <button onClick={onClose} style={{ background: "transparent", color: "#a7b1c2", border: "1px solid #263247", borderRadius: 999, padding: "10px 16px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 13, letterSpacing: 1 }}>
                CLOSE
              </button>
            ) : null}
          </div>
        </div>
        {copiedLink ? <div style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#8fe7c0", marginTop: 10 }}>{copiedLink}</div> : null}
        {!!error ? <div style={{ marginTop: 12, color: "#ff8aa9", fontFamily: "'Rajdhani'", fontSize: 13 }}>{error}</div> : null}
        {!!successMessage ? <div style={{ marginTop: 12, color: "#8fe7c0", fontFamily: "'Rajdhani'", fontSize: 13 }}>{successMessage}</div> : null}
      </div>

      {publicContext.loading ? (
        <div style={surfaceStyle()}>
          <div style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: "#7f8ea6" }}>Loading upload details…</div>
        </div>
      ) : (
        <React.Fragment>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
            <div style={surfaceStyle()}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: "#4FC3F7", letterSpacing: 2, marginBottom: 10 }}>Upload & Validate</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <button onClick={() => fileInputRef.current?.click()} style={{ background: "linear-gradient(135deg,#4FC3F7,#8fe7c0)", color: "#06110c", border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 14, letterSpacing: 1 }}>
                  {ocrBusy ? "SCANNING…" : "UPLOAD PLAYER TABLE"}
                </button>
                <button onClick={addManualRow} style={{ background: "#0d1119", color: "#e8f7ef", border: "1px solid #263247", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 14, letterSpacing: 1 }}>
                  ADD MANUAL ROW
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFilePicked} style={{ display: "none" }} />
              <div style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6", lineHeight: 1.6 }}>
               Keep only the <strong>player table</strong> visible in the screenshot — player names, RR, G and AST. You can also paste an image directly with Ctrl/Cmd + V.
              </div>
              {draft.missingVisiblePlayerCount > 0 ? (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #FFD70044", background: "#FFD70012", color: "#f7d774", fontFamily: "'Rajdhani'", fontSize: 12, lineHeight: 1.6 }}>
                  OCR missed some visible rows, so blank placeholders were added below. Fill those manually, then save.
                </div>
              ) : null}
              {selectedFileName ? <div style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba", marginTop: 12 }}>Source file: {selectedFileName}</div> : null}
              {previewUrl ? <img src={previewUrl} alt="Performance upload preview" style={{ width: "100%", borderRadius: 14, border: "1px solid #263247", objectFit: "cover", maxHeight: 260, marginTop: 12 }} /> : null}
            </div>

            <div style={surfaceStyle()}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: "#4FC3F7", letterSpacing: 2, marginBottom: 10 }}>Validation</div>
              <div style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: validation.status === "ready" ? "#8fe7c0" : "#FFD700", fontWeight: 700, marginBottom: 10 }}>
                {validation.status === "ready" ? "READY TO SAVE" : "NEEDS REVIEW"}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#9aa5b5", fontFamily: "'Rajdhani'", fontSize: 13, lineHeight: 1.6 }}>
                {validation.warnings.length === 0
                  ? <li>Scan looks good. Review and save whenever ready.</li>
                  : validation.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16, alignItems: "start" }}>
            <div style={surfaceStyle()}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 2, marginBottom: 12 }}>Review Upload</div>
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" }}>League team</span>
                  <select value={mappedParticipantName} onChange={(event) => setMappedParticipantName(event.target.value)} style={{ background: "#09111b", color: "#fff", border: "1px solid #263247", borderRadius: 10, padding: "10px 12px" }}>
                    <option value="">Select team</option>
                    {resolvedParticipants.map((participant) => <option key={participant.name} value={participant.name}>{participant.name}</option>)}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontFamily: "'Rajdhani'", fontSize: 12, color: "#7f8ea6" }}>Match</span>
                  <select value={fixtureId} onChange={(event) => setFixtureId(event.target.value)} style={{ background: "#09111b", color: "#fff", border: "1px solid #263247", borderRadius: 10, padding: "10px 12px" }}>
                    <option value="">Select fixture</option>
                    {filteredFixtures.map((fixture) => <option key={fixture.id} value={fixture.id}>{fixture.home} vs {fixture.away}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div style={surfaceStyle()}>
              <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, color: "#fff", letterSpacing: 2, marginBottom: 12 }}>Scanned Players</div>
              <div style={{ display: "grid", gap: 10 }}>
                {(draft.players || []).map((player, index) => (
                  <div key={player.id} style={{ display: "grid", gap: 10, background: "#08111a", border: player.isManualPlaceholder ? "1px solid #FFD70055" : "1px solid #1e293b", borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input value={player.name} placeholder={`Player ${index + 1}`} onChange={(event) => updatePlayer(player.id, "name", event.target.value)} style={{ background: "#0d1119", color: "#fff", border: "1px solid #263247", borderRadius: 8, padding: "10px 12px", minWidth: 0, flex: "1 1 240px", width: "100%" }} />
                      {player.isManualPlaceholder ? <div style={{ fontFamily: "'Rajdhani'", fontSize: 11, color: "#FFD700", fontWeight: 700, letterSpacing: 1 }}>MANUAL</div> : null}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: compactLayout ? "repeat(3,minmax(0,1fr))" : "repeat(3,minmax(72px,110px)) minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
                      {[
                        { key: "rating", label: "RR", value: player.rating },
                        { key: "goals", label: "G", value: player.goals },
                        { key: "assists", label: "AST", value: player.assists },
                      ].map((field) => (
                        <label key={field.key} style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontFamily: "'Rajdhani'", fontSize: 10, color: "#7f8ea6" }}>{field.label}</span>
                          <input value={field.value} placeholder={field.label} onChange={(event) => updatePlayer(player.id, field.key, event.target.value)} style={{ background: "#0d1119", color: "#fff", border: "1px solid #263247", borderRadius: 8, padding: "8px 10px", width: "100%", minWidth: 0 }} />
                        </label>
                      ))}
                      <div style={{ display: "flex", justifyContent: compactLayout ? "space-between" : "flex-end", alignItems: compactLayout ? "center" : "flex-end", gap: 8, flexWrap: "wrap", gridColumn: compactLayout ? "1 / -1" : "auto" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Rajdhani'", fontSize: 12, color: "#8ea0ba", minHeight: 40 }}>
                          <input type="radio" name="player-of-match" checked={Boolean(player.isPlayerOfTheMatch)} onChange={() => setDraft((prev) => ({ ...prev, players: (prev.players || []).map((entry) => ({ ...entry, isPlayerOfTheMatch: entry.id === player.id })) }))} />
                          POTM
                        </label>
                        <button onClick={() => removeRow(player.id)} style={{ background: "transparent", color: "#ff8aa9", border: "1px solid #ff8aa944", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 11, letterSpacing: 1, minHeight: 40 }}>
                          REMOVE
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(draft.players || []).length === 0 ? <div style={{ fontFamily: "'Rajdhani'", fontSize: 13, color: "#7f8ea6" }}>Upload a player-table image or add rows manually.</div> : null}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <button onClick={handleSave} disabled={saving || ocrBusy || publicContext.loading} style={{ background: "linear-gradient(135deg,#FFD700,#fbbf24)", color: "#111827", border: "none", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 14, letterSpacing: 1, opacity: saving || ocrBusy || publicContext.loading ? 0.6 : 1, flex: compactLayout ? "1 1 100%" : "0 0 auto" }}>
                  {saving ? "SAVING…" : "SAVE REVIEWED DATA"}
                </button>
                <button onClick={() => resetDraft({ preserveTeam: true })} style={{ background: "#0d1119", color: "#e8f7ef", border: "1px solid #263247", borderRadius: 999, padding: "10px 18px", cursor: "pointer", fontFamily: "'Bebas Neue'", fontSize: 14, letterSpacing: 1, flex: compactLayout ? "1 1 100%" : "0 0 auto" }}>
                  RESET
                </button>
              </div>
              {draft.rawText ? (
                <details style={{ marginTop: 16 }}>
                  <summary style={{ cursor: "pointer", fontFamily: "'Rajdhani'", fontSize: 13, color: "#7f8ea6" }}>View scanned text</summary>
                  <pre style={{ whiteSpace: "pre-wrap", marginTop: 12, fontFamily: "monospace", fontSize: 11, color: "#9aa5b5" }}>{draft.rawText}</pre>
                </details>
              ) : null}
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
