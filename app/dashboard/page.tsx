"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAppSettings, getOrders } from "../lib/storage";
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

  const settings = useMemo(() => getAppSettings(), [mounted]);

  const radarStats = useMemo(() => {
    const low = stock.lowStockCount;
    const out = stock.outOfStockCount;
    const inbound = openOrderSummary.count;
    const inboundUnits = openOrderSummary.units;
    const totalAlerts = low + out;
    return {
      totalAlerts,
      inbound,
      inboundUnits,
      criticalOutOfStockCount: out,
    };
  }, [openOrderSummary, stock]);

  const topLowStockItems = stock.lowStockItems.slice(0, 4);
  const topOutOfStockItems = stock.outOfStockItems.slice(0, 4);

  return (
    <div className="min-h-[calc(100vh-2rem)] p-6">
      <div className="mx-auto grid max-w-[2200px] gap-6 animate-fade-in-up">
        <section className="py-3">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold text-slate-950 sm:text-5xl">
                Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                Stock, orders and inventory at a glance.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SignalChip label="Products" value={stock.totalProducts} />
              <SignalChip
                label="Low Stock"
                value={stock.lowStockCount}
                tone={stock.lowStockCount > 0 ? "amber" : "slate"}
              />
              <SignalChip label="Open POs" value={radarStats.inbound} />
              <SignalChip label="Units on Order" value={radarStats.inboundUnits} tone="slate" />
            </div>
          </div>
        </section>

        {!mounted ? (
          <div className="rounded-[32px] border border-slate-200/80 bg-white p-8 text-slate-500 shadow-sm">
            Loading dashboard...
          </div>
        ) : (
          <>
            <div className="grid gap-5 xl:grid-cols-4">
              <Card
                label="Low Stock"
                value={stock.lowStockCount}
                description="Items needing attention soon."
                accentClassName="bg-slate-50 border-slate-200 text-slate-950"
                href="/inventory"
              />
              <Card
                label="Out of Stock"
                value={radarStats.criticalOutOfStockCount}
                description={
                  settings.includeNonStockedInAlerts
                    ? "Inventory entries currently at zero stock."
                    : "Tracked inventory entries currently at zero stock (minimum threshold above zero)."
                }
                accentClassName="bg-slate-50 border-slate-200 text-slate-950"
                href="/inventory"
              />
              <Card
                label="Open Orders"
                value={openOrderSummary.count}
                description="Purchase orders still awaiting completion."
                accentClassName="bg-slate-50 border-slate-200 text-slate-950"
                href="/purchase-orders"
              />
              <Card
                label="Units on Order"
                value={openOrderSummary.units}
                description="Total quantity currently on open purchase orders."
                accentClassName="bg-slate-50 border-slate-200 text-slate-950"
                href="/purchase-orders"
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
              <div className="rounded-lg border border-slate-200/90 bg-white p-6">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-950">Stock overview</h2>
                  <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">
                    Current stock levels and incoming orders.
                  </p>
                </div>

                <div className="mt-6 space-y-4">
                  <MeterRow
                    label="Low stock"
                    value={stock.lowStockCount}
                    max={Math.max(8, radarStats.totalAlerts || 1)}
                    tone="amber"
                  />
                  <MeterRow
                    label="Out of stock"
                    value={radarStats.criticalOutOfStockCount}
                    max={Math.max(8, radarStats.totalAlerts || 1)}
                    tone="rose"
                  />
                  <MeterRow
                    label="Open purchase orders"
                    value={openOrderSummary.count}
                    max={Math.max(6, openOrderSummary.count || 1)}
                    tone="sky"
                  />
                  <MeterRow
                    label="Units on order"
                    value={openOrderSummary.units}
                    max={Math.max(20, openOrderSummary.units || 1)}
                    tone="slate"
                  />
                </div>
              </div>

              <div className="grid gap-5">
                <div className="rounded-lg border border-slate-200/90 bg-slate-50 p-6">
                  <h2 className="text-xl font-semibold text-slate-950">Needs attention</h2>
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

                <div className="rounded-lg border border-slate-200/90 bg-slate-50 p-6">
                  <h2 className="text-xl font-semibold text-slate-950">Out of stock</h2>
                  <div className="mt-5 space-y-3">
                    {topOutOfStockItems.length === 0 ? (
                      <EmptyState
                        message={
                          settings.includeNonStockedInAlerts
                            ? "No inventory entries are fully depleted."
                            : "No tracked inventory entries are fully depleted."
                        }
                      />
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
    </div>
  );
}

function SignalChip({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "amber" | "slate";
}) {
  const toneClass = {
    amber: "border-amber-200/80 bg-amber-100 text-slate-950",
    slate: "border-slate-200 bg-slate-50 text-slate-950",
  }[tone];

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-sm font-medium text-slate-600">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
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
  tone: "amber" | "rose" | "sky" | "slate";
}) {
  const width = Math.max(6, Math.min(100, (value / Math.max(max, 1)) * 100));
  const toneClass = {
    amber: "bg-amber-400",
    rose: "bg-rose-400",
    sky: "bg-sky-400",
    slate: "bg-slate-300",
  }[tone];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-mono text-slate-900">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100">
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
    amber: "border-amber-200 bg-white text-amber-900",
    rose: "border-rose-200 bg-white text-rose-900",
  }[tone];

  return (
    <div className={`flex items-center justify-between rounded-3xl border px-4 py-4 ${toneClass}`}>
      <span className="font-medium text-slate-900">{label}</span>
      <span className="font-mono text-sm text-slate-600">{value}</span>
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
  const className = `rounded-lg p-5 border transition duration-200 hover:bg-slate-100 ${accentClassName}`;

  const content = (
    <>
      <div>
        <p className="text-sm font-medium text-slate-600">
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