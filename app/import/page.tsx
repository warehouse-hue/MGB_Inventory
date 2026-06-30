"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addActivity,
  getInventory,
  getProducts,
  InventoryItem,
  Product,
  saveInventory,
  saveProducts,
} from "../lib/storage";

type QueuedImport = {
  id: string;
  fileName: string;
  productCount: number;
  inventoryCount: number;
  products: Product[];
  inventory: InventoryItem[];
};

type ColumnKey =
  | "itemName"
  | "size"
  | "currentStock"
  | "minimum"
  | "orderQty"
  | "defaultOrderQty"
  | "productCode"
  | "supplier"
  | "lastBuyPrice"
  | "category"
  | "brandUses"
  | "model"
  | "location";

type ColumnMap = Partial<Record<ColumnKey, number>>;

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  itemName: ["item", "item name", "name", "product", "product name", "description"],
  size: ["size", "gauge", "variant", "size gauge", "spec", "specification"],
  currentStock: ["current", "current stock", "stock", "qty in stock", "on hand", "in stock", "quantity"],
  minimum: ["minimum", "min", "min stock", "threshold", "minimum stock", "reorder threshold"],
  orderQty: ["order qty", "order quantity", "reorder qty", "reorder quantity", "qty to order"],
  defaultOrderQty: ["default order qty", "default qty", "standard order qty", "pack qty"],
  productCode: ["product code", "code", "sku", "item code", "product id"],
  supplier: ["supplier", "vendor", "supplier name"],
  lastBuyPrice: ["last buy price", "buy price", "price", "cost", "unit cost", "last cost"],
  category: ["category", "type", "group"],
  brandUses: [
    "brand",
    "brand name",
    "manufacturer",
    "make",
    "brand uses",
    "brand use",
    "brand or uses",
  ],
  model: ["model", "product model", "item model"],
  location: ["location", "warehouse", "bin", "shelf"],
};

function parseCSV(text: string) {
  const rows: string[] = [];
  const lines = text.split(/\r?\n/);

  const parseLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];

      if (char === '"') {
        if (inQuotes && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        values.push(current);
        current = "";
        continue;
      }

      current += char;
    }

    values.push(current);
    return values;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(trimmed);
  }

  return rows.map(parseLine);
}

function parseNumber(value: string | undefined) {
  if (!value) return 0;
  const numericValue = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(numericValue) ? 0 : numericValue;
}

function normalizeHeader(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const KNOWN_BRANDS = [
  "remo",
  "evans",
  "aquarian",
  "vic firth",
  "promark",
  "vater",
  "ahead",
  "ernie ball",
  "daddario",
  "elixir",
  "martin",
] as const;

function formatBrandLabel(brand: string) {
  return brand
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferBrandFromFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const normalized = baseName
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const brand of KNOWN_BRANDS) {
    const pattern = new RegExp(`\\b${brand.replace(/\\s+/g, "\\\\s+")}\\b`, "i");
    if (pattern.test(normalized)) {
      return formatBrandLabel(brand);
    }
  }

  return "";
}

function inferBrand(...values: Array<string | undefined>) {
  const combined = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const brand of KNOWN_BRANDS) {
    const pattern = new RegExp(`\\b${brand.replace(/\\s+/g, "\\\\s+")}\\b`, "i");
    if (pattern.test(combined)) {
      return formatBrandLabel(brand);
    }
  }

  return "";
}

function hasKnownBrand(value: string | undefined) {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return KNOWN_BRANDS.some((brand) => {
    const pattern = new RegExp(`\\b${brand.replace(/\\s+/g, "\\\\s+")}\\b`, "i");
    return pattern.test(normalized);
  });
}

