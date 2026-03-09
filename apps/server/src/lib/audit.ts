export function writeAuditEntry(event: string, payload: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      channel: "audit",
      event,
      at: new Date().toISOString(),
      payload,
    }),
  );
}
