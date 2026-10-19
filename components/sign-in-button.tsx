"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"

export function SignInButton() {
  return <Button onClick={() => signIn("google")} variant="outline" className="h-14 w-full text-lg">Entrar com Google</Button>
}
