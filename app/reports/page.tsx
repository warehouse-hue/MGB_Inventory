"use client";

import { useEffect, useState, useMemo } from "react";
import { getActivityLog, clearActivityLog, type Activity } from "../lib/storage";

export default function ReportsPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setActivities(getActivityLog());
  }, []);

  const stats = useMemo(() => {
    return {
      totalChanges: activities.length,
      productEdits: activities.filter((activity) => activity.message.toLowerCase().includes("product")).length,
      supplierEdits: activities.filter((activity) => activity.message.toLowerCase().includes("supplier")).length,
      inventoryEdits: activities.filter((activity) => /(inventory|stock|restock|remove)/i.test(activity.message)).length,
      orderEdits: activities.filter((activity) => /(order|purchase)/i.test(activity.message)).length,
      latestMessage: activities[0]?.message || "No edits recorded yet",
    };
  }, [activities]);

  const handleClearHistory = () => {
    clearActivityLog();
    setActivities([]);
    setShowClearConfirm(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold text-slate-950">Reports</h1>
        <p className="text-slate-600 mt-1">Live warehouse activity overview and stock movement insights.</p>
      </div>

      <div className="glass-card p-6">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Performance summary</p>
          <h2 className="text-2xl font-semibold text-slate-950 mt-2">Recent changes</h2>
          <p className="mt-2 text-sm text-slate-600">See the latest app edits and which sections were updated.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Total changes</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.totalChanges}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Product edits</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.productEdits}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Supplier edits</p>
            <p className="mt-3 text-3xl font-semibold text-slate-950">{stats.supplierEdits}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-5 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-[0.24em]">Latest activity</p>
            <p className="mt-3 text-sm text-slate-950">{stats.latestMessage}</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-950 mb-3">Activity log</h2>
          <button
            type="button"
            onClick={() => setShowClearConfirm((current) => !current)}
            className="rounded-full px-3 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            Clear history
          </button>
        </div>
        {showClearConfirm && (
          <div className="mb-4 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <p className="font-semibold">Clear all recent activity?</p>
            <p className="mt-1 text-slate-700">This will remove all entries from the reports activity list.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClearHistory}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-white shadow-sm transition hover:bg-rose-700"
              >
                Confirm wipe
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="rounded-2xl border border-rose-200 bg-white px-4 py-2 text-rose-700 transition hover:bg-rose-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {activities.length === 0 ? (
            <p className="text-slate-500">No edits yet.</p>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="rounded-3xl bg-slate-50 p-4 border border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-950">{activity.message}</p>
                  <p className="text-sm text-slate-500">{new Date(activity.date).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
