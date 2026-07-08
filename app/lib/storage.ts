import { queueCloudSync } from "./cloud-sync";

const MAX_ACTIVITY_ITEMS = 2000;
const MAX_TRANSACTIONS = 5000;
const ID_SEQUENCE_KEY = "mgb-id-sequence";
const ID_MIGRATION_V1_KEY = "mgb-id-migration-v1";
const APP_SETTINGS_KEY = "mgb-app-settings-v1";

export type AppSettings = {
  defaultLocation: "Artarmon stoage" | "Upper Storage";
  defaultMinimumStock: number;
  includeNonStockedInAlerts: boolean;
  lowStockMode: "lt" | "lte";
  autoCreateOrderSuggestion: boolean;
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  defaultLocation: "Artarmon stoage",
  defaultMinimumStock: 0,
  includeNonStockedInAlerts: false,
  lowStockMode: "lt",
  autoCreateOrderSuggestion: false,
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  category: string;
  brandUses?: string;
  model?: string;
  sizeGauge?: string;
  orderQty?: number;
  minimum?: number;
  ordered?: boolean;
  orderedDate?: string;
  productCode?: string;
  supplier?: string;
  lastBuyPrice?: number;
};

export type InventoryItem = {
  id: number;
  productId: number;
  variant: string;
  stock: number;
  location: string;
};

export type Transaction = {
  id: number;
  productId: number;
  variant: string;
  type: "RESTOCK" | "REMOVE";
  quantity: number;
  date: number;
};

export type PurchaseOrder = {
  id: number;
  productId: number;
  productName: string;
  variant: string;
  quantity: number;
  orderedDate: string;
  supplier?: string;
  lastBuyPrice?: number;
  status: "OPEN" | "DELIVERED_PENDING" | "CLOSED";
};

export type Supplier = {
  id: number;
  name: string;
  email: string;
  phone: string;
  category: string;
};

export type ProjectionJob = {
  id: string;
  name: string;
  status: "Quoted" | "Invoiced" | "Booked";
  dateNeeded: string;
};

export type ProjectionDemand = {
  id: string;
  productId: number;
  jobId: string;
  requiredQty: number;
};

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
] as const;

function normalizeProductCategory(value: string | undefined) {
  const raw = (value || "").trim();
  if (!raw) return "Misc";

  const normalized = raw.toLowerCase();

  if (normalized === "drum skins" || normalized === "drum skin") return "Drum Skins";
  if (normalized === "percussion skins" || normalized === "percussion skin") return "Percussion Skins";
  if (normalized === "guitar strings" || normalized === "guitar string") return "Guitar Strings";
  if (normalized === "guitar accessories" || normalized === "guitar accessory") return "Guitar Accessories";
  if (normalized === "guitar tube" || normalized === "guitar tubes") return "Guitar Accessories";
  if (normalized === "drum sticks" || normalized === "drum stick") return "Drum Sticks";
  if (normalized === "drum accessories" || normalized === "drum accessory") return "Drum Accessories";
  if (normalized === "batteries" || normalized === "battery") return "Batteries";
  if (normalized === "reverb tanks" || normalized === "reverb tank") return "Guitar Accessories";
  if (normalized === "tape" || normalized === "gaff tape" || normalized === "electrical tape") return "Tape";
  if (normalized === "misc") return "Misc";

  if (
    /(bongo|conga|timbale|djembe|tumba|bata|percussion\s?skin)/.test(normalized)
  ) {
    return "Percussion Skins";
  }

  if (
    /(moon\s?gel|falam\s?slam|snare\s?wire|snare\s?lug|donut|big\s?fat\s?snare|drum\s?key|drum\s?accessory)/.test(normalized)
  ) {
    return "Drum Accessories";
  }

  if (
    /(guitar\s?tube|12ax7|12au7|12at7|el84|el34|6l6|6550|ecc83|ecc82|ecc81|pre\s?amp\s?tube|power\s?amp\s?tube|svetlana|mullard|sovtek|reverb\s?tank|accutronics|4ab3c1b|8db2c1d|4eb2c1b|4eb3c1b|4bb3c1d|8eb2c1b)/.test(normalized)
  ) {
    return "Guitar Accessories";
  }

  if (
    /(drum\s?head|drum\s?skin|snare\s?head|tom\s?head|kick\s?head|bass\s?drum\s?head|remo|evans|aquarian|emperor)/.test(
      normalized
    )
  ) {
    return "Drum Skins";
  }

  if (/(battery|duracell|procell|aa\b|aaa\b|9v\b|cr2032|coin\s?cell)/.test(normalized)) {
    return "Batteries";
  }

  if (/(gaff\s?tape|electrical\s?tape|duct\s?tape|insulation\s?tape|masking\s?tape|tape\b)/.test(normalized)) {
    return "Tape";
  }

  if (
    /(guitar\s?string|string\s?set|electric\s?string|acoustic\s?string|bass\s?string|ernie\s?ball|daddario|elixir|phosphor\s?bronze|nickel\s?wound)/.test(
      normalized
    )
  ) {
    return "Guitar Strings";
  }

  if (
    /(drum\s?stick|drumstick|stick\s?pair|vic\s?firth|promark|vater|ahead|nylon\s?tip|wood\s?tip|\b[257]a\b|\b2b\b|\b5b\b)/.test(
      normalized
    )
  ) {
    return "Drum Sticks";
  }

  return "Misc";
}

