export function accumulateAssistantMessages(createEmptyUsage, addSessionEventUsage, messages) {
  const total = createEmptyUsage();
  for (const message of messages) {
    addSessionEventUsage(total, { type: "message_end", message });
  }
  return total;
}
