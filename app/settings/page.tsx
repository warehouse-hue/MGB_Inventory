"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { getCloudLastSyncedAt, syncCloudSnapshotNow } from "../lib/cloud-sync";
import {
  addActivity,
  getActivityLog,
  getAppSettings,
  getInventory,
  getOrders,
  getProducts,
  getProjectionDemands,
  getProjectionJobs,
  getSuppliers,
  getTransactions,
  saveAppSettings,
  saveActivityLog,
  saveInventory,
  saveOrders,
  saveProjectionDemands,
  saveProjectionJobs,
  saveProducts,
  saveSuppliers,
  saveTransactions,
} from "../lib/storage";

const WEEK_DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

const HOURS = Array.from({ length: 24 }, (_, index) => index);

type BackupData = {
  products?: unknown;
  inventory?: unknown;
  orders?: unknown;
  suppliers?: unknown;
  transactions?: unknown;
  activityLog?: unknown;
  projectionJobs?: unknown;
  projectionDemands?: unknown;
  appSettings?: unknown;
};

type BackupPayload = {
  version?: number;
  exportedAt?: string;
  data?: BackupData;
};

type SmokeTestResult = {
  route: string;
  ok: boolean;
  detail: string;
};

const SMOKE_TEST_ROUTES = [
  "/dashboard",
  "/inventory",
  "/products",
  "/inventory-order",
  "/stock-projection",
  "/suppliers",
  "/purchase-orders",
  "/reports",
  "/settings",
  "/import",
] as const;

const SMOKE_SNAPSHOT_KEYS = [
  "mgb-products",
  "mgb-inventory",
  "mgb-orders",
  "mgb-suppliers",
  "mgb-transactions",
  "mgb-activity-log",
  "mgb-stock-projection-jobs-v2",
  "mgb-stock-projection-demands-v2",
  "mgb-app-settings-v1",
  "mgb-cloud-updated-at",
] as const;

function captureSmokeSnapshot() {
  if (typeof window === "undefined") {
    return {} as Record<string, string | null>;
  }

  const snapshot: Record<string, string | null> = {};
  for (const key of SMOKE_SNAPSHOT_KEYS) {
    snapshot[key] = localStorage.getItem(key);
  }

  return snapshot;
}

function restoreSmokeSnapshot(snapshot: Record<string, string | null>) {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of SMOKE_SNAPSHOT_KEYS) {
    const value = snapshot[key] ?? null;
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  }

  window.dispatchEvent(new Event("mgb-storage-updated"));
}