function normalizeProduct(product: Product): Product {
  return {
    ...product,
    category: normalizeProductCategory(product.category),
  };
}

/* ---------------- SAFE STORAGE ---------------- */
function safeNumber(value: any): number {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}
function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : fallback;
}

function safeSet(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("mgb-storage-updated"));
  queueCloudSync();
}

export function getAppSettings(): AppSettings {
  const raw = safeGet<Partial<AppSettings>>(APP_SETTINGS_KEY, {});

  const location = raw.defaultLocation === "Upper Storage" ? "Upper Storage" : DEFAULT_APP_SETTINGS.defaultLocation;
  const lowStockMode = raw.lowStockMode === "lte" ? "lte" : DEFAULT_APP_SETTINGS.lowStockMode;
  const defaultMinimumStock = Math.max(0, safeNumber(raw.defaultMinimumStock ?? DEFAULT_APP_SETTINGS.defaultMinimumStock));

  return {
    defaultLocation: location,
    defaultMinimumStock,
    includeNonStockedInAlerts:
      raw.includeNonStockedInAlerts == null
        ? DEFAULT_APP_SETTINGS.includeNonStockedInAlerts
        : Boolean(raw.includeNonStockedInAlerts),
    lowStockMode,
    autoCreateOrderSuggestion:
      raw.autoCreateOrderSuggestion == null
        ? DEFAULT_APP_SETTINGS.autoCreateOrderSuggestion
        : Boolean(raw.autoCreateOrderSuggestion),
  };
}

export function saveAppSettings(settings: Partial<AppSettings>) {
  const current = getAppSettings();
  const next: AppSettings = {
    ...current,
    ...settings,
  };

  next.defaultLocation = next.defaultLocation === "Upper Storage" ? "Upper Storage" : "Artarmon stoage";
  next.defaultMinimumStock = Math.max(0, safeNumber(next.defaultMinimumStock));
  next.lowStockMode = next.lowStockMode === "lte" ? "lte" : "lt";
  next.includeNonStockedInAlerts = Boolean(next.includeNonStockedInAlerts);
  next.autoCreateOrderSuggestion = Boolean(next.autoCreateOrderSuggestion);

  safeSet(APP_SETTINGS_KEY, next);
  return next;
}

export function generateId(): number {
  if (typeof window === "undefined") return Date.now();

  const currentSequence = Number(localStorage.getItem(ID_SEQUENCE_KEY) || "0");
  const nextId = Math.max(Date.now(), currentSequence + 1);

  // Use direct localStorage write to avoid triggering cloud sync for each ID allocation.
  localStorage.setItem(ID_SEQUENCE_KEY, String(nextId));
  return nextId;
}

function normalizeValue(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

type ProductCandidate = {
  newId: number;
  productCode: string;
  modelOrName: string;
  brandUses: string;
  sizeGauge: string;
  useCount: number;
};

function resolveCandidate(
  candidates: ProductCandidate[] | undefined,
  hints: {
    productCode?: string;
    modelOrName?: string;
    brandUses?: string;
    sizeGauge?: string;
  }
) {
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const normalizedHints = {
    productCode: normalizeValue(hints.productCode),
    modelOrName: normalizeValue(hints.modelOrName),
    brandUses: normalizeValue(hints.brandUses),
    sizeGauge: normalizeValue(hints.sizeGauge),
  };

  let winner = candidates[0];
  let winnerScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    let score = -candidate.useCount;

    if (normalizedHints.productCode && candidate.productCode === normalizedHints.productCode) score += 8;
    if (normalizedHints.modelOrName && candidate.modelOrName === normalizedHints.modelOrName) score += 5;
    if (normalizedHints.brandUses && candidate.brandUses === normalizedHints.brandUses) score += 4;
    if (normalizedHints.sizeGauge && candidate.sizeGauge === normalizedHints.sizeGauge) score += 6;

    if (score > winnerScore) {
      winner = candidate;
      winnerScore = score;
    }
  }

  return winner;
}

