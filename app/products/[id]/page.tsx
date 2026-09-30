import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, getProductById, getProducts } from "@/lib/products";

type ProductPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return getProducts().map((product) => ({ id: product.id }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    return { title: "Product not found" };
  }

  return {
    title: product.name,
    description: product.shortDescription,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = getProductById(id);

  if (!product) {
    notFound();
  }

  return (
    <main id="main" className="site-main product-detail">
      <Link className="back-link" href="/">
        Back to all products
      </Link>
      <p className="eyebrow">{CATEGORY_LABELS[product.category]}</p>
      <h1>{product.name}</h1>
      <p className="lede">{product.description}</p>
      <p>
        <strong>Who it is for:</strong> {product.whoItIsFor}
      </p>
      <p>
        <strong>Typical price:</strong> {product.typicalPrice}
      </p>
      <h2>What is included</h2>
      <ul className="highlights">
        {product.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </main>
  );
}
