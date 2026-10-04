import type { Metadata } from "next"
import type React from "react"

import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: "Pomodoro Timer - Synchronized Sessions",
  description: "Minimalist synchronized Pomodoro timer for focused work sessions",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`font-sans antialiased`}>
        {children}
        <Analytics />
        <Toaster />
      </body>
    </html>
  )
}
