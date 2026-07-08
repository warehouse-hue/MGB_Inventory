"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartColumnIncreasing } from "lucide-react";
import {
  addActivity,
  getInventory,
  getProducts,
  getProjectionDemands,
  getProjectionJobs,
  Product,
  ProjectionDemand,
  ProjectionJob,
  saveProjectionDemands,
  saveProjectionJobs,
} from "../lib/storage";

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function StockProjectionPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<ReturnType<typeof getInventory>>([]);
  const [jobs, setJobs] = useState<ProjectionJob[]>([]);
  const [demands, setDemands] = useState<ProjectionDemand[]>([]);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [jobForm, setJobForm] = useState({
    name: "",
    status: "Quoted" as ProjectionJob["status"],
    dateNeeded: "",
  });
  const [demandForm, setDemandForm] = useState({
    jobId: "",
    productId: "",
    requiredQty: "",
  });
  const [productSearch, setProductSearch] = useState("");
  const [isProductSearchFocused, setIsProductSearchFocused] = useState(false);

  const refreshStockData = () => {
    setProducts(getProducts());
    setInventory(getInventory());
    setJobs(getProjectionJobs());
    setDemands(getProjectionDemands());
  };

  useEffect(() => {
    refreshStockData();
    setHasHydrated(true);

    const onStorageUpdate = () => refreshStockData();
    const onFocus = () => refreshStockData();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshStockData();
      }
    };
    const onBrowserStorage = () => refreshStockData();

    window.addEventListener("mgb-storage-updated", onStorageUpdate as EventListener);
    window.addEventListener("storage", onBrowserStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("mgb-storage-updated", onStorageUpdate as EventListener);
      window.removeEventListener("storage", onBrowserStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const validProductIds = new Set(products.map((product) => product.id));
    const validJobIds = new Set(jobs.map((job) => job.id));

    setDemands((current) => {
      const next = current.filter(
        (demand) => validProductIds.has(demand.productId) && validJobIds.has(demand.jobId)
      );

      if (next.length !== current.length) {
        saveProjectionDemands(next);
      }

      return next;
    });
  }, [hasHydrated, products, jobs]);

  const stockByProductId = useMemo(() => {
    const stockByProductId = new Map<number, number>();

    for (const item of inventory) {
      stockByProductId.set(item.productId, (stockByProductId.get(item.productId) ?? 0) + toNumber(item.stock));
    }

    return stockByProductId;
  }, [inventory]);

  const demandByProduct = useMemo(() => {
    const map = new Map<number, number>();

    for (const demand of demands) {
      map.set(demand.productId, (map.get(demand.productId) ?? 0) + toNumber(demand.requiredQty));
    }

    return map;
  }, [demands]);

  const rows = useMemo(() => {
    return products
      .map((product) => {
        const current = stockByProductId.get(product.id) ?? 0;
        const minimum = toNumber(product.minimum ?? 0);
        const totalDemand = demandByProduct.get(product.id) ?? 0;
        const projectedStock = current - totalDemand;
        const needToOrder = Math.max(0, minimum - projectedStock);

        return {
          product,
          current,
          minimum,
          projectedStock,
          needToOrder,
        };
      })
      .filter((row) => {
        if (row.needToOrder > 0) return true;
        return (demandByProduct.get(row.product.id) ?? 0) > 0;
      })
      .sort((left, right) => right.needToOrder - left.needToOrder);
  }, [products, stockByProductId, demandByProduct]);

  const projectionStats = useMemo(() => {
    const needingOrder = rows.filter((row) => row.needToOrder > 0).length;
    const totalNeedToOrder = rows.reduce((sum, row) => sum + row.needToOrder, 0);

    return {
      jobs: jobs.length,
      lines: rows.length,
      needingOrder,
      totalNeedToOrder,
    };
  }, [jobs.length, rows]);

  const addJob = () => {
    if (!jobForm.name.trim() || !jobForm.dateNeeded) {
      return;
    }

    const nextJob: ProjectionJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: jobForm.name.trim(),
      status: jobForm.status,
      dateNeeded: jobForm.dateNeeded,
    };

    const updatedJobs = [...jobs, nextJob];
    setJobs(updatedJobs);
    saveProjectionJobs(updatedJobs);
    addActivity(`Added projection job ${nextJob.name} (${nextJob.status}) for ${nextJob.dateNeeded}`);
    setJobForm({ name: "", status: "Quoted", dateNeeded: "" });
  };

  const removeJob = (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    const updatedJobs = jobs.filter((job) => job.id !== jobId);
    const updatedDemands = demands.filter((demand) => demand.jobId !== jobId);
    setJobs(updatedJobs);
    setDemands(updatedDemands);
    saveProjectionJobs(updatedJobs);
    saveProjectionDemands(updatedDemands);
    if (targetJob) {
      addActivity(`Removed projection job ${targetJob.name}`);
    }
  };

  const addDemand = () => {
    const productId = toNumber(demandForm.productId);
    const requiredQty = toNumber(demandForm.requiredQty);

    if (!demandForm.jobId || !productId || requiredQty <= 0) {
      return;
    }

    const nextDemand: ProjectionDemand = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId,
      jobId: demandForm.jobId,
      requiredQty,
    };

    const updatedDemands = [nextDemand, ...demands];
    setDemands(updatedDemands);
    saveProjectionDemands(updatedDemands);

    const targetJob = jobs.find((job) => job.id === nextDemand.jobId);
    const targetProduct = products.find((product) => product.id === nextDemand.productId);
    addActivity(
      `Added projection demand Qty ${nextDemand.requiredQty} for ${
        targetProduct?.model || targetProduct?.name || `Product #${nextDemand.productId}`
      } on ${targetJob?.name || "job"}`
    );

    setDemandForm((current) => ({ ...current, productId: "", requiredQty: "" }));
    setProductSearch("");
  };

  const removeDemand = (id: string) => {
    const targetDemand = demands.find((demand) => demand.id === id);
    const updatedDemands = demands.filter((demand) => demand.id !== id);
    setDemands(updatedDemands);
    saveProjectionDemands(updatedDemands);

    if (targetDemand) {
      const targetJob = jobs.find((job) => job.id === targetDemand.jobId);
      const targetProduct = products.find((product) => product.id === targetDemand.productId);
      addActivity(
        `Removed projection demand Qty ${targetDemand.requiredQty} for ${
          targetProduct?.model || targetProduct?.name || `Product #${targetDemand.productId}`
        } on ${targetJob?.name || "job"}`
      );
    }
  };

  const groupedJobDemands = useMemo(() => {
    const productById = new Map(products.map((product) => [product.id, product]));
    const groups = jobs
      .map((job) => {
        const jobDemands = demands
          .filter((demand) => demand.jobId === job.id)
          .map((demand) => {
            const product = productById.get(demand.productId);
            return {
              demand,
              productLabel: product?.model || product?.name || "Unknown Product",
              productMeta: product?.productCode || product?.sku || "-",
            };
          })
          .sort((left, right) => left.productLabel.localeCompare(right.productLabel));

        return {
          job,
          demands: jobDemands,
        };
      })
      .sort((left, right) => {
        if (left.job.dateNeeded !== right.job.dateNeeded) {
          return left.job.dateNeeded.localeCompare(right.job.dateNeeded);
        }
        return left.job.name.localeCompare(right.job.name);
      });

    return groups;
  }, [demands, jobs, products]);

  const productSearchOptions = useMemo(() => {
    const normalized = productSearch.trim().toLowerCase();
    const ranked = products
      .map((product) => {
        const label = `${product.brandUses || "-"} | ${product.model || product.name || "-"} | ${product.sizeGauge || "-"} | ${product.productCode || product.sku}`;
        const haystack = `${product.brandUses || ""} ${product.model || ""} ${product.name || ""} ${product.sizeGauge || ""} ${product.productCode || ""} ${product.sku || ""}`.toLowerCase();
        return {
          product,
          label,
          startsWith: normalized ? haystack.startsWith(normalized) : false,
          includes: normalized ? haystack.includes(normalized) : true,
        };
      })
      .filter((option) => option.includes)
      .sort((left, right) => {
        if (left.startsWith && !right.startsWith) return -1;
        if (!left.startsWith && right.startsWith) return 1;
        return left.label.localeCompare(right.label);
      });

    return ranked.slice(0, 8);
  }, [products, productSearch]);

  const selectProduct = (product: Product) => {
    const label = `${product.brandUses || "-"} | ${product.model || product.name || "-"} | ${product.sizeGauge || "-"} | ${product.productCode || product.sku}`;
    setDemandForm((current) => ({ ...current, productId: String(product.id) }));
    setProductSearch(label);
    setIsProductSearchFocused(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-[2200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-stock-projection">
        <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-sky-200/80">FORECAST PANEL</p>
        <div className="mt-3 command-slip-icon">
          <ChartColumnIncreasing />
          Stock Projection
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Stock Projection</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-sky-50/80 sm:text-base">
          Upcoming jobs planner. Manage jobs and item demand in one section, then track projected stock and order needs below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="metric-card metric-card-neutral">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Upcoming Jobs</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{projectionStats.jobs}</p>
        </div>
        <div className="metric-card metric-card-amber">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Items to Order</p>
          <p className="mt-2 text-3xl font-semibold text-amber-900">{projectionStats.needingOrder}</p>
        </div>
        <div className="metric-card metric-card-emerald">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Projected Lines</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-900">{projectionStats.lines}</p>
        </div>
        <div className="metric-card metric-card-rose">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Need to Order</p>
          <p className="mt-2 text-3xl font-semibold text-rose-900">{projectionStats.totalNeedToOrder}</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">Upcoming jobs and item demand</p>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Add upcoming job</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              type="text"
              value={jobForm.name}
              onChange={(event) => setJobForm({ ...jobForm, name: event.target.value })}
              placeholder="Job name"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
            />
            <select
              value={jobForm.status}
              onChange={(event) =>
                setJobForm({
                  ...jobForm,
                  status: event.target.value as ProjectionJob["status"],
                })
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
            >
              <option value="Quoted">Quoted</option>
              <option value="Invoiced">Invoiced</option>
              <option value="Booked">Booked</option>
            </select>
            <input
              type="date"
              value={jobForm.dateNeeded}
              onChange={(event) => setJobForm({ ...jobForm, dateNeeded: event.target.value })}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
            />
            <button
              type="button"
              onClick={addJob}
              className="rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
            >
              Add Job
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Add item demand to a job</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
          <select
            value={demandForm.jobId}
            onChange={(event) => setDemandForm({ ...demandForm, jobId: event.target.value })}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
          >
            <option value="">Select job</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <input
              type="text"
              value={productSearch}
              onFocus={() => setIsProductSearchFocused(true)}
              onChange={(event) => {
                setProductSearch(event.target.value);
                setDemandForm((current) => ({ ...current, productId: "" }));
                setIsProductSearchFocused(true);
              }}
              placeholder="Search product (brand, model, size, code)"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
            />
            {isProductSearchFocused ? (
              <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                {productSearchOptions.length > 0 ? (
                  productSearchOptions.map(({ product, label }) => (
                    <button
                      key={product.id}
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectProduct(product);
                      }}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 last:border-b-0"
                    >
                      {label}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-slate-500">No matching products.</div>
                )}
              </div>
            ) : null}
          </div>
          <input
            type="number"
            min={1}
            value={demandForm.requiredQty}
            onChange={(event) => setDemandForm({ ...demandForm, requiredQty: event.target.value })}
            placeholder="Required qty"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
          />
          <button
            type="button"
            onClick={addDemand}
            className="rounded-2xl bg-slate-950 px-4 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            Add Demand
          </button>
        </div>
        {!demandForm.productId && productSearch ? (
          <p className="mt-2 text-xs text-amber-700">Pick one of the quick search options before adding demand.</p>
        ) : null}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Upcoming jobs and item demand</p>
          <div className="mt-3 space-y-2">
            {groupedJobDemands.length === 0 ? (
              <p className="text-sm text-slate-500">No upcoming jobs yet.</p>
            ) : (
              groupedJobDemands.map(({ job, demands: jobDemands }) => {
                return (
                  <div key={job.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{job.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{job.status}</span>
                      <span className="text-xs text-slate-500">Need by {job.dateNeeded}</span>
                      <button
                        type="button"
                        onClick={() => removeJob(job.id)}
                        className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                      >
                        Remove Job
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {jobDemands.length === 0 ? (
                        <p className="text-xs text-slate-500">No item demand added to this job yet.</p>
                      ) : (
                        jobDemands.map(({ demand, productLabel, productMeta }) => (
                          <div
                            key={demand.id}
                            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                          >
                            <span className="text-slate-700">
                              {productLabel} ({productMeta}) - Qty {demand.requiredQty}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDemand(demand.id)}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700"
                            >
                              Remove
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="sticky-table-header min-w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3 text-left">Category</th>
              <th className="p-3 text-left">Brand / Uses</th>
              <th className="p-3 text-left">Model</th>
              <th className="p-3 text-left">Size / Gauge</th>
              <th className="p-3 text-left">Product Code</th>
              <th className="p-3 text-left">Current Stock</th>
              <th className="p-3 text-left">Minimum Stock</th>
              <th className="p-3 text-left">Projected Stock</th>
              <th className="p-3 text-left">Need to Order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { product, current, minimum, projectedStock, needToOrder } = row;
              return (
                <tr key={product.id} className="border-t border-slate-200 hover:bg-slate-50">
                  <td className="p-3 text-slate-600">{product.category || "Misc"}</td>
                  <td className="p-3 text-slate-600">{product.brandUses || "-"}</td>
                  <td className="p-3 text-slate-950 font-semibold">{product.model || product.name || "-"}</td>
                  <td className="p-3 text-slate-600">{product.sizeGauge || "-"}</td>
                  <td className="p-3 text-slate-600">{product.productCode || product.sku || "-"}</td>
                  <td className="p-3 text-slate-700">{current}</td>
                  <td className="p-3 text-slate-700">{minimum}</td>
                  <td className="p-3 text-slate-700">{projectedStock}</td>
                  <td className="p-3 text-slate-900 font-semibold">{needToOrder}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-500">
                  No projected rows yet. Add jobs and demand entries above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
