"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getActivityLog,
  getInventory,
  getOrders,
  getProducts,
  getProjectionDemands,
  getProjectionJobs,
} from "../lib/storage";
import { getStockSummary } from "../lib/reports";

type DashboardIssue = {
  id: string;
  label: string;
  detail: string;
  tone: "danger" | "warning";
};

type UpcomingJob = {
  id: string;
  name: string;
  dateNeeded: string;
  itemsAtRisk: number;
};

type RecentActivity = {
  id: number;
  message: string;
  date: number;
};

function safeNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function localDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dashboard = useMemo(() => {
    if (!mounted) {
      return {
        productCount: 0,
        lowStockCount: 0,
        openOrderCount: 0,
        unitsOnOrder: 0,
        issues: [] as DashboardIssue[],
        upcomingJobs: [] as UpcomingJob[],
        recentActivity: [] as RecentActivity[],
      };
    }

    const products = getProducts();
    const inventory = getInventory();
    const orders = getOrders();
    const activity = getActivityLog();
    const jobs = getProjectionJobs();
    const demands = getProjectionDemands();
    const stockSummary = getStockSummary();
    const productsById = new Map(products.map((product) => [product.id, product]));
    const stockByProductId = new Map<number, number>();

    for (const item of inventory) {
      stockByProductId.set(
        item.productId,
        (stockByProductId.get(item.productId) ?? 0) + safeNumber(item.stock)
      );
    }

    const productLabel = (productId: number) => {
      const product = productsById.get(productId);
      if (!product) return `Product #${productId}`;
      return [product.brandUses, product.model || product.name, product.sizeGauge]
        .filter(Boolean)
        .join(" ");
    };

    const outOfStockIssues: DashboardIssue[] = stockSummary.outOfStockItems.map((item) => ({
      id: `out-${item.id}`,
      label: productLabel(item.productId),
      detail: "0 remaining",
      tone: "danger",
    }));
    const lowStockIssues: DashboardIssue[] = stockSummary.lowStockItems.map((item) => {
      const minimum = safeNumber(productsById.get(item.productId)?.minimum);
      return {
        id: `low-${item.id}`,
        label: productLabel(item.productId),
        detail: `${safeNumber(item.stock)} remaining${minimum > 0 ? ` · Minimum ${minimum}` : ""}`,
        tone: "warning" as const,
      };
    });

    const demandsByJobId = new Map<string, typeof demands>();
    for (const demand of demands) {
      const jobDemands = demandsByJobId.get(demand.jobId) ?? [];
      jobDemands.push(demand);
      demandsByJobId.set(demand.jobId, jobDemands);
    }

    const runningDemandByProductId = new Map<number, number>();
    const upcomingJobs = jobs
      .filter((job) => job.dateNeeded >= localDateKey())
      .sort((left, right) => left.dateNeeded.localeCompare(right.dateNeeded))
      .slice(0, 5)
      .map((job) => {
        let itemsAtRisk = 0;

        for (const demand of demandsByJobId.get(job.id) ?? []) {
          const totalDemand = (runningDemandByProductId.get(demand.productId) ?? 0) + safeNumber(demand.requiredQty);
          runningDemandByProductId.set(demand.productId, totalDemand);
          const currentStock = stockByProductId.get(demand.productId) ?? 0;
          const minimum = safeNumber(productsById.get(demand.productId)?.minimum);
          if (currentStock - totalDemand < minimum) itemsAtRisk += 1;
        }

        return { id: job.id, name: job.name, dateNeeded: job.dateNeeded, itemsAtRisk };
      });

    const openOrders = orders.filter((order) => ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status));
    return {
      productCount: products.length,
      lowStockCount: stockSummary.lowStockCount,
      openOrderCount: openOrders.length,
      unitsOnOrder: openOrders.reduce(
        (sum, order) => sum + (order.lines ?? []).reduce((lineSum, line) => lineSum + Math.max(0, safeNumber(line.quantity) - safeNumber(line.quantityReceived)), 0),
        0
      ),
      issues: [...outOfStockIssues, ...lowStockIssues].slice(0, 8),
      upcomingJobs,
      recentActivity: activity
        .slice()
        .sort((left, right) => right.date - left.date)
        .slice(0, 10)
        .map((entry) => ({ id: entry.id, message: entry.message, date: entry.date })),
    };
  }, [mounted]);

  return (
    <div className="min-h-[calc(100vh-2rem)] p-6">
      <div className="mx-auto grid max-w-[2200px] gap-6 animate-fade-in-up">
        <section className="py-3">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-semibold text-slate-950 sm:text-5xl">Dashboard</h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Stock, orders and inventory at a glance.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryMetric href="/inventory" label="Products" value={dashboard.productCount} />
              <SummaryMetric href="/inventory-order" label="Low Stock" value={dashboard.lowStockCount} tone={dashboard.lowStockCount > 0 ? "warning" : "neutral"} />
              <SummaryMetric href="/purchase-orders" label="Open POs" value={dashboard.openOrderCount} />
              <SummaryMetric href="/purchase-orders" label="Units on Order" value={dashboard.unitsOnOrder} />
            </div>
          </div>
        </section>

        {!mounted ? (
          <div className="rounded-lg border border-slate-200/80 bg-white p-6 text-slate-500">Loading dashboard...</div>
        ) : (
          <>
            <section className="rounded-lg border border-slate-200/90 bg-white p-6">
              <h2 className="text-2xl font-semibold text-slate-950">Needs attention</h2>
              {dashboard.issues.length === 0 ? (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="font-medium text-slate-950">All clear</p>
                  <p className="mt-1 text-sm text-slate-600">No stock or order issues need attention.</p>
                </div>
              ) : (
                <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                  {dashboard.issues.map((issue) => (
                    <Link key={issue.id} href="/inventory-order" className="flex items-center gap-4 py-4 transition hover:bg-slate-50">
                      <span className={`h-2 w-2 rounded-full ${issue.tone === "danger" ? "bg-rose-500" : "bg-amber-500"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{issue.tone === "danger" ? "Out of stock" : "Low stock"}</p>
                        <p className="mt-1 truncate font-medium text-slate-950">{issue.label}</p>
                      </div>
                      <p className="shrink-0 text-sm text-slate-600">{issue.detail}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-lg border border-slate-200/90 bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold text-slate-950">Upcoming jobs</h2>
                  <Link href="/stock-projection" className="text-sm font-medium">View projection</Link>
                </div>
                {dashboard.upcomingJobs.length === 0 ? (
                  <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">No upcoming jobs currently added.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                    {dashboard.upcomingJobs.map((job) => (
                      <Link key={job.id} href="/stock-projection" className="flex items-center gap-4 py-3 transition hover:bg-slate-50">
                        <time className="w-14 shrink-0 text-sm font-medium text-slate-600" dateTime={job.dateNeeded}>{formatDate(job.dateNeeded)}</time>
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-950">{job.name}</span>
                        <span className={job.itemsAtRisk > 0 ? "text-sm text-amber-700" : "text-sm text-slate-600"}>
                          {job.itemsAtRisk > 0 ? `${job.itemsAtRisk} item${job.itemsAtRisk === 1 ? "" : "s"} at risk` : "Stock OK"}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-200/90 bg-white p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-semibold text-slate-950">Recent activity</h2>
                  <Link href="/reports" className="text-sm font-medium">View reports</Link>
                </div>
                {dashboard.recentActivity.length === 0 ? (
                  <p className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">No recent activity.</p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                    {dashboard.recentActivity.map((activity) => (
                      <div key={activity.id} className="flex items-start justify-between gap-4 py-3">
                        <p className="text-sm text-slate-950">{activity.message}</p>
                        <time className="shrink-0 text-xs text-slate-500" dateTime={new Date(activity.date).toISOString()}>{formatTimestamp(activity.date)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryMetric({ href, label, value, tone = "neutral" }: { href: string; label: string; value: number; tone?: "neutral" | "warning" }) {
  return (
    <Link href={href} className={`rounded-lg border px-4 py-3 transition hover:bg-slate-100 ${tone === "warning" ? "border-amber-200/80 bg-slate-50" : "border-slate-200 bg-slate-50"}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className={tone === "warning" ? "mt-2 text-2xl font-semibold text-amber-900" : "mt-2 text-2xl font-semibold text-slate-950"}>{value}</p>
    </Link>
  );
}