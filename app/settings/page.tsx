"use client";

import Link from "next/link";

export default function Page() {
  const cloudConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div className="rounded-[2rem] border border-slate-800 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(51,65,85,0.96),rgba(71,85,105,0.86))] px-6 py-7 text-white shadow-[0_28px_80px_rgba(8,15,24,0.2)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-slate-300/80">SYSTEM CONFIG</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Settings Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/78 sm:text-base">
              Configuration surface for sync, workspace behavior, and future warehouse controls.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SettingsChip label="Cloud" value={cloudConfigured ? "READY" : "LOCAL"} tone={cloudConfigured ? "emerald" : "amber"} />
            <SettingsChip label="Mode" value="OPS" tone="slate" />
            <SettingsChip label="Controls" value="SOON" tone="cyan" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Sync state</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Cloud configuration</h2>
          <p className="mt-3 text-sm text-slate-600">
            {cloudConfigured
              ? "This deployment has cloud sync environment values available."
              : "This deployment is currently running without full cloud sync configuration."}
          </p>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Planned controls</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Upcoming settings</h2>
          <p className="mt-3 text-sm text-slate-600">
            Supplier defaults, stock thresholds, sync diagnostics, and user preferences can live here next.
          </p>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Status</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Command placeholder</h2>
          <p className="mt-3 text-sm text-slate-600">
            This page is now styled to match the rest of the app and is ready for real settings modules.
          </p>
        </div>
      </div>

      <div className="glass-card p-6">
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Advanced tools</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Hidden import access</h2>
        <p className="mt-3 max-w-2xl text-sm text-slate-600">
          Bulk CSV import is intentionally tucked away here. Queue one or more files, review them, then send the import manually.
        </p>
        <div className="mt-4">
          <Link
            href="/import"
            className="inline-flex rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Import CSV
          </Link>
        </div>
      </div>
    </div>
  );
}

function SettingsChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "slate" | "cyan";
}) {
  const toneClass = {
    emerald: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-50",
    slate: "border-white/15 bg-white/8 text-white",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-50",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
