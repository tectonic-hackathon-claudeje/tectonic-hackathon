import productsData from "@/data/products.json";
import type { Product, ProductCategory } from "@/lib/types";

const products = productsData as Product[];

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  insurance: "Insurance",
  banking: "Banking",
  lending: "Lending",
  investing: "Investing",
};

export function getProducts(): Product[] {
  return products;
}

export function getProductById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}

export function getProductsByCategory(category: ProductCategory): Product[] {
  return products.filter((product) => product.category === category);
}
