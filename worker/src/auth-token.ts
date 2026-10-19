import { jwtVerify } from "jose"

export interface RealtimeClaims {
  sub: string
  email?: string
  name?: string
  image?: string
}

export async function verifyRealtimeToken(token: string | undefined, secret: string | undefined): Promise<RealtimeClaims | null> {
  if (!token || !secret) return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"], issuer: "ft-pomo-web", audience: "ft-pomo-worker",
    })
    if (typeof payload.sub !== "string" || !payload.sub) return null
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      image: typeof payload.image === "string" ? payload.image : undefined,
    }
  } catch {
    return null
  }
}
