/**
 * Test script: create a 10-participant auction room and report timing/size metrics.
 *
 * Usage:
 *   node scripts/test-10-players.mjs <API_BASE_URL> <username> <password>
 *
 * Example:
 *   node scripts/test-10-players.mjs https://the-auction-room.onrender.com testhost testpass123
 */

const [, , API_BASE = "http://localhost:3001", USERNAME = "testhost", PASSWORD = "testpass"] = process.argv;

// ── Player generator ──────────────────────────────────────────────────────────
// 260 synthetic players spread across all positions and rating tiers (80–99).
// IDs start at 900000 to avoid clashing with real FC26 player IDs.

const POSITIONS = [
  "GK", "GK", "GK",
  "CB", "CB", "CB", "CB", "CB",
  "LB", "LB", "RB", "RB",
  "LWB", "RWB",
  "CDM", "CDM", "CDM",
  "CM", "CM", "CM", "CM",
  "CAM", "CAM",
  "LM", "RM",
  "LW", "LW", "RW", "RW",
  "ST", "ST", "ST", "CF", "SS",
];

const FIRST_NAMES = ["Luca", "Marco", "James", "Carlos", "Aryan", "Kenji", "Finn", "Omar",
  "Diego", "Ravi", "Matteo", "Lucas", "Sam", "Tomas", "Erik", "Kai", "Max",
  "Noah", "Leo", "Nico", "João", "André", "Femi", "Javi", "Yusuf", "Hugo"];
const LAST_NAMES  = ["Silva", "Costa", "Smith", "García", "Müller", "Tanaka", "Berg", "Hassan",
  "Reyes", "Patel", "Rossi", "Pereira", "Johnson", "Novak", "Hansen", "Wolff", "Bauer",
  "Klein", "Meyer", "Werner", "Ferreira", "Santos", "Obi", "Torres", "Al-Amin", "Martin"];