export default function Page() {
  const ARM_THRESHOLD = 5;
  const [armCount, setArmCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [wipePhrase, setWipePhrase] = useState("");
  const [supabaseHealth, setSupabaseHealth] = useState<"checking" | "healthy" | "unreachable" | "error" | "not-configured">("checking");
  const [supabaseDetail, setSupabaseDetail] = useState("");
  const [supabaseLatencyMs, setSupabaseLatencyMs] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [syncDetail, setSyncDetail] = useState("");
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number>(0);
  const [pendingRestore, setPendingRestore] = useState<{
    fileName: string;
    payload: BackupPayload;
    counts: Record<string, number>;
  } | null>(null);
  const [smokeStatus, setSmokeStatus] = useState<"idle" | "running" | "done">("idle");
  const [smokeResults, setSmokeResults] = useState<SmokeTestResult[]>([]);
  const [smokeLastRunAt, setSmokeLastRunAt] = useState<string>("");
  const [overviewEmailInput, setOverviewEmailInput] = useState("");
  const [overviewEmailRecipients, setOverviewEmailRecipients] = useState<string[]>([]);
  const [isSendingOverview, setIsSendingOverview] = useState(false);
  const [overviewEmailMessage, setOverviewEmailMessage] = useState("");
  const [overviewEmailError, setOverviewEmailError] = useState("");
  const [weeklyAutoEnabled, setWeeklyAutoEnabled] = useState(false);
  const [weeklySendDays, setWeeklySendDays] = useState<number[]>([1]);
  const [weeklySendHour, setWeeklySendHour] = useState(8);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const cloudConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  useEffect(() => {
    setLastCloudSyncAt(getCloudLastSyncedAt());

    const savedEmailListRaw = localStorage.getItem("mgb-overview-email-list") || "";
    const legacySavedEmail = localStorage.getItem("mgb-overview-email-to") || "";
    const savedAutoEnabled = localStorage.getItem("mgb-overview-email-auto-enabled");
    const savedAutoDay = Number(localStorage.getItem("mgb-overview-email-auto-day") || "1");
    const savedAutoDaysRaw = localStorage.getItem("mgb-overview-email-auto-days") || "";
    const savedAutoHour = Number(localStorage.getItem("mgb-overview-email-auto-hour") || "8");

    const parsedEmailList = (() => {
      try {
        const parsed = JSON.parse(savedEmailListRaw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
          .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
          .filter((value, index, arr) => value.includes("@") && arr.indexOf(value) === index);
      } catch {
        return [];
      }
    })();

    if (parsedEmailList.length > 0) {
      setOverviewEmailRecipients(parsedEmailList);
    } else if (legacySavedEmail && legacySavedEmail.includes("@")) {
      setOverviewEmailRecipients([legacySavedEmail.trim().toLowerCase()]);
    }

    const parsedDays = (() => {
      try {
        const parsed = JSON.parse(savedAutoDaysRaw) as unknown;
        if (!Array.isArray(parsed)) return [];

        return parsed
          .map((value) => Number(value))
          .filter((value, index, arr) => Number.isInteger(value) && value >= 0 && value <= 6 && arr.indexOf(value) === index)
          .sort((a, b) => a - b);
      } catch {
        return [];
      }
    })();

    setWeeklyAutoEnabled(savedAutoEnabled === "1");
    if (parsedDays.length > 0) {
      setWeeklySendDays(parsedDays);
    } else {
      setWeeklySendDays(Number.isFinite(savedAutoDay) ? [Math.min(6, Math.max(0, savedAutoDay))] : [1]);
    }
    setWeeklySendHour(Number.isFinite(savedAutoHour) ? Math.min(23, Math.max(0, savedAutoHour)) : 8);

    const onStorageUpdate = () => {
      setLastCloudSyncAt(getCloudLastSyncedAt());
    };

    window.addEventListener("mgb-storage-updated", onStorageUpdate as EventListener);

    return () => {
      window.removeEventListener("mgb-storage-updated", onStorageUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("mgb-overview-email-list", JSON.stringify(overviewEmailRecipients));
    localStorage.setItem("mgb-overview-email-to", overviewEmailRecipients[0] || "");
  }, [overviewEmailRecipients]);

  const buildOverviewMarkdown = () => {
    const orders = getOrders();
    const inventory = getInventory();
    const products = getProducts();
    const settings = getAppSettings();
    const productsById = new Map(products.map((product) => [product.id, product]));
    const now = new Date();

    const activeOrders = orders.filter((order) => order.status === "OPEN");
    const awaitingOrders = orders.filter((order) => order.status === "DELIVERED_PENDING");
    const archivedOrders = orders.filter((order) => order.status === "CLOSED");
    const inboundUnits = activeOrders.reduce((sum, order) => sum + order.quantity, 0);

    const totalUnits = inventory.reduce((sum, item) => sum + Number(item.stock || 0), 0);
    const lowStockItems = inventory
      .filter((item) => {
        const product = productsById.get(item.productId);
        const minimum = Number(product?.minimum ?? 0);
        if (minimum <= 0 || item.stock <= 0) return false;
        return settings.lowStockMode === "lte" ? item.stock <= minimum : item.stock < minimum;
      })
      .map((item) => {
        const product = productsById.get(item.productId);
        const minimum = Number(product?.minimum ?? 0);
        return {
          ...item,
          productName: product?.name || `Product ${item.productId}`,
          minimum,
          shortfall: Math.max(0, minimum - Number(item.stock || 0)),
        };
      })
      .sort((a, b) => b.shortfall - a.shortfall);

    const outOfStockItems = inventory
      .filter((item) => {
        if (item.stock !== 0) return false;
        if (settings.includeNonStockedInAlerts) return true;
        const product = productsById.get(item.productId);
        const minimum = Number(product?.minimum ?? 0);
        return minimum > 0;
      })
      .map((item) => {
        const product = productsById.get(item.productId);
        return {
          ...item,
          productName: product?.name || `Product ${item.productId}`,
          minimum: Number(product?.minimum ?? 0),
        };
      });

    const lowStockCount = lowStockItems.length;
    const outOfStockCount = outOfStockItems.length;
    const stockCoveragePct = products.length > 0 ? Math.round(((products.length - outOfStockCount) / products.length) * 100) : 100;
    const inventoryHealthScore = Math.max(0, Math.min(100, 100 - outOfStockCount * 6 - lowStockCount * 2));

    const topSuppliers = Object.entries(
      activeOrders.reduce(
        (acc, order) => {
          const key = (order.supplier || "Unknown").trim() || "Unknown";
          acc[key] = (acc[key] || 0) + Number(order.quantity || 0);
          return acc;
        },
        {} as Record<string, number>
      )
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const inboundValue = activeOrders.reduce(
      (sum, order) => sum + Number(order.quantity || 0) * Number(order.lastBuyPrice || 0),
      0
    );

    const overdueAwaiting = awaitingOrders
      .map((order) => {
        const orderedDate = new Date(order.orderedDate);
        const diffMs = now.getTime() - orderedDate.getTime();
        const diffDays = Number.isFinite(diffMs) ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
        return {
          ...order,
          ageDays: Math.max(0, diffDays),
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 5);

    const openOrdersByAge = activeOrders
      .map((order) => {
        const orderedDate = new Date(order.orderedDate);
        const diffMs = now.getTime() - orderedDate.getTime();
        const diffDays = Number.isFinite(diffMs) ? Math.floor(diffMs / (1000 * 60 * 60 * 24)) : 0;
        return {
          ...order,
          ageDays: Math.max(0, diffDays),
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays)
      .slice(0, 5);

    const supplierSection =
      topSuppliers.length > 0
        ? topSuppliers.map(([supplier, units]) => `- ${supplier}: ${units} units inbound`).join("\n")
        : "- No open supplier allocations";

    const awaitingSection =
      overdueAwaiting.length > 0
        ? overdueAwaiting
            .map(
              (order) =>
                `- ${order.productName} (${order.variant || "-"}) | ${order.quantity} units | ${order.ageDays} day(s) waiting`
            )
            .join("\n")
        : "- No orders are waiting for stock readjustment";

    const openOrderAgingSection =
      openOrdersByAge.length > 0
        ? openOrdersByAge
            .map(
              (order) =>
                `- ${order.productName} (${order.variant || "-"}) | ${order.quantity} units | ${order.ageDays} day(s) since ordered`
            )
            .join("\n")
        : "- No open orders";

    const lowStockSection =
      lowStockItems.length > 0
        ? lowStockItems
            .slice(0, 8)
            .map(
              (item) =>
                `- ${item.productName} (${item.variant || "-"}) | on hand ${item.stock} | min ${item.minimum} | shortfall ${item.shortfall}`
            )
            .join("\n")
        : "- No low-stock variants right now";

    const outOfStockSection =
      outOfStockItems.length > 0
        ? outOfStockItems
            .slice(0, 8)
            .map((item) => `- ${item.productName} (${item.variant || "-"}) | minimum ${item.minimum}`)
            .join("\n")
        : "- No tracked variants are out of stock";

    const actionQueue: string[] = [];

    if (outOfStockCount > 0) {
      actionQueue.push(`Prioritize replenishment for ${outOfStockCount} out-of-stock variants.`);
    }

    if (awaitingOrders.length > 0) {
      actionQueue.push(`Finalize stock readjustment for ${awaitingOrders.length} delivered order(s).`);
    }

    if (openOrdersByAge[0]?.ageDays >= 14) {
      actionQueue.push(`Follow up on aging PO: ${openOrdersByAge[0].productName} has been open ${openOrdersByAge[0].ageDays} day(s).`);
    }

    if (actionQueue.length === 0) {
      actionQueue.push("No urgent actions detected. Current flow is stable.");
    }

    return [
      `# Inventory Operations Brief - ${new Date().toLocaleDateString()}`,
      "",
      "## Key Metrics",
      `- Open Orders::${activeOrders.length}`,
      `- Awaiting Readjustment::${awaitingOrders.length}`,
      `- Archived Orders::${archivedOrders.length}`,
      `- Inbound Units::${inboundUnits}`,
      `- Inbound Value::${inboundValue > 0 ? `$${inboundValue.toFixed(2)}` : "$0.00"}`,
      `- Stock Coverage::${stockCoveragePct}%`,
      `- Health Score::${inventoryHealthScore}/100`,
      "",
      "## Action Queue",
      ...actionQueue.map((item) => `- ${item}`),
      "",
      "## Stock Snapshot",
      `- Products tracked: ${products.length}`,
      `- Units on hand: ${totalUnits}`,
      `- Low stock variants: ${lowStockCount}`,
      `- Out of stock variants: ${outOfStockCount}`,
      "",
      "## Top Suppliers (Open Orders)",
      supplierSection,
      "",
      "## Open Order Aging (Oldest First)",
      openOrderAgingSection,
      "",
      "## Awaiting Readjustment (Oldest First)",
      awaitingSection,
      "",
      "## Low Stock Watchlist",
      lowStockSection,
      "",
      "## Out of Stock Watchlist",
      outOfStockSection,
    ].join("\n");
  };

  const sendOverviewEmail = async ({
    recipients,
    source,
  }: {
    recipients: string[];
    source: "manual" | "weekly-auto";
  }) => {
    setIsSendingOverview(true);

    if (source === "manual") {
      setOverviewEmailError("");
      setOverviewEmailMessage("");
    }

    try {
      if (recipients.length === 0) {
        if (source === "manual") {
          setOverviewEmailError("Add at least one recipient email first.");
        }
        return false;
      }

      const overview = buildOverviewMarkdown();
      const failedRecipients: string[] = [];

      for (const recipient of recipients) {
        const response = await fetch("/api/overview-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: recipient,
            overview,
          }),
        });

        const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

        if (!response.ok) {
          failedRecipients.push(`${recipient}${result.error ? ` (${result.error})` : ""}`);
        }
      }

      if (failedRecipients.length > 0) {
        if (source === "manual") {
          setOverviewEmailError(`Failed for: ${failedRecipients.join(", ")}`);
        }

        addActivity(`Failed to send ${source} overview email to ${failedRecipients.length} recipient(s)`);
        return false;
      }

      if (source === "manual") {
        setOverviewEmailMessage(`Overview email sent to ${recipients.length} recipient(s).`);
      } else {
        setOverviewEmailMessage(`Weekly auto email sent to ${recipients.length} recipient(s).`);
      }

      addActivity(`Sent ${source} overview email to ${recipients.length} recipient(s)`);
      return true;
    } catch {
      if (source === "manual") {
        setOverviewEmailError("Unable to send overview email right now.");
      }

      addActivity(`Failed to send ${source} overview email due to network error`);
      return false;
    } finally {
      setIsSendingOverview(false);
    }
  };

  const handleAddOverviewEmail = () => {
    const normalized = overviewEmailInput.trim().toLowerCase();

    if (!normalized || !normalized.includes("@")) {
      setOverviewEmailError("Enter a valid email before adding.");
      return;
    }

    if (overviewEmailRecipients.includes(normalized)) {
      setOverviewEmailError("That email is already added.");
      return;
    }

    setOverviewEmailRecipients((current) => [...current, normalized]);
    setOverviewEmailInput("");
    setOverviewEmailError("");
    setOverviewEmailMessage(`Added ${normalized}.`);
  };

  const handleDeleteOverviewEmail = (email: string) => {
    setOverviewEmailRecipients((current) => current.filter((item) => item !== email));
  };

  const toggleWeeklyDay = (day: number) => {
    setWeeklySendDays((current) => {
      if (current.includes(day)) {
        return current.filter((value) => value !== day);
      }

      return [...current, day].sort((a, b) => a - b);
    });
  };

  const handleSendOverviewEmail = async () => {
    if (overviewEmailRecipients.length === 0) {
      setOverviewEmailError("Add at least one recipient email first.");
      setOverviewEmailMessage("");
      return;
    }

    await sendOverviewEmail({ recipients: overviewEmailRecipients, source: "manual" });
  };

  useEffect(() => {
    localStorage.setItem("mgb-overview-email-auto-enabled", weeklyAutoEnabled ? "1" : "0");
    localStorage.setItem("mgb-overview-email-auto-day", String(weeklySendDays[0] ?? 1));
    localStorage.setItem("mgb-overview-email-auto-days", JSON.stringify(weeklySendDays));
    localStorage.setItem("mgb-overview-email-auto-hour", String(weeklySendHour));
  }, [weeklyAutoEnabled, weeklySendDays, weeklySendHour]);

  useEffect(() => {
    if (!weeklyAutoEnabled || overviewEmailRecipients.length === 0 || weeklySendDays.length === 0) return;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStamp = weekStart.toISOString().slice(0, 10);
    const sentKeys = (() => {
      try {
        const parsed = JSON.parse(localStorage.getItem("mgb-overview-email-auto-sent-keys") || "[]") as unknown;
        return Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === "string")
          : [];
      } catch {
        return [];
      }
    })();

    const dueKeys = weeklySendDays
      .map((day) => {
        const scheduledThisWeek = new Date(weekStart);
        scheduledThisWeek.setDate(weekStart.getDate() + day);
        scheduledThisWeek.setHours(weeklySendHour, 0, 0, 0);

        const slotKey = `${weekStamp}-${day}-${weeklySendHour}`;
        return {
          due: now >= scheduledThisWeek && !sentKeys.includes(slotKey),
          slotKey,
        };
      })
      .filter((slot) => slot.due)
      .map((slot) => slot.slotKey);

    if (dueKeys.length === 0) return;

    const runAutoSend = async () => {
      const successfulKeys: string[] = [];

      for (const dueKey of dueKeys) {
        const didSend = await sendOverviewEmail({ recipients: overviewEmailRecipients, source: "weekly-auto" });
        if (didSend) {
          successfulKeys.push(dueKey);
        }
      }

      if (successfulKeys.length > 0) {
        const nextKeys = Array.from(new Set([...sentKeys, ...successfulKeys])).slice(-120);
        localStorage.setItem("mgb-overview-email-auto-sent-keys", JSON.stringify(nextKeys));
      }
    };

    void runAutoSend();
  }, [weeklyAutoEnabled, weeklySendDays, weeklySendHour, overviewEmailRecipients]);

  useEffect(() => {
    if (!cloudConfigured) {
      setSupabaseHealth("not-configured");
      setSupabaseDetail("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    return;
  }, [cloudConfigured]);

  useEffect(() => {
    if (!cloudConfigured) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const runHealthCheck = async () => {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

      setSupabaseHealth("checking");
      setSupabaseDetail("Checking Supabase REST endpoint...");
      setSupabaseLatencyMs(null);

      const startedAt = performance.now();

      try {
        const response = await fetch(`${baseUrl}/rest/v1/`, {
          method: "GET",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          signal: controller.signal,
        });

        if (cancelled) return;

        const latency = Math.round(performance.now() - startedAt);
        setSupabaseLatencyMs(latency);

        if (response.ok) {
          setSupabaseHealth("healthy");
          setSupabaseDetail(`Connected to Supabase in ${latency}ms.`);
        } else {
          setSupabaseHealth("error");
          setSupabaseDetail(`Supabase responded with HTTP ${response.status}.`);
        }
      } catch (error) {
        if (cancelled) return;
        const aborted = (error as Error)?.name === "AbortError";
        setSupabaseHealth(aborted ? "unreachable" : "error");
        setSupabaseDetail(aborted ? "Supabase health check timed out after 6s." : "Could not reach Supabase.");
      } finally {
        clearTimeout(timeout);
      }
    };

    void runHealthCheck();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [cloudConfigured]);

  const supabaseHealthLabel = {
    checking: "Checking",
    healthy: "Healthy",
    unreachable: "Unreachable",
    error: "Error",
    "not-configured": "Not Configured",
  }[supabaseHealth];

  const supabaseHealthTone = {
    checking: "cyan",
    healthy: "emerald",
    unreachable: "amber",
    error: "rose",
    "not-configured": "slate",
  } as const;

  const armHiddenWipe = () => {
    const nextCount = Math.min(armCount + 1, ARM_THRESHOLD);
    setArmCount(nextCount);

    if (nextCount < ARM_THRESHOLD) {
      setStatusMessage(`Maintenance control armed ${nextCount}/${ARM_THRESHOLD}.`);
      return;
    }

    setStatusMessage("Maintenance control armed. Run once to wipe all inventory data.");
    setWipePhrase("");
  };

  const clearInventoryData = () => {
    if (armCount < ARM_THRESHOLD) {
      setStatusMessage("Maintenance control is not armed yet.");
      return;
    }

    if (wipePhrase.trim() !== "WIPE NOW") {
      setStatusMessage("Type WIPE NOW in the field to confirm wipe.");
      return;
    }

    saveProducts([]);
    saveInventory([]);
    saveOrders([]);
    saveSuppliers([]);
    saveTransactions([]);
    saveActivityLog([]);
    addActivity("Manual data wipe executed from hidden settings control.");
    setStatusMessage("All inventory data was cleared.");
    setWipePhrase("");
    setArmCount(0);
  };

  const runManualCloudSync = async () => {
    if (!cloudConfigured) {
      setSyncStatus("error");
      setSyncDetail("Cloud sync is not configured in this environment.");
      return;
    }

    setSyncStatus("syncing");
    setSyncDetail("Syncing local snapshot to cloud...");

    try {
      const didSync = await syncCloudSnapshotNow();

      if (!didSync) {
        setSyncStatus("error");
        setSyncDetail("Cloud sync is not available in this environment.");
        return;
      }

      const syncedAt = getCloudLastSyncedAt();
      setLastCloudSyncAt(syncedAt);
      setSyncStatus("success");
      setSyncDetail("Cloud sync completed.");
    } catch {
      setSyncStatus("error");
      setSyncDetail("Cloud sync failed. Please try again.");
    }
  };

  const exportBackup = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        products: getProducts(),
        inventory: getInventory(),
        orders: getOrders(),
        suppliers: getSuppliers(),
        transactions: getTransactions(),
        activityLog: getActivityLog(),
        projectionJobs: getProjectionJobs(),
        projectionDemands: getProjectionDemands(),
        appSettings: getAppSettings(),
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:]/g, "-");
    link.href = URL.createObjectURL(blob);
    link.download = `mgb-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    setStatusMessage("Backup exported.");
  };

  const restoreBackupFromFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;

      const data = parsed?.data;
      if (!data || typeof data !== "object") {
        setStatusMessage("Backup file is invalid.");
        setPendingRestore(null);
        return;
      }

      const counts = {
        products: Array.isArray(data.products) ? data.products.length : 0,
        inventory: Array.isArray(data.inventory) ? data.inventory.length : 0,
        orders: Array.isArray(data.orders) ? data.orders.length : 0,
        suppliers: Array.isArray(data.suppliers) ? data.suppliers.length : 0,
        transactions: Array.isArray(data.transactions) ? data.transactions.length : 0,
        activityLog: Array.isArray(data.activityLog) ? data.activityLog.length : 0,
        projectionJobs: Array.isArray(data.projectionJobs) ? data.projectionJobs.length : 0,
        projectionDemands: Array.isArray(data.projectionDemands) ? data.projectionDemands.length : 0,
      };

      setPendingRestore({
        fileName: file.name,
        payload: parsed,
        counts,
      });
      setStatusMessage("Backup loaded. Review preview and confirm restore.");
    } catch {
      setStatusMessage("Could not read backup file. Check file format.");
      setPendingRestore(null);
    }
  };

  const confirmRestore = () => {
    const data = pendingRestore?.payload?.data;
    if (!data || typeof data !== "object") {
      setStatusMessage("No backup is loaded for restore.");
      return;
    }

    try {

      saveProducts(Array.isArray(data.products) ? data.products : []);
      saveInventory(Array.isArray(data.inventory) ? data.inventory : []);
      saveOrders(Array.isArray(data.orders) ? data.orders : []);
      saveSuppliers(Array.isArray(data.suppliers) ? data.suppliers : []);
      saveTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      saveActivityLog(Array.isArray(data.activityLog) ? data.activityLog : []);
      saveProjectionJobs(Array.isArray(data.projectionJobs) ? data.projectionJobs : []);
      saveProjectionDemands(Array.isArray(data.projectionDemands) ? data.projectionDemands : []);

      if (data.appSettings && typeof data.appSettings === "object") {
        saveAppSettings(data.appSettings as Record<string, unknown>);
      }

      addActivity("Backup restore executed from settings.");
      setStatusMessage("Backup restored successfully.");
      setPendingRestore(null);
    } catch {
      setStatusMessage("Could not restore backup. Check file format.");
    }
  };

  const lastSyncLabel = lastCloudSyncAt
    ? new Date(lastCloudSyncAt).toLocaleString()
    : "Never";

  const runSmokeTest = async () => {
    setSmokeStatus("running");
    setSmokeResults([]);

    const localSnapshot = captureSmokeSnapshot();

    try {
      const nextResults = await Promise.all(
        SMOKE_TEST_ROUTES.map(async (route) => {
          try {
            const response = await fetch(`${route}?_smoke=${Date.now()}`, {
              method: "GET",
              cache: "no-store",
            });

            if (!response.ok) {
              return {
                route,
                ok: false,
                detail: `HTTP ${response.status}`,
              } satisfies SmokeTestResult;
            }

            const content = await response.text();
            const hasErrorSignal =
              /application error|something went wrong|hydration failed|unhandled runtime error/i.test(content);

            if (hasErrorSignal) {
              return {
                route,
                ok: false,
                detail: "Runtime error signal detected",
              } satisfies SmokeTestResult;
            }

            return {
              route,
              ok: true,
              detail: "OK",
            } satisfies SmokeTestResult;
          } catch {
            return {
              route,
              ok: false,
              detail: "Request failed",
            } satisfies SmokeTestResult;
          }
        })
      );

      setSmokeResults(nextResults);
      setSmokeLastRunAt(new Date().toLocaleString());
      setSmokeStatus("done");
    } finally {
      // Smoke tests must never leave operational data altered.
      restoreSmokeSnapshot(localSnapshot);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-settings">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p
              onClick={armHiddenWipe}
              className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-slate-300/80 cursor-default select-none"
            >
              SYSTEM CONFIG
            </p>
            <div className="mt-3 command-slip-icon">
              <Settings2 />
              Settings
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Settings Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/78 sm:text-base">
              Configuration surface for sync, workspace behavior, and future warehouse controls.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SettingsChip label="Cloud" value={cloudConfigured ? "READY" : "LOCAL"} tone={cloudConfigured ? "emerald" : "amber"} />
            <SettingsChip label="Supabase" value={supabaseHealthLabel} tone={supabaseHealthTone[supabaseHealth]} />
            <SettingsChip label="Mode" value="OPS" tone="slate" />
            <SettingsChip label="Controls" value="SOON" tone="cyan" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-4">
        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Sync state</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Cloud configuration</h2>
          <p className="mt-3 text-sm text-slate-600">
            {cloudConfigured
              ? "This deployment has cloud sync environment values available."
              : "This deployment is currently running without full cloud sync configuration."}
          </p>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Supabase health</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Connection status</h2>
          <p className="mt-3 text-sm text-slate-600">{supabaseDetail || "No status available yet."}</p>
          {supabaseLatencyMs != null ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Latency: {supabaseLatencyMs}ms</p>
          ) : null}
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Planned controls</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Cloud sync control</h2>
          <p className="mt-3 text-sm text-slate-600">
            Trigger an immediate snapshot sync and check when cloud sync last completed.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Last sync: {lastSyncLabel}
          </p>
          {syncDetail ? <p className="mt-2 text-sm text-slate-600">{syncDetail}</p> : null}
          <button
            type="button"
            onClick={runManualCloudSync}
            disabled={syncStatus === "syncing"}
            className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
          </button>
        </div>

        <div className="glass-card p-6">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Status</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Backup and restore</h2>
          <p className="mt-3 text-sm text-slate-600">
            Export a full backup snapshot or restore a previous backup file.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportBackup}
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Export Backup
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
            >
              Restore Backup
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                void restoreBackupFromFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </div>

          {pendingRestore ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Restore preview</p>
              <p className="mt-2 text-sm text-slate-700">File: {pendingRestore.fileName}</p>
              <p className="mt-1 text-sm text-slate-700">Version: {pendingRestore.payload.version ?? "Unknown"}</p>
              <p className="mt-1 text-sm text-slate-700">
                Exported: {pendingRestore.payload.exportedAt ? new Date(pendingRestore.payload.exportedAt).toLocaleString() : "Unknown"}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Row counts</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-4">
                <p>Products: {pendingRestore.counts.products}</p>
                <p>Inventory: {pendingRestore.counts.inventory}</p>
                <p>Orders: {pendingRestore.counts.orders}</p>
                <p>Suppliers: {pendingRestore.counts.suppliers}</p>
                <p>Transactions: {pendingRestore.counts.transactions}</p>
                <p>Activity: {pendingRestore.counts.activityLog}</p>
                <p>Proj Jobs: {pendingRestore.counts.projectionJobs}</p>
                <p>Proj Demand: {pendingRestore.counts.projectionDemands}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmRestore}
                  className="inline-flex items-center rounded-2xl border border-rose-300 bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-200"
                >
                  Confirm Restore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingRestore(null);
                    setStatusMessage("Restore cancelled.");
                  }}
                  className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="glass-card p-6 md:col-span-2">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Email automation</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Overview digest delivery</h2>
          <p className="mt-3 text-sm text-slate-600">
            Send the inventory operations brief now, and optionally enable weekly automatic delivery.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={overviewEmailInput}
              onChange={(event) => setOverviewEmailInput(event.target.value)}
              placeholder="recipient@company.com"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            />
            <button
              type="button"
              onClick={handleAddOverviewEmail}
              className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Add email
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Saved recipients</p>
            {overviewEmailRecipients.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No emails saved yet.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {overviewEmailRecipients.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="text-slate-700">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteOverviewEmail(email)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3">
            <button
              type="button"
              onClick={handleSendOverviewEmail}
              disabled={isSendingOverview || overviewEmailRecipients.length === 0}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSendingOverview ? "Sending..." : "Send overview now"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={weeklyAutoEnabled}
                onChange={(event) => setWeeklyAutoEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Weekly auto-send
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">Days</span>
              <button
                type="button"
                onClick={() => setShowDayPicker((current) => !current)}
                disabled={!weeklyAutoEnabled}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Select which days ({weeklySendDays.length})
              </button>
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block">Hour (24h)</span>
              <select
                value={weeklySendHour}
                onChange={(event) => setWeeklySendHour(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                disabled={!weeklyAutoEnabled}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
          </div>

          {showDayPicker ? (
            <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Choose weekly days</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {WEEK_DAYS.map((day) => {
                  const active = weeklySendDays.includes(day.value);

                  return (
                    <button
                      key={day.value}
                      type="button"
                      disabled={!weeklyAutoEnabled}
                      onClick={() => toggleWeeklyDay(day.value)}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p className="mt-2 text-xs text-slate-500">
            Selected: {weeklySendDays.length > 0 ? WEEK_DAYS.filter((day) => weeklySendDays.includes(day.value)).map((day) => day.label).join(", ") : "None"}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            Auto-send runs once per week when this app is opened after the scheduled time.
          </p>
          {overviewEmailError ? <p className="mt-2 text-sm text-rose-700">{overviewEmailError}</p> : null}
          {overviewEmailMessage ? <p className="mt-2 text-sm text-emerald-700">{overviewEmailMessage}</p> : null}
        </div>

        <div className="glass-card p-6 md:col-span-2">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Data tools</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">CSV Importer</h2>
          <p className="mt-3 text-sm text-slate-600">
            Import product and stock rows from CSV files.
          </p>
          <Link
            href="/import"
            className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
          >
            Open Importer
          </Link>
        </div>

        <div className="glass-card p-6 md:col-span-2">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Diagnostics</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Smoke test</h2>
          <p className="mt-3 text-sm text-slate-600">
            Run a quick route-health check across all major app pages from Settings.
          </p>
          <button
            type="button"
            onClick={runSmokeTest}
            disabled={smokeStatus === "running"}
            className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {smokeStatus === "running" ? "Running smoke test..." : "Run Smoke Test"}
          </button>

          {smokeLastRunAt ? (
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Last run: {smokeLastRunAt}
            </p>
          ) : null}

          {smokeResults.length > 0 ? (
            <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              {smokeResults.map((result) => (
                <div key={result.route} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-slate-600">{result.route}</span>
                  <span className={result.ok ? "text-emerald-700" : "text-rose-700"}>
                    {result.ok ? "PASS" : `FAIL (${result.detail})`}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-800">
          {statusMessage}
          {armCount >= ARM_THRESHOLD ? (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={wipePhrase}
                onChange={(event) => setWipePhrase(event.target.value)}
                placeholder="Type WIPE NOW"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 sm:w-52"
              />
              <button
                type="button"
                onClick={clearInventoryData}
                className="inline-flex items-center rounded-xl border border-rose-300 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-200"
              >
                Run maintenance task
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SettingsChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "slate" | "cyan" | "rose";
}) {
  const toneClass = {
    emerald: "border-emerald-200/70 bg-emerald-400/35 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    amber: "border-amber-200/70 bg-amber-400/35 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    slate: "border-slate-200/45 bg-slate-200/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
    cyan: "border-cyan-200/70 bg-cyan-400/35 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    rose: "border-rose-200/70 bg-rose-400/35 text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
