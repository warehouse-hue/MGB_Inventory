"use client";

import { useEffect, useState } from "react";
import { bootstrapCloudSync, pullCloudSnapshot } from "../lib/cloud-sync";

type Props = {
  children: React.ReactNode;
};

export default function AppBootstrap({ children }: Props) {
  const [syncTick, setSyncTick] = useState(0);
  const hasCloudConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | undefined;

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

    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      if (timer) {
        clearInterval(timer);
      }
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <div data-sync-tick={syncTick}>
      {!hasCloudConfig ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Cloud sync is not configured in this deployment. Data is currently local to this browser.
        </div>
      ) : null}
      {children}
    </div>
  );
}