function inferCategory(...values: Array<string | undefined>) {
  const combined = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const categories = [
    {
      label: "Drum Skins",
      keywords: [
        "drum skin",
        "drum skins",
        "drum head",
        "drum heads",
        "drumhead",
        "drumheads",
        "snare head",
        "tom head",
        "kick head",
        "bass drum head",
        "remo",
        "evans",
        "aquarian",
      ],
    },
    {
      label: "Guitar Strings",
      keywords: [
        "guitar string",
        "guitar strings",
        "string set",
        "electric string",
        "acoustic string",
        "bass string",
        "phosphor bronze",
        "nickel wound",
        "ernie ball",
        "daddario",
        "elixir",
        "martin strings",
      ],
    },
    {
      label: "Drum Sticks",
      keywords: [
        "drum stick",
        "drum sticks",
        "drumstick",
        "drumsticks",
        "stick pair",
        "5a",
        "5b",
        "7a",
        "2b",
        "vic firth",
        "promark",
        "vater",
        "ahead",
        "nylon tip",
        "wood tip",
      ],
    },
  ] as const;

  let bestCategory = "Misc";
  let bestScore = 0;

  for (const category of categories) {
    const score = category.keywords.reduce((total, keyword) => {
      return total + (combined.includes(keyword) ? keyword.includes(" ") ? 3 : 2 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category.label;
    }
  }

  if (bestScore > 0) {
    return bestCategory;
  }

  return "Misc";
}

function findColumnIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeHeader);

  for (const alias of normalizedAliases) {
    const exactIndex = headers.findIndex((header) => header === alias);
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  for (const alias of normalizedAliases) {
    const partialIndex = headers.findIndex(
      (header) => header.includes(alias) || alias.includes(header)
    );
    if (partialIndex >= 0) {
      return partialIndex;
    }
  }

  return -1;
}

function buildColumnMap(headerRow: string[]) {
  const headers = headerRow.map(normalizeHeader);
  const columnMap: ColumnMap = {};

  (Object.keys(COLUMN_ALIASES) as ColumnKey[]).forEach((key) => {
    const index = findColumnIndex(headers, COLUMN_ALIASES[key]);
    if (index >= 0) {
      columnMap[key] = index;
    }
  });

  return columnMap;
}

function readColumn(row: string[], columnMap: ColumnMap, key: ColumnKey) {
  const index = columnMap[key];
  return index == null ? "" : row[index]?.trim() || "";
}

function buildImportPayload(fileName: string, text: string): QueuedImport | null {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return null;
  }

  const headerRow = rows[0];
  const columnMap = buildColumnMap(headerRow);
  const dataRows = rows.slice(1);
  const existingProducts = getProducts();
  const nextProductId = Math.max(0, ...existingProducts.map((item) => item.id)) + 1;
  const existingInventory = getInventory();
  const nextInventoryId = Math.max(0, ...existingInventory.map((item) => item.id)) + 1;

  const products: Product[] = [];
  const inventory: InventoryItem[] = [];
  const fileBrand = inferBrandFromFileName(fileName);

  let productCounter = 0;
  let inventoryCounter = 0;

  for (const row of dataRows) {
    const itemName = readColumn(row, columnMap, "itemName");
    const size = readColumn(row, columnMap, "size");
    const current = parseNumber(readColumn(row, columnMap, "currentStock"));
    const minimum = parseNumber(readColumn(row, columnMap, "minimum"));
    const orderQty = parseNumber(readColumn(row, columnMap, "orderQty"));
    const defaultOrderQty = parseNumber(readColumn(row, columnMap, "defaultOrderQty"));
    const productCode = readColumn(row, columnMap, "productCode");
    const supplier = readColumn(row, columnMap, "supplier");
    const lastBuyPrice = parseNumber(readColumn(row, columnMap, "lastBuyPrice"));
    const rawBrandUses = readColumn(row, columnMap, "brandUses");
    const model = readColumn(row, columnMap, "model");
    const inferredBrand = inferBrand(itemName, model, supplier, productCode);
    const normalizedBrandUses = rawBrandUses.trim().toLowerCase();
    const normalizedModel = model.trim().toLowerCase();
    const brandLooksLikeModel =
      Boolean(normalizedBrandUses) && normalizedBrandUses === normalizedModel;
    const candidateBrandUses = brandLooksLikeModel ? "" : rawBrandUses;
    const brandUses = fileBrand || (hasKnownBrand(candidateBrandUses)
      ? candidateBrandUses
      : inferredBrand || candidateBrandUses);
    const category = inferCategory(
      readColumn(row, columnMap, "category"),
      itemName,
      brandUses,
      model,
      size,
      supplier,
      productCode
    );
    const location = readColumn(row, columnMap, "location") || "Main";

    const resolvedName = itemName || model || brandUses || productCode;
    const resolvedSku = productCode || itemName || model || `IMPORT-${nextProductId + productCounter}`;

    if (!resolvedName) continue;

    const product: Product = {
      id: nextProductId + productCounter,
      name: resolvedName,
      sku: resolvedSku,
      category,
      brandUses: brandUses || undefined,
      model: model || undefined,
      sizeGauge: size,
      orderQty: orderQty || defaultOrderQty || 0,
      minimum: minimum || undefined,
      ordered: false,
      orderedDate: "",
      productCode: productCode || undefined,
      supplier: supplier || undefined,
      lastBuyPrice: lastBuyPrice || undefined,
    };

    const inventoryItem: InventoryItem = {
      id: nextInventoryId + inventoryCounter,
      productId: product.id,
      variant: size,
      stock: current,
      location,
    };

    products.push(product);
    inventory.push(inventoryItem);
    productCounter += 1;
    inventoryCounter += 1;
  }

  if (products.length === 0) {
    return null;
  }

  return {
    id: `${fileName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    productCount: products.length,
    inventoryCount: inventory.length,
    products,
    inventory,
  };
}

export default function ImportPage() {
  const [queuedImports, setQueuedImports] = useState<QueuedImport[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [appendData, setAppendData] = useState(true);

  const previewRows = useMemo(() => {
    const rows: Array<{ product: Product; inventory: InventoryItem | undefined; fileName: string }> = [];

    for (const queuedImport of queuedImports) {
      for (const product of queuedImport.products) {
        rows.push({
          product,
          inventory: queuedImport.inventory.find((item) => item.productId === product.id),
          fileName: queuedImport.fileName,
        });

        if (rows.length >= 10) {
          return rows;
        }
      }
    }

    return rows;
  }, [queuedImports]);

  const totals = useMemo(() => {
    return queuedImports.reduce(
      (accumulator, queuedImport) => {
        accumulator.files += 1;
        accumulator.products += queuedImport.productCount;
        accumulator.inventory += queuedImport.inventoryCount;
        return accumulator;
      },
      { files: 0, products: 0, inventory: 0 }
    );
  }, [queuedImports]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage("");
    setError("");

    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const nextImports: QueuedImport[] = [];

    for (const file of files) {
      const text = await file.text();
      const payload = buildImportPayload(file.name, text);
      if (payload) {
        nextImports.push(payload);
      }
    }

    if (!nextImports.length) {
      setError("No importable rows were detected in the selected CSV file(s).");
      event.target.value = "";
      return;
    }

    setQueuedImports((current) => [...current, ...nextImports]);
    setMessage(`${nextImports.length} file(s) queued. Review them, then press Send Import.`);
    event.target.value = "";
  };

  const handleRemoveQueuedFile = (id: string) => {
    setQueuedImports((current) => current.filter((item) => item.id !== id));
  };

  const handleImport = () => {
    if (!queuedImports.length) {
      setError("No queued CSV files found. Add at least one file first.");
      return;
    }

    const products = queuedImports.flatMap((queuedImport) => queuedImport.products);
    const inventory = queuedImports.flatMap((queuedImport) => queuedImport.inventory);

    if (appendData) {
      saveProducts([...getProducts(), ...products]);
      saveInventory([...getInventory(), ...inventory]);
    } else {
      saveProducts(products);
      saveInventory(inventory);
    }

    addActivity(`Imported ${products.length} products from ${queuedImports.length} CSV file(s)`);
    setMessage(`Imported ${products.length} products and ${inventory.length} inventory records.`);
    setQueuedImports([]);
    setError("");
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto animate-fade-in-up">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-950">Import Inventory</h1>
          <p className="mt-1 text-slate-600">
            Advanced tool for bulk CSV imports. Files now queue first and only import when you send them.
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Back to Settings
        </Link>
      </div>

      <div className="glass-card p-6 space-y-5">
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">CSV file(s)</label>
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={handleFiles}
            className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900"
          />
          <p className="text-sm text-slate-500">
            Add one or more CSV files. They will stack in a queue until you press Send Import.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={appendData}
            onChange={(event) => setAppendData(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900"
          />
          Append to existing data (uncheck to replace current inventory)
        </label>

        {message ? <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{message}</div> : null}
        {error ? <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</div> : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Queued Files</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.files}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Queued Products</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.products}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Queued Stock Rows</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{totals.inventory}</p>
          </div>
        </div>

        {queuedImports.length ? (
          <div className="space-y-3">
            {queuedImports.map((queuedImport) => (
              <div key={queuedImport.id} className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">{queuedImport.fileName}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {queuedImport.productCount} product row(s) • {queuedImport.inventoryCount} inventory row(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveQueuedFile(queuedImport.id)}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleImport}
          disabled={!queuedImports.length}
          className="rounded-2xl bg-slate-950 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Send Import
        </button>
      </div>

      {previewRows.length > 0 ? (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-semibold text-slate-950">Preview</h2>
          <p className="text-sm text-slate-500">First {previewRows.length} queued products across all selected files.</p>
          <div className="overflow-x-auto">
            <table className="sticky-table-header min-w-full text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="p-3 text-left">File</th>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Size</th>
                  <th className="p-3 text-left">SKU</th>
                  <th className="p-3 text-left">Stock</th>
                  <th className="p-3 text-left">Supplier</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map(({ product, inventory, fileName }) => (
                  <tr key={`${fileName}-${product.id}`} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="p-3 text-slate-600">{fileName}</td>
                    <td className="p-3 text-slate-950">{product.name}</td>
                    <td className="p-3 text-slate-600">{product.sizeGauge || "-"}</td>
                    <td className="p-3 text-slate-600">{product.sku}</td>
                    <td className="p-3 text-slate-600">{inventory?.stock ?? 0}</td>
                    <td className="p-3 text-slate-600">{product.supplier || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}