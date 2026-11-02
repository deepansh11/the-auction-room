import { generateAuctionSetup } from "../backend/src/services/gameSetup.js";

// Deterministic transaction double. NOT a substitute for emulator/region latency tests.
export class MemoryFirestore {
  documents = new Map();
  tail = Promise.resolve();
  failNextCommit = false;
  collection(path) {
    return { doc: id => this.ref(`${path}/${id}`) };
  }
  ref(path) {
    return {
      path,
      collection: name => this.collection(`${path}/${name}`),
      get: async () => this.snapshot(path),
      set: async (data, options) => this.write(path, data, options),
      delete: async () => this.documents.delete(path),
    };
  }
  snapshot(path) {
    const data = this.documents.get(path);
    return { exists: data !== undefined, data: () => structuredClone(data) };
  }
  write(path, data, options) {
    this.documents.set(path, structuredClone(options?.merge ? { ...this.documents.get(path), ...data } : data));
  }
  runTransaction(fn) {
    const work = this.tail.then(async () => {
      const writes = [];
      const transaction = {
        get: async ref => this.snapshot(ref.path),
        set: (ref, data, options) => writes.push(() => this.write(ref.path, data, options)),
        update: (ref, data) => writes.push(() => this.write(ref.path, data, { merge: true })),
        delete: ref => writes.push(() => this.documents.delete(ref.path)),
      };
      const result = await fn(transaction);
      if (this.failNextCommit) { this.failNextCommit = false; throw new Error("Simulated commit failure"); }
      writes.forEach(write => write());
      return result;
    });
    this.tail = work.catch(() => {});
    return work;
  }
}

export function fixture(count = 10) {
  const names = Array.from({ length: count }, (_, index) => `test-${index}`);
  const players = Array.from({ length: count * 26 }, (_, index) => ({
    id: index + 1, name: `Player ${index + 1}`, rating: 80, pos: index % 5 === 0 ? "GK" : "CM",
  }));
  const tiers = { A: { min: 80, max: 99, price: 12, color: "#fff", bg: "#000", border: "#fff" } };
  const setup = generateAuctionSetup({ selectedPlayers: players, tiers, participantNames: names, mysteryEnabled: false, groupsEnabled: false });
  return {
    id: "test-session", roomCode: "TEST01", host: names[0], participantNames: names,
    participants: names.map(name => ({ name, budget: 240, squad: [] })),
    budgetPerBidder: 240, tiers, ...setup, sequence: names, lotIdx: 0, turnIdx: 0,
    lotOpen: true, lotClosing: false, passedThisLot: [], status: "active", revision: 0,
    createdAt: 1, updatedAt: 1,
  };
}

export const testUser = name => ({ uid: `uid-${name}`, username: name, exp: Math.floor(Date.now() / 1000) + 3600 });
