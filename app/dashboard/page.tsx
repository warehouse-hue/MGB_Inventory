"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getTransactions } from "../lib/transactions";
import {
  getStockSummary,
  getMovementSummary,
  getTopActiveProducts,
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  /* ALWAYS RUN HOOKS IN SAME ORDER */
  useEffect(() => {
    setMounted(true);
    setTransactions(getTransactions());
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
  }, [mounted, transactions]);

  const movement = useMemo(() => {
    if (!mounted) {
      return {
        totalIn: 0,
        totalOut: 0,
        netMovement: 0,
      };
    }

    const m = getMovementSummary(transactions);

    return {
      totalIn: safeNumber(m?.totalIn),
      totalOut: safeNumber(m?.totalOut),
      netMovement: safeNumber(m?.netMovement),
    };
  }, [mounted, transactions]);

  const topProducts = useMemo(() => {
    if (!mounted) return [];
    return safeArray(getTopActiveProducts(transactions));
  }, [mounted, transactions]);

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
                label="Products"
                value={stock.totalProducts}
                description="Tracked product records."
                accentClassName="bg-cyan-50/70 border-cyan-200"
                href="/products"
              />
              <Card
                label="Total Units"
                value={stock.totalUnits}
                description="Current stock quantity."
                accentClassName="bg-white border-slate-200/80"
                href="/inventory"
              />
              <Card
                label="Available"
                value={stock.totalProducts - stock.outOfStockCount}
                description="Products currently available."
                accentClassName="bg-emerald-50 border-emerald-200"
                href="/inventory"
              />
              <Card
                label="Unavailable"
                value={stock.outOfStockCount}
                description="Products not available."
                accentClassName="bg-rose-50 border-rose-200"
                href="/inventory"
              />
              <Card
                label="Stock In"
                value={movement.totalIn}
                description="Restocked quantity."
                href="/reports"
              />
              <Card
                label="Stock Out"
                value={movement.totalOut}
                description="Shipped or removed quantity."
                href="/reports"
              />
              <Card
                label="Net Movement"
                value={movement.netMovement}
                description="Net stock change."
                href="/reports"
              />
              <Card
                label="Transactions"
                value={transactions.length}
                description="Activity entries."
                href="/reports"
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* LOW STOCK */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold underline decoration-cyan-300 underline-offset-2 mb-4">
              Low Stock Alerts
            </h2>

              {stock.lowStockItems.length === 0 ? (
                <p className="text-slate-500">All stock levels healthy</p>
              ) : (
                stock.lowStockItems.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm py-3 border-b border-slate-200/70 last:border-b-0">
                    <span>Product #{item.productId}</span>
                    <span className="font-semibold text-cyan-700">{item.stock}</span>
                  </div>
                ))
              )}
            </div>

            {/* TOP PRODUCTS */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-semibold underline decoration-cyan-300 underline-offset-2 mb-4">
              Most Active Products
            </h2>

              {topProducts.length === 0 ? (
                <p className="text-slate-500">No activity yet</p>
              ) : (
                topProducts.map((p: any) => (
                  <div key={p.productId} className="flex justify-between text-sm py-3 border-b border-slate-200/70 last:border-b-0">
                    <span>Product #{p.productId}</span>
                    <span className="font-semibold text-cyan-700">{p.activity}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

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