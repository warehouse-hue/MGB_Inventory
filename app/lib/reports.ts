import type { Transaction } from "./transactions";
import { getAppSettings, getInventory, getProducts } from "./storage";

/**
 * Movement summary (already used)
 */
export function getMovementSummary(transactions: Transaction[]) {
  const restocks = transactions.filter((t) => t.type === "RESTOCK");
  const removes = transactions.filter((t) => t.type === "REMOVE");

  const totalIn = restocks.reduce((sum, t) => sum + t.quantity, 0);
  const totalOut = removes.reduce((sum, t) => sum + t.quantity, 0);

  return {
    restockCount: restocks.length,
    removeCount: removes.length,
    totalIn,
    totalOut,
    netMovement: totalIn - totalOut,
  };
}

/**
 * TOTAL STOCK SNAPSHOT
 */
export function getStockSummary() {
  const inventory = getInventory();
  const products = getProducts();
  const settings = getAppSettings();
  const productsById = new Map(products.map((product) => [product.id, product]));

  const totalProducts = products.length;
  const totalUnits = inventory.reduce((sum, i) => sum + i.stock, 0);

  const lowStockItems = inventory.filter((item) => {
    const product = productsById.get(item.productId);
    const minimum = Number(product?.minimum ?? 0);
    if (minimum <= 0 || item.stock <= 0) return false;

    return settings.lowStockMode === "lte" ? item.stock <= minimum : item.stock < minimum;
  });
  const outOfStockItems = inventory.filter((item) => {
    if (item.stock !== 0) return false;

    if (settings.includeNonStockedInAlerts) {
      return true;
    }

    const product = productsById.get(item.productId);
    const minimum = Number(product?.minimum ?? 0);
    return minimum > 0;
  });

  return {
    totalProducts,
    totalUnits,
    lowStockCount: lowStockItems.length,
    outOfStockCount: outOfStockItems.length,
    lowStockItems,
    outOfStockItems,
  };
}

/**
 * MOST ACTIVE PRODUCTS
 */
export function getTopActiveProducts(transactions: Transaction[]) {
  const map: Record<string, number> = {};

  for (const t of transactions) {
    map[t.productId] = (map[t.productId] || 0) + t.quantity;
  }

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([productId, activity]) => ({
      productId,
      activity,
    }));
}