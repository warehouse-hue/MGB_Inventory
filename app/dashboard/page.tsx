"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getOrders } from "../lib/storage";
import { getStockSummary } from "../lib/reports";

function safeArray<T>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value: any): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  /* ALWAYS RUN HOOKS IN SAME ORDER */
  useEffect(() => {
    setMounted(true);
  }, []);

  /* ALWAYS DECLARE HOOKS (NO CONDITIONAL EXIT BEFORE THIS) */
  const stock = useMemo(() => {
    if (!mounted) {
      return {
        totalProducts: 0,
        totalUnits: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        lowStockItems: [],
        outOfStockItems: [],
      };
    }

    const s = getStockSummary();

    return {
      totalProducts: safeNumber(s?.totalProducts),
      totalUnits: safeNumber(s?.totalUnits),
      lowStockCount: safeNumber(s?.lowStockCount),
      outOfStockCount: safeNumber(s?.outOfStockCount),
      lowStockItems: safeArray(s?.lowStockItems),
      outOfStockItems: safeArray(s?.outOfStockItems),
    };
  }, [mounted]);

  const openOrderSummary = useMemo(() => {
    if (!mounted) {
      return {
        count: 0,
        units: 0,
      };
    }

    const openOrders = getOrders().filter((order) => order.status === "OPEN");

    return {
      count: openOrders.length,
      units: openOrders.reduce((sum, order) => sum + safeNumber(order.quantity), 0),
    };
  }, [mounted]);

  const radarStats = useMemo(() => {
    const low = stock.lowStockCount;
    const out = stock.outOfStockCount;
    const inbound = openOrderSummary.count;
    const inboundUnits = openOrderSummary.units;
    const totalAlerts = low + out;
    const pressureScore = Math.min(99, low * 9 + out * 16 + inbound * 5);

    return {
      totalAlerts,
      pressureScore,
      inbound,
      inboundUnits,
    };
  }, [openOrderSummary, stock]);

  const topLowStockItems = stock.lowStockItems.slice(0, 4);
  const topOutOfStockItems = stock.outOfStockItems.slice(0, 4);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">

      {/* HEADER */}
      <div className="rounded-[2rem] border border-slate-800 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(8,47,73,0.94),rgba(14,116,144,0.88))] px-6 py-7 text-white shadow-[0_28px_80px_rgba(8,15,24,0.28)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-cyan-200/80">
              MGB OPS BOARD
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Dashboard Command View
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-50/78 sm:text-base">
              Live snapshot of shortage pressure, purchase flow, and stock risk across the warehouse.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SignalChip label="Products" value={stock.totalProducts} tone="cyan" />
            <SignalChip label="Alert Load" value={radarStats.totalAlerts} tone="amber" />
            <SignalChip label="Inbound POs" value={radarStats.inbound} tone="sky" />
            <SignalChip label="On Order" value={radarStats.inboundUnits} tone="emerald" />
          </div>
        </div>
      </div>

      {/* LOADING STATE (NO EARLY HOOK EXIT) */}
      {!mounted ? (
        <div className="text-slate-500">Loading dashboard...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="rounded-3xl border border-slate-200/80 bg-slate-50/90 p-6 shadow-sm">
            <div className="mb-4">
              <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
                Key metrics
              </p>
              <h2 className="text-2xl font-semibold text-slate-950">
                Inventory overview
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Quick stats for stock levels, movement, and alerts.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <Card
                label="Low Stock"
                value={stock.lowStockCount}
                description="Items needing attention soon."
                accentClassName="bg-amber-50 border-amber-200"
                href="/inventory"
              />
              <Card
                label="Out of Stock"
                value={stock.outOfStockCount}
                description="Inventory entries currently at zero stock."
                accentClassName="bg-rose-50 border-rose-200"
                href="/inventory"
              />
              <Card
                label="On Board for Delivery"
                value={openOrderSummary.count}
                description="Purchase orders still awaiting completion."
                accentClassName="bg-sky-50 border-sky-200"
                href="/purchase-orders"
              />
              <Card
                label="Units on Order"
                value={openOrderSummary.units}
                description="Total quantity currently on open purchase orders."
                accentClassName="bg-white border-slate-200/80"
                href="/purchase-orders"
              />
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-slate-900 bg-slate-950 p-6 text-white shadow-[0_24px_60px_rgba(8,15,24,0.25)]">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/75">
                    Alert Radar
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Stock Pressure Matrix</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                    Technical readout of shortage severity and inbound stock coverage.
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-500/30 bg-cyan-400/10 px-4 py-3">
                  <p className="font-mono text-[0.65rem] uppercase tracking-[0.32em] text-cyan-200/75">
                    Pressure Score
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-cyan-100">{radarStats.pressureScore}</p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <MeterRow
                  label="Low stock exposure"
                  value={stock.lowStockCount}
                  max={Math.max(8, radarStats.totalAlerts || 1)}
                  tone="amber"
                />
                <MeterRow
                  label="Out of stock exposure"
                  value={stock.outOfStockCount}
                  max={Math.max(8, radarStats.totalAlerts || 1)}
                  tone="rose"
                />
                <MeterRow
                  label="Inbound purchase orders"
                  value={openOrderSummary.count}
                  max={Math.max(6, openOrderSummary.count || 1)}
                  tone="sky"
                />
                <MeterRow
                  label="Inbound units"
                  value={openOrderSummary.units}
                  max={Math.max(20, openOrderSummary.units || 1)}
                  tone="emerald"
                />
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
                  Critical queue
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Low Stock Watchlist</h2>
                <div className="mt-5 space-y-3">
                  {topLowStockItems.length === 0 ? (
                    <EmptyState message="No low stock items are currently flagged." />
                  ) : (
                    topLowStockItems.map((item: any) => (
                      <QueueRow
                        key={item.id}
                        label={`Product #${item.productId}`}
                        value={`${item.stock} left`}
                        tone="amber"
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
                  Zero-stock queue
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Out of Stock Now</h2>
                <div className="mt-5 space-y-3">
                  {topOutOfStockItems.length === 0 ? (
                    <EmptyState message="No inventory entries are fully depleted." />
                  ) : (
                    topOutOfStockItems.map((item: any) => (
                      <QueueRow
                        key={item.id}
                        label={`Product #${item.productId}`}
                        value="0 in stock"
                        tone="rose"
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function SignalChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "sky" | "emerald";
}) {
  const toneClass = {
    cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
    amber: "border-amber-300/40 bg-amber-400/20 text-amber-100",
    sky: "border-sky-300/25 bg-sky-300/10 text-sky-50",
    emerald: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MeterRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "amber" | "rose" | "sky" | "emerald";
}) {
  const width = Math.max(6, Math.min(100, (value / Math.max(max, 1)) * 100));
  const toneClass = {
    amber: "bg-amber-300",
    rose: "bg-rose-300",
    sky: "bg-sky-300",
    emerald: "bg-emerald-300",
  }[tone];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="text-slate-200">{label}</span>
        <span className="font-mono text-cyan-100">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-white/10">
        <div className={`h-2.5 rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
      {message}
    </div>
  );
}

function QueueRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "rose";
}) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  }[tone];

  return (
    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${toneClass}`}>
      <span className="font-medium">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

/* KPI CARD */
function Card({
  label,
  value,
  description,
  accentClassName = "bg-white border-slate-200/80",
  href,
}: {
  label: string;
  value: number;
  description?: string;
  accentClassName?: string;
  href?: string;
}) {
  const className = `rounded-3xl p-5 shadow-sm border transition duration-200 hover:-translate-y-1 hover:shadow-md ${accentClassName}`;

  const content = (
    <>
      <div>
        <p className="text-slate-700 text-[0.75rem] uppercase tracking-[0.28em] font-semibold underline decoration-slate-300 underline-offset-2">
          {label}
        </p>
        <p className="mt-3 text-3xl font-semibold text-slate-950">{value}</p>
      </div>
      {description ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}