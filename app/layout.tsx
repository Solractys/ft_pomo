import type { Metadata } from "next"
import type React from "react"
import { Github } from "lucide-react"
import { Geist, Geist_Mono } from "next/font/google"

import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import { ThemeControls } from "@/components/theme-controls"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" })
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" })

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
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="ft-pomo-color-mode">
          <ThemeControls />
          {children}
          <a
            href="https://github.com/Solractys/ft_pomo"
            target="_blank"
            rel="noreferrer"
            aria-label="Contribuir no GitHub (abre em nova aba)"
            className="fixed bottom-4 right-4 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-card-foreground shadow-md transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Github className="size-4" />
            Contribuir
          </a>
          <Analytics />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