export function migrateLegacyIds() {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(ID_MIGRATION_V1_KEY) === "1") return false;

  const rawProducts = safeGet<Product[]>("mgb-products", []);
  const rawInventory = safeGet<InventoryItem[]>("mgb-inventory", []);
  const rawOrders = safeGet<PurchaseOrder[]>("mgb-orders", []);
  const rawSuppliers = safeGet<Supplier[]>("mgb-suppliers", []);
  const rawActivity = safeGet<Activity[]>("mgb-activity-log", []);
  const rawTransactions = safeGet<any[]>("mgb-transactions", []);

  const hasDuplicateIds = (items: Array<{ id: number | string }>) => {
    const seen = new Set<number>();
    for (const item of items) {
      const id = Number(item.id);
      if (!Number.isFinite(id)) continue;
      if (seen.has(id)) return true;
      seen.add(id);
    }
    return false;
  };

  const needsMigration =
    hasDuplicateIds(rawProducts) ||
    hasDuplicateIds(rawInventory) ||
    hasDuplicateIds(rawOrders) ||
    hasDuplicateIds(rawSuppliers) ||
    hasDuplicateIds(rawActivity) ||
    hasDuplicateIds(rawTransactions as Array<{ id: number | string }>);

  if (!needsMigration) {
    localStorage.setItem(ID_MIGRATION_V1_KEY, "1");
    return false;
  }

  const candidatesByOldProductId = new Map<number, ProductCandidate[]>();

  const products: Product[] = rawProducts.map((product) => {
    const newId = generateId();
    const candidate: ProductCandidate = {
      newId,
      productCode: normalizeValue(product.productCode),
      modelOrName: normalizeValue(product.model || product.name),
      brandUses: normalizeValue(product.brandUses),
      sizeGauge: normalizeValue(product.sizeGauge),
      useCount: 0,
    };

    const existing = candidatesByOldProductId.get(product.id) || [];
    existing.push(candidate);
    candidatesByOldProductId.set(product.id, existing);

    return {
      ...product,
      id: newId,
    };
  });

  const inventory: InventoryItem[] = rawInventory.map((item) => {
    const candidate = resolveCandidate(candidatesByOldProductId.get(item.productId), {
      sizeGauge: item.variant,
    });

    if (candidate) {
      candidate.useCount += 1;
    }

    return {
      ...item,
      id: generateId(),
      productId: candidate?.newId ?? item.productId,
    };
  });

  const orders: PurchaseOrder[] = rawOrders.map((order) => {
    const candidate = resolveCandidate(candidatesByOldProductId.get(order.productId), {
      modelOrName: order.productName,
      sizeGauge: order.variant,
    });

    if (candidate) {
      candidate.useCount += 1;
    }

    return {
      ...order,
      id: generateId(),
      productId: candidate?.newId ?? order.productId,
    };
  });

  const transactions = rawTransactions.map((transaction) => {
    const candidate = resolveCandidate(candidatesByOldProductId.get(Number(transaction.productId)), {
      modelOrName: transaction.productName,
      sizeGauge: transaction.variant,
    });

    if (candidate) {
      candidate.useCount += 1;
    }

    return {
      ...transaction,
      id: generateId(),
      productId: candidate?.newId ?? Number(transaction.productId),
    };
  });

  const suppliers = rawSuppliers.map((supplier) => ({
    ...supplier,
    id: generateId(),
  }));

  const activity = rawActivity.map((entry) => ({
    ...entry,
    id: generateId(),
  }));

  localStorage.setItem("mgb-products", JSON.stringify(products));
  localStorage.setItem("mgb-inventory", JSON.stringify(inventory));
  localStorage.setItem("mgb-orders", JSON.stringify(orders));
  localStorage.setItem("mgb-transactions", JSON.stringify(transactions));
  localStorage.setItem("mgb-suppliers", JSON.stringify(suppliers));
  localStorage.setItem("mgb-activity-log", JSON.stringify(activity));
  localStorage.setItem(ID_MIGRATION_V1_KEY, "1");
  queueCloudSync();

  return true;
}

