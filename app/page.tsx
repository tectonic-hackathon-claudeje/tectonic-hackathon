import Link from "next/link";
import { CATEGORY_LABELS, getProducts } from "@/lib/products";

export default function HomePage() {
  const products = getProducts();

  return (
    <main id="main" className="site-main">
      <h1>KBC products at a glance</h1>
      <p className="lede">
        Browse mock insurance, banking, lending, and investing products. Cards
        are links, copy is plain language, and details live on a dedicated page.
      </p>
      <ul className="product-list">
        {products.map((product) => (
          <li key={product.id}>
            <Link className="product-card" href={`/products/${product.id}`}>
              <p className="eyebrow">{CATEGORY_LABELS[product.category]}</p>
              <h2>{product.name}</h2>
              <p className="meta">{product.shortDescription}</p>
              <p className="meta">{product.typicalPrice}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
