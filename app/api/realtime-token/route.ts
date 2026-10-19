import { SignJWT } from "jose"
import { auth } from "@/auth"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: "Não autenticado" }, { status: 401 })

  const secret = process.env.REALTIME_JWT_SECRET
  if (!secret) return Response.json({ error: "Autenticação do realtime não configurada" }, { status: 503 })
  const key = new TextEncoder().encode(secret)
  const token = await new SignJWT({
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.user.id)
    .setIssuer("ft-pomo-web")
    .setAudience("ft-pomo-worker")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key)

  return Response.json({ token }, { headers: { "cache-control": "no-store" } })
}
