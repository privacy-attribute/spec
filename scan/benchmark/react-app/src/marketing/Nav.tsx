import { useState } from 'react';

export function Nav({ brand }: { brand: { name: string; logoUrl: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className="top-nav">
      <img src={brand.logoUrl} alt={brand.name} /> {/* @expect public none */}
      <button aria-expanded={open} onClick={() => setOpen(!open)}>Menu</button>
      <a href="/docs">Docs</a>
      <a href="/pricing">Pricing</a>
      <a href="/login">Sign in</a>
      <select aria-label="Language" defaultValue="en"> {/* @expect public none */}
        <option value="en">English</option>
        <option value="nl">Nederlands</option>
      </select>
    </nav>
  );
}
