"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "../lib/transactions";
import { getOrders } from "../lib/storage";
import {
  getStockSummary,
} from "../lib/reports";
import type { Transaction } from "../lib/transactions";

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

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">

      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-slate-600">Warehouse snapshot</p>
      </div>

      {/* LOADING STATE (NO EARLY HOOK EXIT) */}
      {!mounted ? (
        <div className="text-slate-500">Loading dashboard...</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="rounded-3xl bg-slate-50/90 border border-slate-200/80 p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
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
                label="Current Orders"
                value={openOrderSummary.count}
                description="Purchase orders still awaiting completion."
                accentClassName="bg-emerald-50 border-emerald-200"
                href="/purchase-orders"
              />
              <Card
                label="Units on Order"
                value={openOrderSummary.units}
                description="Total quantity currently on open purchase orders."
                href="/purchase-orders"
              />
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="mb-4">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">
                Quick access
              </p>
              <h2 className="text-2xl font-semibold text-slate-950">
                Quick Redirects
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Jump straight to the areas you use most.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <QuickLink href="/inventory" label="Inventory" />
              <QuickLink href="/products" label="Products" />
              <QuickLink href="/purchase-orders" label="Orders" />
              <QuickLink href="/suppliers" label="Suppliers" />
              <QuickLink href="/reports" label="Reports" />
              <QuickLink href="/settings" label="Settings" />
            </div>
          </div>
        </>
      )}

    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-cyan-200 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-800 transition duration-200 hover:-translate-y-0.5 hover:border-cyan-400 hover:bg-cyan-50"
    >
      {label}
    </Link>
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