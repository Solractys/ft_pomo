let cachedToken: { value: string; expiresAt: number } | null = null

export async function getRealtimeToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value
  const response = await fetch("/api/realtime-token", { cache: "no-store" })
  const result = await response.json() as { token?: string; error?: string }
  if (!response.ok || !result.token) throw new Error(result.error ?? "Faça login para continuar")
  cachedToken = { value: result.token, expiresAt: Date.now() + 4 * 60_000 }
  return result.token
}
