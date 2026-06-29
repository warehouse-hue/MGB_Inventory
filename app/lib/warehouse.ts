import { getProducts } from "./storage";
import { getInventory } from "./storage";

export type EnrichedInventoryItem = {
  id: number;
  productId: number;
  name: string;
  sku: string;
  category: string;
  variant: string;
  stock: number;
  location: string;
};

/**
 * This is your "database join"
 * It combines products + inventory into one usable structure
 */
export function getEnrichedInventory(): EnrichedInventoryItem[] {
  const products = getProducts();
  const inventory = getInventory();

  return inventory.map((item) => {
    const product = products.find((p) => p.id === item.productId);

    return {
      id: item.id,
      productId: item.productId,
      name: product?.name || "Unknown Product",
      sku: product?.sku || "N/A",
      category: product?.category || "Misc",
      variant: item.variant,
      stock: item.stock,
      location: item.location,
    };
  });
}