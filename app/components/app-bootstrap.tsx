"use client";

import { useEffect, useState } from "react";
import { bootstrapCloudSync, pullCloudSnapshot } from "../lib/cloud-sync";
import { migrateLegacyIds } from "../lib/storage";

type Props = {
  children: React.ReactNode;
};

export default function AppBootstrap({ children }: Props) {
  const [syncTick, setSyncTick] = useState(0);
  const [hideWarning, setHideWarning] = useState(false);
  const warningDismissKey = "mgb-cloud-warning-dismissed";
  const hasCloudConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.sessionStorage.getItem(warningDismissKey) === "1";
    setHideWarning(dismissed);
  }, []);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    // One-time local migration to repair duplicate IDs from legacy imports.
    migrateLegacyIds();

    const pullLatest = async () => {
      try {
        await pullCloudSnapshot();
        if (mounted) {
          setSyncTick((current) => current + 1);
        }
      } catch (error) {
        console.error(error);
      }
    };

    void bootstrapCloudSync().finally(() => {
      if (!mounted) return;
      timer = setInterval(() => {
        void pullLatest();
      }, 5000);
    });

    const onFocus = () => {
      void pullLatest();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pullLatest();
      }
    };

    const onOnline = () => {
      void pullLatest();
    };

    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mounted = false;
      if (timer) {
        clearInterval(timer);
      }
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const dismissWarning = () => {
    setHideWarning(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(warningDismissKey, "1");
    }
  };

  return (
    <div data-sync-tick={syncTick} className="space-y-4">
      {!hasCloudConfig && !hideWarning ? (
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50/85 px-4 py-3 text-sm text-slate-800 shadow-sm backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold tracking-tight">Cloud sync is off for this deployment.</p>
              <p className="mt-1 text-slate-700">
                Data is currently stored only in this browser session.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissWarning}
              className="rounded-xl border border-cyan-300 bg-white/80 px-3 py-1 text-xs font-medium text-cyan-900 transition hover:bg-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
