/**
 * Seed a dummy completed auction with 10 participants and full group fixtures.
 * Nothing is created in the live session/room — only a single auctionResults doc is written.
 *
 * Usage:
 *   node scripts/seed-dummy-auction.mjs <API_BASE_URL> <username> <password> [groupCount] [leg]
 *
 * Examples:
 *   node scripts/seed-dummy-auction.mjs https://the-auction-room.onrender.com deepansh11 deepansh
 *   node scripts/seed-dummy-auction.mjs https://the-auction-room.onrender.com deepansh11 deepansh 3 single
 */

const [,, API_BASE = "http://localhost:3001", USERNAME = "deepansh11", PASSWORD = "deepansh",
  GROUP_COUNT_ARG = "2", LEG_ARG = "double"] = process.argv;

const GROUP_COUNT = Math.max(1, Math.min(5, Number(GROUP_COUNT_ARG) || 2));
const LEG = LEG_ARG === "single" ? "single" : "double";

// ── Fixture generation (mirrors src/game/groupsFixtures.js) ──────────────

function generateRoundRobinFixtures(teamNames) {
  const teams = (teamNames || []).filter(Boolean);
  if (teams.length < 2) return [];
  const hasBye = teams.length % 2 !== 0;
  const roster = hasBye ? [...teams, null] : [...teams];
  const n = roster.length, rounds = n - 1, half = n / 2, fixed = roster[0];
  let rotating = roster.slice(1);
  const fixtures = [];
  for (let round = 0; round < rounds; round++) {
    const roundTeams = [fixed, ...rotating];
    for (let i = 0; i < half; i++) {
      const h = roundTeams[i], a = roundTeams[n - 1 - i];
      if (h != null && a != null) {
        const swap = round % 2 === 1;
        fixtures.push({ round: round + 1, home: swap ? a : h, away: swap ? h : a });
      }
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return fixtures;
}

function generateBalancedExtra(teams, extraPerTeam, idxOffset, label, roundOffset) {
  const m = teams.length;
  if (m < 2 || extraPerTeam <= 0) return [];
  const hasBye = m % 2 !== 0;
  const roster = hasBye ? [...teams, null] : [...teams];
  const n = roster.length, half = n / 2, rounds = n - 1, fixed = roster[0];
  const extra = [], counts = {};
  teams.forEach(t => { counts[t] = 0; });
  let idx = 0, done = false;
  for (let cycle = 0; !done && cycle < 20; cycle++) {
    let rotating = roster.slice(1);
    for (let r = 0; r < rounds && !done; r++) {
      const rt = [fixed, ...rotating], swap = r % 2 === 1;
      for (let i = 0; i < half; i++) {
        const h = rt[i], a = rt[n - 1 - i];
        if (h != null && a != null && counts[h] < extraPerTeam && counts[a] < extraPerTeam) {
          extra.push({
            id: `${label}-${idxOffset + idx}`, round: roundOffset + idx + 1,
            home: swap ? a : h, away: swap ? h : a, homeGoals: null, awayGoals: null,
          });
          counts[h]++; counts[a]++; idx++;
        }
      }
      rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
      done = teams.every(t => counts[t] >= extraPerTeam);
    }
  }
  return extra;
}

function buildGroupFixtures(groups, leg = "double") {
  const allSizes = Object.values(groups).map(t => t.filter(Boolean).length);
  const maxSize = Math.max(...allSizes);
  const lf = leg === "double" ? 2 : 1;
  let target = lf * Math.max(maxSize - 1, 0);
  if (allSizes.some(m => m % 2 !== 0 && (target - lf * Math.max(m - 1, 0)) % 2 !== 0 && (target - lf * Math.max(m - 1, 0)) > 0))
    target += 1;

  const fixtures = {};
  Object.entries(groups).forEach(([label, teams]) => {
    const ct = teams.filter(Boolean);
    const single = generateRoundRobinFixtures(ct);
    const maxRound = single.length > 0 ? Math.max(...single.map(f => f.round)) : 0;
    const base = [];
    if (leg === "double") {
      single.forEach((f, i) => {
        base.push({ id: `${label}-${i * 2}`, ...f, homeGoals: null, awayGoals: null });
        base.push({ id: `${label}-${i * 2 + 1}`, round: f.round + maxRound, home: f.away, away: f.home, homeGoals: null, awayGoals: null });
      });
    } else {
      single.forEach((f, i) => base.push({ id: `${label}-${i}`, ...f, homeGoals: null, awayGoals: null }));
    }
    let extra = target - lf * (ct.length - 1);
    if (ct.length % 2 !== 0 && extra % 2 !== 0) extra++;
    if (extra > 0) {
      fixtures[label] = [...base, ...generateBalancedExtra(ct, extra, base.length, label, leg === "double" ? maxRound * 2 : maxRound)];
    } else {
      fixtures[label] = base;
    }
  });
  return fixtures;
}

// ── Participant data ──────────────────────────────────────────────────────

const TIERS = {
  "S+": { min: 89, max: 99, price: 22, color: "#FFD700", bg: "#FFD70018", border: "#FFD70055" },
  "S":  { min: 87, max: 88, price: 18, color: "#E8C547", bg: "#E8C54718", border: "#E8C54755" },
  "A+": { min: 84, max: 86, price: 15, color: "#C0C0C0", bg: "#C0C0C018", border: "#C0C0C055" },
  "A":  { min: 80, max: 83, price: 12, color: "#CD7F32", bg: "#CD7F3218", border: "#CD7F3255" },
};

// Representative players with real-looking data
const PLAYER_POOL = [
  { id: 231747, name: "Kylian Mbappé",    rating: 91, pos: "ST"  },
  { id: 239085, name: "Erling Haaland",   rating: 91, pos: "ST"  },
  { id: 192985, name: "Vinícius Jr.",     rating: 90, pos: "LW"  },
  { id: 212198, name: "Rodri",            rating: 90, pos: "CDM" },
  { id: 238794, name: "Jude Bellingham",  rating: 89, pos: "CAM" },
  { id: 230666, name: "Phil Foden",       rating: 89, pos: "CAM" },
  { id: 209331, name: "Gavi",             rating: 87, pos: "CM"  },
  { id: 226994, name: "Bukayo Saka",      rating: 87, pos: "RW"  },
  { id: 235212, name: "Florian Wirtz",    rating: 87, pos: "CAM" },
  { id: 231443, name: "Pedri",            rating: 87, pos: "CM"  },
  { id: 241636, name: "Lamine Yamal",     rating: 86, pos: "RW"  },
  { id: 226998, name: "Declan Rice",      rating: 86, pos: "CDM" },
  { id: 208722, name: "Bruno Fernandes",  rating: 86, pos: "CAM" },
  { id: 236670, name: "Jamal Musiala",    rating: 85, pos: "CAM" },
  { id: 244725, name: "Federico Valverde",rating: 85, pos: "CM"  },
  { id: 197445, name: "Rúben Dias",       rating: 85, pos: "CB"  },
  { id: 202126, name: "Virgil van Dijk",  rating: 85, pos: "CB"  },
  { id: 183277, name: "Antoine Griezmann",rating: 84, pos: "CF"  },
  { id: 183898, name: "Luis Díaz",        rating: 84, pos: "LW"  },
  { id: 237799, name: "Khvicha Kvaratskhelia", rating: 84, pos: "LW" },
  { id: 214935, name: "Bernardo Silva",   rating: 84, pos: "CM"  },
  { id: 230621, name: "Alejandro Grimaldo", rating: 84, pos: "LB" },
  { id: 199965, name: "Trent Alexander-Arnold", rating: 83, pos: "RB" },
  { id: 222028, name: "Nico Williams",    rating: 83, pos: "LW"  },
  { id: 227652, name: "Mykhaylo Mudryk", rating: 82, pos: "LW"  },
  { id: 234494, name: "Martin Ødegaard",  rating: 87, pos: "CAM" },
  { id: 210028, name: "Harry Kane",       rating: 90, pos: "ST"  },
  { id: 159665, name: "Luka Modrić",      rating: 85, pos: "CM"  },
  { id: 231024, name: "Dominik Szoboszlai", rating: 83, pos: "CM" },
  { id: 212831, name: "Cody Gakpo",       rating: 83, pos: "LW"  },
  { id: 246669, name: "Warren Zaïre-Emery", rating: 82, pos: "CM" },
  { id: 239842, name: "Gabri Veiga",      rating: 81, pos: "CAM" },
  { id: 248648, name: "Endrick",          rating: 80, pos: "ST"  },
  { id: 223921, name: "Ansu Fati",        rating: 81, pos: "LW"  },
  { id: 245369, name: "Evan Ndicka",      rating: 82, pos: "CB"  },
  { id: 229538, name: "Pedro Porro",      rating: 82, pos: "RB"  },
  { id: 227696, name: "Ousmane Dembélé",  rating: 86, pos: "RW"  },
  { id: 260683, name: "Pau Cubarsí",      rating: 82, pos: "CB"  },
  { id: 239877, name: "Lautaro Martínez", rating: 88, pos: "ST"  },
  { id: 222077, name: "Nicolás Otamendi", rating: 81, pos: "CB"  },
];

const NAMES = [
  "deepansh11", "FC_Barcelona", "LaLiga_Fan", "PremierLeague",
  "ChampionsFC",  "BundesligaBoss", "SerieA_King", "Ligue1_Pro",
  "UCL_Winner",  "WorldCupFan",
];

// Deal squads: each participant gets 4 players from the pool, spread by index
function buildParticipants(names) {
  return names.map((name, i) => {
    const squad = [];
    let budget = 240;
    for (let s = 0; s < 4; s++) {
      const p = PLAYER_POOL[(i * 4 + s) % PLAYER_POOL.length];
      const tierEntry = Object.entries(TIERS).find(([, t]) => p.rating >= t.min && p.rating <= t.max);
      const price = tierEntry ? tierEntry[1].price : 12;
      squad.push({ ...p, pickedAt: Date.now() - (40 - s) * 60000 });
      budget -= price;
    }
    return { name, budget: Math.max(budget, 0), squad };
  });
}

// ── Group assignment (round-robin deal) ──────────────────────────────────

function assignGroups(names, count) {
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const groups = {};
  for (let i = 0; i < count; i++) groups[labels[i]] = [];
  names.forEach((n, idx) => groups[labels[idx % count]].push(n));
  return groups;
}

// ── HTTP helper ───────────────────────────────────────────────────────────

async function req(path, opts = {}) {
  const { method = "GET", body, token } = opts;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(data?.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🏟  Seeding dummy completed auction`);
  console.log(`   API         : ${API_BASE}`);
  console.log(`   Host        : ${USERNAME}`);
  console.log(`   Participants: ${NAMES.length}`);
  console.log(`   Groups      : ${GROUP_COUNT}  |  Leg: ${LEG}\n`);

  // 1. Login
  process.stdout.write("1. Logging in … ");
  let token;
  try {
    const auth = await req("/api/auth/login", { method: "POST", body: { username: USERNAME, password: PASSWORD } });
    token = auth.token;
    console.log("✓");
  } catch (err) {
    console.log(`✗  ${err.message}`);
    process.exit(1);
  }

  // 2. Build data
  process.stdout.write("2. Building participants, groups and fixtures … ");
  const participants = buildParticipants(NAMES);
  const groups       = assignGroups(NAMES, GROUP_COUNT);
  const fixtures     = buildGroupFixtures(groups, LEG);

  // Print summary
  console.log("✓");
  Object.entries(groups).forEach(([g, members]) => {
    const fxCount = (fixtures[g] || []).length;
    const perTeam = members.map(m =>
      (fixtures[g] || []).filter(f => f.home === m || f.away === m).length
    );
    const [min, max] = [Math.min(...perTeam), Math.max(...perTeam)];
    console.log(`   Group ${g}: [${members.join(", ")}]`);
    console.log(`     ${fxCount} fixtures · ${min === max ? min : `${min}–${max}`} matches/team ${min === max ? "✓" : "✗"}`);
  });

  // 3. Build and POST the result
  const sessionId = `seed:10player:${Date.now()}`;
  const result = {
    sessionId,
    roomCode: "SEED10",
    name:     "10-Player Dummy Auction",
    host:     USERNAME,
    participants,
    participantNames: NAMES,
    tiers: TIERS,
    playerPool: PLAYER_POOL,
    groupsEnabled: true,
    groupCount: GROUP_COUNT,
    fixtureLeg: LEG,
    groups,
    fixtures,
    status: "complete",
  };

  process.stdout.write("3. Writing to auctionResults … ");
  try {
    const resp = await req("/api/seed/auction-result", {
      method: "POST",
      body: { result },
      token,
    });
    console.log(`✓  id=${resp.id}`);
  } catch (err) {
    console.log(`✗  ${err.message}`);
    if (err.data) console.error(JSON.stringify(err.data, null, 2));
    process.exit(1);
  }

  console.log(`\n✅ Done. Open the app, go to PAST RESULTS — you should see "10-Player Dummy Auction".\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