function makePlayers(count = 260) {
  const players = [];
  for (let i = 0; i < count; i++) {
    // Distribute ratings: ~10% S+(89–99), ~15% S(87–88), ~30% A+(84–86), ~45% A(80–83)
    let rating;
    const r = (i / count);
    if      (r < 0.10) rating = 89 + Math.floor(Math.random() * 11);  // S+
    else if (r < 0.25) rating = 87 + Math.floor(Math.random() * 2);   // S
    else if (r < 0.55) rating = 84 + Math.floor(Math.random() * 3);   // A+
    else               rating = 80 + Math.floor(Math.random() * 4);   // A

    const pos   = POSITIONS[i % POSITIONS.length];
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last  = LAST_NAMES[(i + 7) % LAST_NAMES.length];

    players.push({ id: 900000 + i, name: `${first} ${last} ${i + 1}`, rating, pos });
  }
  return players;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function req(path, opts = {}) {
  const { method = "GET", body, token } = opts;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

function roomCode() {
  return "T" + Math.random().toString(36).slice(2, 7).toUpperCase();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏟  10-Player Auction Load Test`);
  console.log(`   API: ${API_BASE}`);
  console.log(`   User: ${USERNAME}\n`);

  // 1. Login
  process.stdout.write("1. Logging in … ");
  const t0 = Date.now();
  let token;
  try {
    const auth = await req("/api/auth/login", { method: "POST", body: { username: USERNAME, password: PASSWORD } });
    token = auth.token;
    console.log(`✓ (${Date.now() - t0}ms)`);
  } catch (err) {
    console.log(`✗  ${err.message}`);
    if (err.status === 401) {
      console.log("   → Trying to register the user first…");
      try {
        const reg = await req("/api/auth/register", { method: "POST", body: { username: USERNAME, password: PASSWORD, email: `${USERNAME}@test.local` } });
        token = reg.token;
        console.log("   ✓ Registered + logged in");
      } catch (regErr) {
        console.error("   ✗ Registration failed:", regErr.message);
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }

  // 2. Generate players
  process.stdout.write("2. Generating 260 test players … ");
  const players = makePlayers(260);
  const tierCounts = players.reduce((acc, p) => {
    const t = p.rating >= 89 ? "S+" : p.rating >= 87 ? "S" : p.rating >= 84 ? "A+" : "A";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  console.log(`✓  ${JSON.stringify(tierCounts)}`);

  // 3. Build room spec
  const code = roomCode();
  const participantNames = [
    USERNAME,
    "Player_2", "Player_3", "Player_4", "Player_5",
    "Player_6", "Player_7", "Player_8", "Player_9", "Player_10",
  ];

  const spec = {
    id: `session:test:${Date.now()}`,
    roomCode: code,
    name: "10-Player Load Test",
    budgetPerBidder: 240,
    tiers: {
      "S+": { min: 89, max: 99, price: 22, color: "#FFD700", bg: "#FFD70018", border: "#FFD70055" },
      "S":  { min: 87, max: 88, price: 18, color: "#E8C547", bg: "#E8C54718", border: "#E8C54755" },
      "A+": { min: 84, max: 86, price: 15, color: "#C0C0C0", bg: "#C0C0C018", border: "#C0C0C055" },
      "A":  { min: 80, max: 83, price: 12, color: "#CD7F32", bg: "#CD7F3218", border: "#CD7F3255" },
    },
    selectedPlayers: players,
    participantNames,
    mysteryEnabled: true,
    groupsEnabled: true,
    groupCount: 2,
    fixtureLeg: "double",
  };

  // 4. Create room and measure
  process.stdout.write(`3. Creating room ${code} with 10 participants … `);
  const t1 = Date.now();
  let session;
  try {
    const res = await req("/api/rooms", { method: "POST", body: { spec }, token });
    session = res.session;
    const elapsed = Date.now() - t1;
    const payloadKb = Math.round(JSON.stringify(spec).length / 1024);
    const responseKb = Math.round(JSON.stringify(res).length / 1024);
    console.log(`✓ (${elapsed}ms)`);
    console.log(`\n📊 Metrics`);
    console.log(`   Request payload : ${payloadKb} KB`);
    console.log(`   Response size   : ${responseKb} KB`);
    console.log(`   Room code       : ${code}`);
    console.log(`   Session ID      : ${session?.id}`);
    console.log(`   Participants    : ${session?.participants?.length ?? "?"}`);
    const groups  = session?.groups   ?? {};
    const fixtures = session?.fixtures ?? {};
    const groupLabels = Object.keys(groups).sort();
    console.log(`   Groups          : ${groupLabels.join(", ") || "none"}`);

    // ── Detailed fixture breakdown ────────────────────────────────────────
    console.log(`\n📋 Fixture breakdown`);
    groupLabels.forEach((g) => {
      const members = groups[g] ?? [];
      const gfx     = fixtures[g] ?? [];
      console.log(`\n  GROUP ${g}  (${members.length} teams · ${gfx.length} fixtures)`);
      console.log(`  ${"─".repeat(52)}`);

      // Count matches per team in this group
      const teamMatches = {};
      members.forEach(m => teamMatches[m] = 0);
      gfx.forEach(f => { teamMatches[f.home] = (teamMatches[f.home]||0)+1; teamMatches[f.away] = (teamMatches[f.away]||0)+1; });

      // Print by round
      const byRound = {};
      gfx.forEach(f => (byRound[f.round] = byRound[f.round] || []).push(f));
      Object.keys(byRound).sort((a,b) => Number(a)-Number(b)).forEach(r => {
        console.log(`  Round ${r}:`);
        byRound[r].forEach(f => console.log(`    ${String(f.home).padEnd(14)} vs  ${f.away}`));
      });

      const counts = Object.values(teamMatches);
      const minC = Math.min(...counts), maxC = Math.max(...counts);
      console.log(`  → Matches/team: ${minC === maxC ? minC + " (equal ✓)" : `${minC}–${maxC} (unequal ✗)`}`);
    });

    // Cross-group equality check
    const allGroupCounts = groupLabels.flatMap(g => {
      const members = groups[g] ?? [], gfx = fixtures[g] ?? [];
      return members.map(m => gfx.filter(f => f.home === m || f.away === m).length);
    });
    const globalMin = Math.min(...allGroupCounts), globalMax = Math.max(...allGroupCounts);
    console.log(`\n  Cross-group: all teams play ${globalMin === globalMax ? globalMin + " matches ✓" : `${globalMin}–${globalMax} matches ✗`}`);
  } catch (err) {
    console.log(`✗  ${err.message}`);
    if (err.data) console.error("   Response:", JSON.stringify(err.data, null, 2));
    process.exit(1);
  }

  // 5. Fetch the session back and measure
  process.stdout.write(`4. Fetching session back … `);
  const t2 = Date.now();
  try {
    const fetched = await req(`/api/sessions/${encodeURIComponent(session.id)}`, { token });
    console.log(`✓ (${Date.now() - t2}ms)  ${Math.round(JSON.stringify(fetched).length / 1024)} KB`);
  } catch (err) {
    console.log(`✗  ${err.message}`);
  }

  // 6. Simulate all 10 players joining
  console.log(`5. Simulating 9 participants joining (excluding host) …`);
  const joinResults = await Promise.allSettled(
    participantNames.slice(1).map(async (name) => {
      const t = Date.now();
      try {
        // Each needs their own token — register them if needed
        let pToken;
        try {
          const auth = await req("/api/auth/login", { method: "POST", body: { username: name, password: "testpass" } });
          pToken = auth.token;
        } catch {
          const reg = await req("/api/auth/register", { method: "POST", body: { username: name, password: "testpass", email: `${name}@test.local` } });
          pToken = reg.token;
        }
        await req(`/api/rooms/${code}/join`, { method: "POST", body: { username: name }, token: pToken });
        return { name, ms: Date.now() - t, ok: true };
      } catch (err) {
        return { name, ms: Date.now() - t, ok: false, error: err.message };
      }
    })
  );

  let joinOk = 0, joinFail = 0;
  joinResults.forEach(({ value: r }) => {
    if (r.ok) { joinOk++; process.stdout.write(` ✓${r.name}(${r.ms}ms)`); }
    else { joinFail++; process.stdout.write(` ✗${r.name}:${r.error}`); }
  });
  console.log(`\n   Joined: ${joinOk}/9, Failed: ${joinFail}/9`);

  console.log(`\n✅ Test complete. Room ${code} is live — open the app and join with this code.\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
