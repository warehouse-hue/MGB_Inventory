"use client";

import { useEffect, useState } from "react";
import { bootstrapCloudSync } from "../lib/cloud-sync";

type Props = {
  children: React.ReactNode;
};

export default function AppBootstrap({ children }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    void bootstrapCloudSync().finally(() => {
      if (mounted) {
        setReady(true);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Syncing cloud data...
      </div>
    );
  }

  return <>{children}</>;
}
