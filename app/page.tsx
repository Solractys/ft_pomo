import { PomodoroTimer } from "@/components/pomodoro-timer"

export default function Home() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-4">
      <PomodoroTimer />
    </main>
  )
}
