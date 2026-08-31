"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SquarePlus } from "lucide-react";
import {
  addActivity,
  generateId,
  getAppSettings,
  getInventory,
  getOrders,
  getProducts,
  getSuppliers,
  InventoryItem,
  Product,
  resolveSupplierName,
  saveInventory,
  saveOrders,
  saveProducts,
  Supplier,
} from "../lib/storage";

const PRODUCT_CATEGORIES = [
  "Drum Skins",
  "Percussion Skins",
  "Guitar Strings",
  "Guitar Accessories",
  "Drum Sticks",
  "Drum Accessories",
  "Batteries",
  "Tape",
  "Misc",
];

type FormState = {
  brandUses: string;
  model: string;
  sizeGauge: string;
  productCode: string;
  category: string;
  orderQty: string;
  minimum: string;
  currentStock: string;
  ordered: boolean;
  orderedDate: string;
  supplier: string;
  lastBuyPrice: string;
};

function safeNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function createInitialForm(): FormState {
  const settings = getAppSettings();
  return {
    brandUses: "",
    model: "",
    sizeGauge: "",
    productCode: "",
    category: "",
    orderQty: "0",
    minimum: settings.defaultMinimumStock > 0 ? String(settings.defaultMinimumStock) : "",
    currentStock: "0",
    ordered: false,
    orderedDate: "",
    supplier: "",
    lastBuyPrice: "",
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<FormState>({
    brandUses: "",
    model: "",
    sizeGauge: "",
    productCode: "",
    category: "",
    orderQty: "0",
    minimum: "",
    currentStock: "0",
    ordered: false,
    orderedDate: "",
    supplier: "",
    lastBuyPrice: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createdName, setCreatedName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    setProducts(getProducts());
    setSuppliers(getSuppliers());
    setForm(createInitialForm());
  }, []);

  const supplierNames = useMemo(
    () => Array.from(new Set(suppliers.map((supplier) => supplier.name).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [suppliers]
  );

  const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCreatedName("");
  };

  const resetForm = () => {
    setForm(createInitialForm());
    setErrors({});
    setCreatedName("");
  };

  const addProduct = () => {
    if (isCreatingRef.current) return;

    const nextErrors: Record<string, string> = {};
    if (!form.category) nextErrors.category = "Choose a category.";
    if (!form.model.trim() && !form.productCode.trim()) {
      nextErrors.identity = "Enter a model or product code.";
    }
    if (safeNumber(form.currentStock) < 0) nextErrors.currentStock = "Current stock cannot be negative.";
    if (safeNumber(form.minimum) < 0) nextErrors.minimum = "Minimum stock cannot be negative.";
    if (safeNumber(form.orderQty) < 0) nextErrors.orderQty = "Order quantity cannot be negative.";
    if (safeNumber(form.lastBuyPrice) < 0) nextErrors.lastBuyPrice = "Last buy price cannot be negative.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    isCreatingRef.current = true;
    setIsCreating(true);
    const newProductId = generateId();
    const name = form.model.trim() || form.productCode.trim();
    const product: Product = {
      id: newProductId,
      name,
      sku: form.productCode.trim() || name || "UNKNOWN",
      category: form.category,
      brandUses: form.brandUses.trim(),
      model: form.model.trim(),
      sizeGauge: form.sizeGauge.trim(),
      orderQty: safeNumber(form.orderQty),
      minimum: form.minimum ? safeNumber(form.minimum) : undefined,
      productCode: form.productCode.trim(),
      ordered: form.ordered,
      orderedDate: form.ordered ? (form.orderedDate || new Date().toISOString().slice(0, 10)) : "",
      supplier: resolveSupplierName(form.supplier.trim(), suppliers),
      lastBuyPrice: form.lastBuyPrice ? safeNumber(form.lastBuyPrice) : undefined,
    };
    const inventoryItem: InventoryItem = {
      id: generateId(),
      productId: product.id,
      variant: product.sizeGauge || "",
      stock: Math.max(0, safeNumber(form.currentStock)),
      location: getAppSettings().defaultLocation,
    };

    if (form.ordered) {
      saveOrders([
        {
          id: generateId(),
          productId: product.id,
          productName: product.model || product.brandUses || product.sku || product.name || "Product",
          variant: product.sizeGauge || "",
          quantity: safeNumber(form.orderQty),
          orderedDate: product.orderedDate || new Date().toISOString().slice(0, 10),
          supplier: product.supplier,
          lastBuyPrice: product.lastBuyPrice,
          status: "OPEN",
        },
        ...getOrders(),
      ]);
    }

    const updatedProducts = [product, ...products];
    saveInventory([inventoryItem, ...getInventory()]);
    saveProducts(updatedProducts);
    setProducts(updatedProducts);
    addActivity(`Added product ${product.name}`);
    setForm(createInitialForm());
    setErrors({});
    setCreatedName(product.name);
    setIsCreating(false);
    isCreatingRef.current = false;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto animate-fade-in-up">
      <div className="command-hero command-hero-products">
        <div className="mt-3 command-slip-icon"><SquarePlus />Add Inventory</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Add Inventory</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">Create a new inventory item.</p>
      </div>

      {createdName ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <span>Item created successfully: {createdName}</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={resetForm} className="font-medium text-cyan-700">Add another</button>
            <Link href="/inventory" className="font-medium text-cyan-700">View in Inventory</Link>
          </div>
        </div>
      ) : null}

      <section className="glass-card p-6">
        <div className="space-y-7">
          <FormSection title="Product">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Category" error={errors.category}>
                <select value={form.category} onChange={(event) => updateForm("category", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">
                  <option value="">Select category</option>
                  {PRODUCT_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </Field>
              <Field label="Brand / Uses">
                <input value={form.brandUses} onChange={(event) => updateForm("brandUses", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Model" error={errors.identity}>
                <input value={form.model} onChange={(event) => updateForm("model", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Size / Gauge">
                <input value={form.sizeGauge} onChange={(event) => updateForm("sizeGauge", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Product Code" error={errors.identity}>
                <input value={form.productCode} onChange={(event) => updateForm("productCode", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Stock">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Current Stock" error={errors.currentStock}>
                <input type="number" min="0" value={form.currentStock} onChange={(event) => updateForm("currentStock", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Minimum Stock" error={errors.minimum}>
                <input type="number" min="0" value={form.minimum} onChange={(event) => updateForm("minimum", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <Field label="Order Qty" error={errors.orderQty}>
                <input type="number" min="0" value={form.orderQty} onChange={(event) => updateForm("orderQty", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Purchasing">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Supplier">
                <select value={form.supplier} onChange={(event) => updateForm("supplier", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900">
                  <option value="">Select supplier</option>
                  {supplierNames.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}
                </select>
              </Field>
              <Field label="Last Buy Price" error={errors.lastBuyPrice}>
                <input type="number" min="0" step="0.01" value={form.lastBuyPrice} onChange={(event) => updateForm("lastBuyPrice", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.ordered}
                  onChange={(event) => updateForm("ordered", event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Ordered
              </label>
              {form.ordered ? (
                <Field label="Ordered Date">
                  <input type="date" value={form.orderedDate} onChange={(event) => updateForm("orderedDate", event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900" />
                </Field>
              ) : null}
            </div>
          </FormSection>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          <button type="button" onClick={addProduct} disabled={isCreating} className="rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60">
            {isCreating ? "Creating..." : "Create Inventory Item"}
          </button>
          <button type="button" onClick={resetForm} disabled={isCreating} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-60">Clear</button>
        </div>
      </section>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 border-t border-slate-200 pt-4">{children}</div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1.5 text-xs text-rose-700">{error}</p> : null}
    </label>
  );
}