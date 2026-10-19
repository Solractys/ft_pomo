export function captureAttendeeIds(userIds: Array<string | null | undefined>) {
  return [...new Set(userIds.filter((userId): userId is string => Boolean(userId)))]
}

export function shouldCompleteFocusSession(phase: "work" | "break", sessionId: string | null) {
  return phase === "work" && sessionId !== null
}
