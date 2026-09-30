export type ProductCategory =
  | "insurance"
  | "banking"
  | "lending"
  | "investing";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  shortDescription: string;
  description: string;
  highlights: string[];
  whoItIsFor: string;
  typicalPrice: string;
};
