export function applySessionEvent(session, event) {
  if (!session || event.sessionId !== session.id) return { session, gap: true };
  const revision = Number(session.revision || 0);
  if (event.revision <= revision) return { session, gap: false };
  if (event.revision !== revision + 1) return { session, gap: true };
  const changed = new Map((event.participants || []).map(participant => [participant.name, participant]));
  const removed = new Set(event.removedParticipants || []);
  const participants = session.participants.filter(p => !removed.has(p.name)).map(p => {
    const next = changed.get(p.name) || p;
    changed.delete(p.name);
    return next;
  });
  participants.push(...changed.values());
  return { gap: false, session: { ...session, ...event.fields, participants, revision: event.revision, updatedAt: event.timestamp } };
}

export function shouldApplySnapshot(previous, next) {
  return !previous || (Number(next.revision || 0) > Number(previous.revision || 0))
    || (Number(next.revision || 0) === Number(previous.revision || 0) && Number(next.updatedAt || 0) > Number(previous.updatedAt || 0));
}
