"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"

export function SignInButton() {
  return <Button onClick={() => signIn("google")} className="h-14 w-full rounded-none bg-black text-lg">Entrar com Google</Button>
}
