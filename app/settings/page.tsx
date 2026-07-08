"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { getCloudLastSyncedAt, syncCloudSnapshotNow } from "../lib/cloud-sync";
import {
  addActivity,
  getActivityLog,
  getAppSettings,
  getInventory,
  getOrders,
  getProducts,
  getProjectionDemands,
  getProjectionJobs,
  getSuppliers,
  getTransactions,
  saveAppSettings,
  saveActivityLog,
  saveInventory,
  saveOrders,
  saveProjectionDemands,
  saveProjectionJobs,
  saveProducts,
  saveSuppliers,
  saveTransactions,
} from "../lib/storage";

type BackupData = {
  products?: unknown;
  inventory?: unknown;
  orders?: unknown;
  suppliers?: unknown;
  transactions?: unknown;
  activityLog?: unknown;
  projectionJobs?: unknown;
  projectionDemands?: unknown;
  appSettings?: unknown;
};

type BackupPayload = {
  version?: number;
  exportedAt?: string;
  data?: BackupData;
};

type SmokeTestResult = {
  route: string;
  ok: boolean;
  detail: string;
};

const SMOKE_TEST_ROUTES = [
  "/dashboard",
  "/inventory",
  "/products",
  "/inventory-order",
  "/stock-projection",
  "/suppliers",
  "/purchase-orders",
  "/reports",
  "/settings",
  "/import",
] as const;

const SMOKE_SNAPSHOT_KEYS = [
  "mgb-products",
  "mgb-inventory",
  "mgb-orders",
  "mgb-suppliers",
  "mgb-transactions",
  "mgb-activity-log",
  "mgb-stock-projection-jobs-v2",
  "mgb-stock-projection-demands-v2",
  "mgb-app-settings-v1",
  "mgb-cloud-updated-at",
] as const;

function captureSmokeSnapshot() {
  if (typeof window === "undefined") {
    return {} as Record<string, string | null>;
  }

  const snapshot: Record<string, string | null> = {};
  for (const key of SMOKE_SNAPSHOT_KEYS) {
    snapshot[key] = localStorage.getItem(key);
  }

  return snapshot;
}

function restoreSmokeSnapshot(snapshot: Record<string, string | null>) {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of SMOKE_SNAPSHOT_KEYS) {
    const value = snapshot[key] ?? null;
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  }

  window.dispatchEvent(new Event("mgb-storage-updated"));
}

