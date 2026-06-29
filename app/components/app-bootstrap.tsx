"use client";

import { useEffect, useState } from "react";
import { bootstrapCloudSync, pullCloudSnapshot } from "../lib/cloud-sync";

type Props = {
  children: React.ReactNode;
};

export default function AppBootstrap({ children }: Props) {
  const [ready, setReady] = useState(false);
  const [syncTick, setSyncTick] = useState(0);

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
      if (mounted) {
        setReady(true);
        timer = setInterval(() => {
          void pullLatest();
        }, 5000);
      }
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

  if (!ready) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Syncing cloud data...
      </div>
    );
  }

  return <div data-sync-tick={syncTick}>{children}</div>;
}