/* ---------------- PRODUCTS ---------------- */

export function getProducts(): Product[] {
  const products = safeGet<Product[]>("mgb-products", []);
  return products.map(normalizeProduct);
}

export function saveProducts(products: Product[]) {
  safeSet("mgb-products", products.map(normalizeProduct));
}

export function addProduct(product: Product) {
  const updated = [product, ...getProducts()];
  saveProducts(updated);
  return updated;
}

export function addInventoryItems(items: InventoryItem[]) {
  const updated = [...items, ...getInventory()];
  saveInventory(updated);
  return updated;
}

export function getProductById(id: number) {
  return getProducts().find((p) => p.id === id);
}

/* ---------------- INVENTORY ---------------- */

export function getInventory(): InventoryItem[] {
  return safeGet<InventoryItem[]>("mgb-inventory", []);
}

export function saveInventory(items: InventoryItem[]) {
  safeSet("mgb-inventory", items);
}

/* ---------------- TRANSACTIONS ---------------- */

export function getTransactions(): Transaction[] {
  return safeGet<Transaction[]>("mgb-transactions", []);
}

export function saveTransactions(items: Transaction[]) {
  safeSet("mgb-transactions", items);
}

export type Activity = {
  id: number;
  date: number;
  message: string;
};

export function getActivityLog(): Activity[] {
  return safeGet<Activity[]>("mgb-activity-log", []);
}

export function saveActivityLog(items: Activity[]) {
  safeSet("mgb-activity-log", items);
}

export function addActivity(message: string) {
  const current = getActivityLog();
  const next: Activity = {
    id: Date.now(),
    date: Date.now(),
    message,
  };
  const updated = [next, ...current].slice(0, MAX_ACTIVITY_ITEMS);
  saveActivityLog(updated);
  return updated;
}

export function clearActivityLog() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("mgb-activity-log");
  queueCloudSync();
}

export function getOrders(): PurchaseOrder[] {
  return safeGet<PurchaseOrder[]>("mgb-orders", []);
}

export function saveOrders(orders: PurchaseOrder[]) {
  safeSet("mgb-orders", orders);
}

export function addOrder(order: PurchaseOrder) {
  const updated = [order, ...getOrders()];
  saveOrders(updated);
  return updated;
}

export function updateOrder(order: PurchaseOrder) {
  const updated = getOrders().map((item) =>
    item.id === order.id ? order : item
  );
  saveOrders(updated);
  return updated;
}

export function removeOrder(productId: number) {
  const updated = getOrders().filter((order) => order.productId !== productId);
  saveOrders(updated);
  return updated;
}

export function getSuppliers(): Supplier[] {
  return safeGet<Supplier[]>("mgb-suppliers", []);
}

export function saveSuppliers(suppliers: Supplier[]) {
  safeSet("mgb-suppliers", suppliers);
}

export function addSupplier(supplier: Supplier) {
  const updated = [supplier, ...getSuppliers()];
  saveSuppliers(updated);
  return updated;
}

/* ---------------- STOCK PROJECTION ---------------- */

export function getProjectionJobs(): ProjectionJob[] {
  return safeGet<ProjectionJob[]>("mgb-stock-projection-jobs-v2", []);
}

export function saveProjectionJobs(jobs: ProjectionJob[]) {
  safeSet("mgb-stock-projection-jobs-v2", jobs);
}

export function getProjectionDemands(): ProjectionDemand[] {
  return safeGet<ProjectionDemand[]>("mgb-stock-projection-demands-v2", []);
}

export function saveProjectionDemands(demands: ProjectionDemand[]) {
  safeSet("mgb-stock-projection-demands-v2", demands);
}

/* ---------------- TRANSACTION LOGGER ---------------- */

export function addTransaction(
  t: Omit<Transaction, "id" | "date">
) {
  const current = getTransactions();

  const newTransaction: Transaction = {
    id: Date.now(),
    date: Date.now(),
    ...t,
  };

  const updated = [newTransaction, ...current].slice(0, MAX_TRANSACTIONS);

  saveTransactions(updated);

  return updated;
}

/* ---------------- VALIDATION ---------------- */

export function validateInventoryItem(
  item: InventoryItem,
  products: Product[]
): boolean {
  const product = products.find((p) => p.id === item.productId);
  if (!product) return false;

  return product.sizeGauge === item.variant;
}