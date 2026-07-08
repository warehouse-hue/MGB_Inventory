"use client";

import { useEffect, useMemo, useState } from "react";
import { Handshake } from "lucide-react";
import { getSuppliers, saveSuppliers, addSupplier, addActivity, generateId, Supplier } from "../lib/storage";

type LocalSupplier = Supplier;

const initialSuppliers: LocalSupplier[] = [];
const ITEMS_PER_PAGE = 100;
const SUPPLIER_CATEGORY_OPTIONS = [
  "Drum Skins",
  "Percussion Skins",
  "Guitar Strings",
  "Guitar Accessories",
  "Drum Sticks",
  "Drum Accessories",
  "Batteries",
  "Tape",
  "Misc",
] as const;

function parseCategoryList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function serializeCategoryList(categories: string[]) {
  return categories.join(", ");
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<LocalSupplier[]>(initialSuppliers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    categories: [] as string[],
  });
  const [editId, setEditId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const saved = getSuppliers();
    if (saved.length) {
      setSuppliers(saved);
    }
  }, []);

  const handleSaveSupplier = () => {
    if (!form.name.trim()) return;

    if (editId !== null) {
      const updated = suppliers.map((supplier) =>
        supplier.id === editId
          ? {
              ...supplier,
              name: form.name.trim(),
              email: form.email.trim(),
              phone: form.phone.trim(),
              category: serializeCategoryList(form.categories),
            }
          : supplier
      );
      setSuppliers(updated);
      addActivity(`Updated supplier ${form.name.trim()}`);
      setEditId(null);
    } else {
      const nextSupplier: LocalSupplier = {
        id: generateId(),
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        category: serializeCategoryList(form.categories),
      };
      const next = addSupplier(nextSupplier);
      setSuppliers(next);
      addActivity(`Added supplier ${nextSupplier.name}`);
    }

    setForm({ name: "", email: "", phone: "", categories: [] });
  };

  const handleEditSupplier = (supplier: LocalSupplier) => {
    setEditId(supplier.id);
    setForm({
      name: supplier.name,
      email: supplier.email,
      phone: supplier.phone,
      categories: parseCategoryList(supplier.category),
    });
  };

  const handleDeleteSupplier = (id: number) => {
    const removed = suppliers.find((supplier) => supplier.id === id);
    const next = suppliers.filter((supplier) => supplier.id !== id);
    setSuppliers(next);
    addActivity(`Deleted supplier ${removed?.name ?? id}`);
    if (editId === id) {
      setEditId(null);
      setForm({ name: "", email: "", phone: "", categories: [] });
    }
  };

  const toggleCategory = (category: string) => {
    setForm((current) => {
      const isSelected = current.categories.includes(category);
      return {
        ...current,
        categories: isSelected
          ? current.categories.filter((entry) => entry !== category)
          : [...current.categories, category],
      };
    });
  };

  useEffect(() => {
    saveSuppliers(suppliers);
  }, [suppliers]);

  const filtered = suppliers.filter((supplier) =>
    `${supplier.name} ${supplier.category}`.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((previous) => Math.min(previous, totalPages));
  }, [totalPages]);

  const paginatedFiltered = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const supplierStats = {
    total: suppliers.length,
    visible: filtered.length,
    withEmail: suppliers.filter((supplier) => Boolean(supplier.email.trim())).length,
    withPhone: suppliers.filter((supplier) => Boolean(supplier.phone.trim())).length,
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-suppliers">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.42em] text-slate-300/80">VENDOR DIRECTORY</p>
            <div className="mt-3 command-slip-icon">
              <Handshake />
              Suppliers
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Suppliers Command</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/85 sm:text-base">
              Maintain supplier contacts, vendor categories, and fast lookup details for reorders and purchasing.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SupplierChip label="Total" value={supplierStats.total} tone="cyan" />
            <SupplierChip label="Visible" value={supplierStats.visible} tone="slate" />
            <SupplierChip label="Emails" value={supplierStats.withEmail} tone="emerald" />
            <SupplierChip label="Phones" value={supplierStats.withPhone} tone="sky" />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.24em] text-slate-500">
              Supplier directory
            </p>
            <h2 className="text-xl font-semibold text-slate-950 mt-2">
              Find vendor details quickly
            </h2>
            <p className="mt-2 text-sm text-slate-600">Search the active supplier list or add a new vendor record below.</p>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers..."
            className="w-full sm:w-72 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="font-mono text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Add supplier
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Name"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Email"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Phone"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
              />
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Categories (select multiple)
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUPPLIER_CATEGORY_OPTIONS.map((category) => {
                    const isSelected = form.categories.includes(category);

                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => toggleCategory(category)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                          isSelected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveSupplier}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-white font-semibold transition hover:bg-slate-800"
            >
              {editId !== null ? "Save supplier" : "Add supplier"}
            </button>
            {editId !== null && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setForm({ name: "", email: "", phone: "", categories: [] });
                }}
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-slate-700 font-semibold transition hover:bg-slate-50"
              >
                Cancel edit
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-500">Supplier cards</p>
        <p className="text-sm text-slate-500">Page {currentPage} of {totalPages} ({filtered.length} supplier record(s) visible)</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {paginatedFiltered.map((supplier) => (
          <div key={supplier.id} className="glass-card p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-950">{supplier.name}</h3>
              <div className="flex flex-wrap justify-end gap-2">
                {parseCategoryList(supplier.category).length > 0 ? (
                  parseCategoryList(supplier.category).map((category) => (
                    <span key={`${supplier.id}-${category}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {category}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    -
                  </span>
                )}
              </div>
            </div>
            <p className="text-slate-600 text-sm mt-3">{supplier.email}</p>
            <p className="text-slate-600 text-sm">{supplier.phone}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleEditSupplier(supplier)}
                className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSupplier(supplier.id)}
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          const isActive = page === currentPage;

          return (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                isActive
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {page}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SupplierChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "slate" | "emerald" | "sky";
}) {
  const toneClass = {
    cyan: "border-cyan-200/70 bg-cyan-400/35 text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    slate: "border-slate-200/45 bg-slate-200/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
    emerald: "border-emerald-200/70 bg-emerald-400/35 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
    sky: "border-sky-200/70 bg-sky-400/35 text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]",
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.28em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
