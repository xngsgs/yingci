// A pending chat turn is identified by its object, never by text or list position.
export function discardPendingTurn(pending, activeProjectId) {
  if (!pending || pending.kind !== 'chat' || !pending.userMessage) return null;
  const {session, userMessage} = pending;
  const index = session.messages.indexOf(userMessage);
  if (index < 0) return null;
  session.messages.splice(index, 1);
  return session.id === activeProjectId ? userMessage.text : null;
}
