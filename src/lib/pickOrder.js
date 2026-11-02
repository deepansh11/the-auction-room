// Display the authoritative lot sequence, never participant creation order or a local rotation.
export function getOrderedParticipants(participants = [], sequence = []) {
  const byName = new Map(participants.map((participant, colorIndex) => [participant.name, { participant, colorIndex }]));
  const ordered = [];
  sequence.forEach((name, index) => {
    const entry = byName.get(name);
    if (!entry) return;
    ordered.push({ ...entry, position: index + 1 });
    byName.delete(name);
  });
  // Keep budgets visible during membership recovery, but don't invent an order for missing names.
  byName.forEach(entry => ordered.push({ ...entry, position: null }));
  return ordered;
}
