import test from "node:test"
import assert from "node:assert/strict"
import { SignJWT } from "jose"
import { verifyRealtimeToken } from "../worker/src/auth-token.ts"

const secret = "a-test-secret-that-is-long-enough-for-hmac"

async function issueToken(overrides = {}, key = secret) {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ name: "Ana", email: "ana@example.com", ...overrides.claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("google-user-123")
    .setIssuer(overrides.issuer ?? "ft-pomo-web")
    .setAudience(overrides.audience ?? "ft-pomo-worker")
    .setIssuedAt(now)
    .setExpirationTime(overrides.expiration ?? now + 60)
    .sign(new TextEncoder().encode(key))
}

test("accepts a valid, short-lived realtime token", async () => {
  const token = await issueToken()
  assert.deepEqual(await verifyRealtimeToken(token, secret), {
    sub: "google-user-123", name: "Ana", email: "ana@example.com", image: undefined,
  })
})

test("rejects missing secrets, forged signatures, wrong audience, and expired tokens", async () => {
  const valid = await issueToken()
  const wrongAudience = await issueToken({ audience: "another-service" })
  const expired = await issueToken({ expiration: Math.floor(Date.now() / 1000) - 10 })
  const forged = await issueToken({}, "a-different-test-secret")

  assert.equal(await verifyRealtimeToken(undefined, secret), null)
  assert.equal(await verifyRealtimeToken(valid, undefined), null)
  assert.equal(await verifyRealtimeToken(forged, secret), null)
  assert.equal(await verifyRealtimeToken(wrongAudience, secret), null)
  assert.equal(await verifyRealtimeToken(expired, secret), null)
})