export default function Page() {
  const ARM_THRESHOLD = 5;
  const [armCount, setArmCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [wipePhrase, setWipePhrase] = useState("");
  const [supabaseHealth, setSupabaseHealth] = useState<"checking" | "healthy" | "unreachable" | "error" | "not-configured">("checking");
  const [supabaseDetail, setSupabaseDetail] = useState("");
  const [supabaseLatencyMs, setSupabaseLatencyMs] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncDetail, setSyncDetail] = useState("");
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number>(0);
  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    payload: BackupPayload;
    counts: Record<string, number>;
  } | null>(null);
  const [smokeStatus, setSmokeStatus] = useState<"idle" | "running" | "done">("idle");
  const [smokeResults, setSmokeResults] = useState<SmokeTestResult[]>([]);
  const [smokeLastRunAt, setSmokeLastRunAt] = useState<string>("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const cloudConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    setLastCloudSyncAt(getCloudLastSyncedAt());

    const onStorageUpdate = () => {
      setLastCloudSyncAt(getCloudLastSyncedAt());
    };

    window.addEventListener("mgb-storage-updated", onStorageUpdate as EventListener);

    return () => {
      window.removeEventListener("mgb-storage-updated", onStorageUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!cloudConfigured) {
      setSupabaseHealth("not-configured");
      setSupabaseDetail("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    return;
  }, [cloudConfigured]);

  useEffect(() => {
    if (!cloudConfigured) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const runHealthCheck = async () => {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

      setSupabaseHealth("checking");
      setSupabaseDetail("Checking Supabase REST endpoint...");
      setSupabaseLatencyMs(null);

      const startedAt = performance.now();

      try {
        const response = await fetch(`${baseUrl}/rest/v1/`, {
          method: "GET",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          signal: controller.signal,
        });

        if (cancelled) return;

        const latency = Math.round(performance.now() - startedAt);
        setSupabaseLatencyMs(latency);

        if (response.ok) {
          setSupabaseHealth("healthy");
          setSupabaseDetail(`Connected to Supabase in ${latency}ms.`);
        } else {
          setSupabaseHealth("error");
          setSupabaseDetail(`Supabase responded with HTTP ${response.status}.`);
        }
      } catch (error) {
        if (cancelled) return;
        const aborted = (error as Error)?.name === "AbortError";
        setSupabaseHealth(aborted ? "unreachable" : "error");
        setSupabaseDetail(aborted ? "Supabase health check timed out after 6s." : "Could not reach Supabase.");
      } finally {
        clearTimeout(timeout);
      }
    };

    void runHealthCheck();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [cloudConfigured]);

  const supabaseHealthLabel = {
    checking: "Checking",
    healthy: "Healthy",
    unreachable: "Unreachable",
    error: "Error",
    "not-configured": "Not Configured",
  }[supabaseHealth];

  const supabaseHealthTone = {
    checking: "cyan",
    healthy: "emerald",
    unreachable: "amber",
    error: "rose",
    "not-configured": "slate",
  } as const;

  const armHiddenWipe = () => {
    const nextCount = Math.min(armCount + 1, ARM_THRESHOLD);
    setArmCount(nextCount);

    if (nextCount < ARM_THRESHOLD) {
      setStatusMessage(`Maintenance control armed ${nextCount}/${ARM_THRESHOLD}.`);
      return;
    }

    setStatusMessage("Maintenance control armed. Run once to wipe all inventory data.");
    setWipePhrase("");
  };

  const clearInventoryData = () => {
    if (armCount < ARM_THRESHOLD) {
      setStatusMessage("Maintenance control is not armed yet.");
      return;
    }

    if (wipePhrase.trim() !== "WIPE NOW") {
      setStatusMessage("Type WIPE NOW in the field to confirm wipe.");
      return;
    }

    saveProducts([]);
    saveInventory([]);
    saveOrders([]);
    saveSuppliers([]);
    saveTransactions([]);
    saveActivityLog([]);
    addActivity("Manual data wipe executed from hidden settings control.");
    setStatusMessage("All inventory data was cleared.");
    setWipePhrase("");
    setArmCount(0);
  };

  const runManualCloudSync = async () => {
    if (!cloudConfigured) {
      setSyncStatus("error");
      setSyncDetail("Cloud sync is not configured in this environment.");
      return;
    }

    setSyncStatus("syncing");
    setSyncDetail("Syncing local snapshot to cloud...");

    try {
      const didSync = await syncCloudSnapshotNow();

      if (!didSync) {
        setSyncStatus("error");
        setSyncDetail("Cloud sync is not available in this environment.");
        return;
      }

      const syncedAt = getCloudLastSyncedAt();
      setLastCloudSyncAt(syncedAt);
      setSyncStatus("success");
      setSyncDetail("Cloud sync completed.");
    } catch {
      setSyncStatus("error");
      setSyncDetail("Cloud sync failed. Please try again.");
    }
  };

  const exportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        products: getProducts(),
        inventory: getInventory(),
        orders: getOrders(),
        suppliers: getSuppliers(),
        transactions: getTransactions(),
        activityLog: getActivityLog(),
        projectionJobs: getProjectionJobs(),
        projectionDemands: getProjectionDemands(),
        appSettings: getAppSettings(),
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `mgb-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setStatusMessage("Backup exported.");
  };

  const restoreBackupFromFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;

      const data = parsed?.data;
      if (!data || typeof data !== "object") {
        setStatusMessage("Backup file is invalid.");
        setPendingRestore(null);
        return;
      }

      const counts = {
        products: Array.isArray(data.products) ? data.products.length : 0,
        inventory: Array.isArray(data.inventory) ? data.inventory.length : 0,
        orders: Array.isArray(data.orders) ? data.orders.length : 0,
        suppliers: Array.isArray(data.suppliers) ? data.suppliers.length : 0,
        transactions: Array.isArray(data.transactions) ? data.transactions.length : 0,
        activityLog: Array.isArray(data.activityLog) ? data.activityLog.length : 0,
        projectionJobs: Array.isArray(data.projectionJobs) ? data.projectionJobs.length : 0,
        projectionDemands: Array.isArray(data.projectionDemands) ? data.projectionDemands.length : 0,
      };

      setPendingRestore({
        fileName: file.name,
        payload: parsed,
        counts,
      });
      setStatusMessage("Backup loaded. Review preview and confirm restore.");
    } catch {
      setStatusMessage("Could not read backup file. Check file format.");
      setPendingRestore(null);
    }
  };

  const confirmRestore = () => {
    const data = pendingRestore?.payload?.data;
    if (!data || typeof data !== "object") {
      setStatusMessage("No backup is loaded for restore.");
      return;
    }

    try {

      saveProducts(Array.isArray(data.products) ? data.products : []);
      saveInventory(Array.isArray(data.inventory) ? data.inventory : []);
      saveOrders(Array.isArray(data.orders) ? data.orders : []);
      saveSuppliers(Array.isArray(data.suppliers) ? data.suppliers : []);
      saveTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      saveActivityLog(Array.isArray(data.activityLog) ? data.activityLog : []);
      saveProjectionJobs(Array.isArray(data.projectionJobs) ? data.projectionJobs : []);
      saveProjectionDemands(Array.isArray(data.projectionDemands) ? data.projectionDemands : []);

      if (data.appSettings && typeof data.appSettings === "object") {
        saveAppSettings(data.appSettings as Record<string, unknown>);
      }

      addActivity("Backup restore executed from settings.");
      setStatusMessage("Backup restored successfully.");
      setPendingRestore(null);
    } catch {
      setStatusMessage("Could not restore backup. Check file format.");
    }
  };

  const lastSyncLabel = lastCloudSyncAt
    ? new Date(lastCloudSyncAt).toLocaleString()
    : "Never";

  const runSmokeTest = async () => {
    setSmokeStatus("running");
    setSmokeResults([]);

    const localSnapshot = captureSmokeSnapshot();

    try {
      const nextResults = await Promise.all(
        SMOKE_TEST_ROUTES.map(async (route) => {
          try {
            const response = await fetch(`${route}?_smoke=${Date.now()}`, {
              method: "GET",
              cache: "no-store",
            });

            if (!response.ok) {
              return {
                route,
                ok: false,
                detail: `HTTP ${response.status}`,
              } satisfies SmokeTestResult;
            }

            const content = await response.text();
            const hasErrorSignal =
              /application error|something went wrong|hydration failed|unhandled runtime error/i.test(content);

            if (hasErrorSignal) {
              return {
                route,
                ok: false,
                detail: "Runtime error signal detected",
              } satisfies SmokeTestResult;
            }

            return {
              route,
              ok: true,
              detail: "OK",
            } satisfies SmokeTestResult;
          } catch {
            return {
              route,
              ok: false,
              detail: "Request failed",
            } satisfies SmokeTestResult;
          }
        })
      );

      setSmokeResults(nextResults);
      setSmokeLastRunAt(new Date().toLocaleString());
      setSmokeStatus("done");
    } finally {
      // Smoke tests must never leave operational data altered.
      restoreSmokeSnapshot(localSnapshot);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-settings">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p
              onClick={armHiddenWipe}
              className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-slate-300/80 cursor-default select-none"
            >
              SYSTEM CONFIG
            </p>
            <div className="mt-3 command-slip-icon">
              <Settings2 />
              Settings
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Settings Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/78 sm:text-base">
              Configuration surface for sync, workspace behavior, and future warehouse controls.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SettingsChip label="Cloud" value={cloudConfigured ? "READY" : "LOCAL"} tone={cloudConfigured ? "emerald" : "amber"} />
            <SettingsChip label="Supabase" value={supabaseHealthLabel} tone={supabaseHealthTone[supabaseHealth]} />
            <SettingsChip label="Mode" value="OPS" tone="slate" />
            <SettingsChip label="Controls" value="SOON" tone="cyan" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
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
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Supabase health</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Connection status</h2>
          <p className="mt-3 text-sm text-slate-600">{supabaseDetail || "No status available yet."}</p>
          {supabaseLatencyMs != null ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Latency: {supabaseLatencyMs}ms</p>
          ) : null}
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Planned controls</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Cloud sync control</h2>
          <p className="mt-3 text-sm text-slate-600">
            Trigger an immediate snapshot sync and check when cloud sync last completed.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Last sync: {lastSyncLabel}
          </p>
          {syncDetail ? <p className="mt-2 text-sm text-slate-600">{syncDetail}</p> : null}
          <button
            type="button"
            onClick={runManualCloudSync}
            disabled={syncStatus === "syncing"}
            className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Status</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Backup and restore</h2>
          <p className="mt-3 text-sm text-slate-600">
            Export a full backup snapshot or restore a previous backup file.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportBackup}
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Export Backup
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Restore Backup
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                void restoreBackupFromFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </div>

          {pendingRestore ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Restore preview</p>
              <p className="mt-2 text-sm text-slate-700">File: {pendingRestore.fileName}</p>
              <p className="mt-1 text-sm text-slate-700">Version: {pendingRestore.payload.version ?? "Unknown"}</p>
              <p className="mt-1 text-sm text-slate-700">
                Exported: {pendingRestore.payload.exportedAt ? new Date(pendingRestore.payload.exportedAt).toLocaleString() : "Unknown"}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Row counts</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-4">
                <p>Products: {pendingRestore.counts.products}</p>
                <p>Inventory: {pendingRestore.counts.inventory}</p>
                <p>Orders: {pendingRestore.counts.orders}</p>
                <p>Suppliers: {pendingRestore.counts.suppliers}</p>
                <p>Transactions: {pendingRestore.counts.transactions}</p>
                <p>Activity: {pendingRestore.counts.activityLog}</p>
                <p>Proj Jobs: {pendingRestore.counts.projectionJobs}</p>
                <p>Proj Demand: {pendingRestore.counts.projectionDemands}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmRestore}
                  className="inline-flex items-center rounded-2xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-200"
                >
                  Confirm Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingRestore(null);
                    setStatusMessage("Restore cancelled.");
                  }}
                  className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="glass-card p-6 md:col-span-2">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Data tools</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">CSV Importer</h2>
          <p className="mt-3 text-sm text-slate-600">
            Import product and stock rows from CSV files.
          </p>
          <Link
            href="/import"
            className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
          >
            Open Importer
          </Link>
        </div>

        <div className="glass-card p-6 md:col-span-2">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Diagnostics</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Smoke test</h2>
          <p className="mt-3 text-sm text-slate-600">
            Run a quick route-health check across all major app pages from Settings.
          </p>
          <button
            type="button"
            onClick={runSmokeTest}
            disabled={smokeStatus === "running"}
            className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {smokeStatus === "running" ? "Running smoke test..." : "Run Smoke Test"}
          </button>

          {smokeLastRunAt ? (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Last run: {smokeLastRunAt}
            </p>
          ) : null}

          {smokeResults.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {smokeResults.map((result) => (
                <div key={result.route} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-slate-600">{result.route}</span>
                  <span className={result.ok ? "text-emerald-700" : "text-rose-700"}>
                    {result.ok ? "PASS" : `FAIL (${result.detail})`}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          {statusMessage}
          {armCount >= ARM_THRESHOLD ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={wipePhrase}
                onChange={(event) => setWipePhrase(event.target.value)}
                placeholder="Type WIPE NOW"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 sm:w-52"
              />
              <button
                type="button"
                onClick={clearInventoryData}
                className="inline-flex items-center rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-200"
              >
                Run maintenance task
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
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
  tone: "emerald" | "amber" | "slate" | "cyan" | "rose";
}) {
  const toneClass = {
    emerald: "border-emerald-200/70 bg-emerald-400/35 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    amber: "border-amber-200/70 bg-amber-400/35 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    slate: "border-slate-200/45 bg-slate-200/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
    cyan: "border-cyan-200/70 bg-cyan-400/35 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    rose: "border-rose-200/70 bg-rose-400/35 text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
