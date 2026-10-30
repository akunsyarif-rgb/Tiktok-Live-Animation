import Link from "next/link";

export default function Home() {
  return (
    <main className="control-bg min-h-dvh p-8 text-lg">
      <h1 className="text-2xl font-bold mb-4">TikTok Live ATM — Phase 0</h1>
      <ul className="space-y-2 underline">
        <li><Link href="/control">/control — dashboard</Link></li>
        <li><Link href="/overlay">/overlay — transparent ATM overlay</Link></li>
      </ul>
    </main>
  );
}
