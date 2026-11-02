const columns = [
  { title: 'Product', links: [{ label: 'Pricing', href: '/pricing' }, { label: 'Changelog', href: '/changelog' }] },
  { title: 'Company', links: [{ label: 'About', href: '/about' }, { label: 'Careers', href: '/careers' }] },
];

export function Footer() {
  return (
    <footer className="site-footer">
      {columns.map((col) => (
        <nav key={col.title} aria-label={col.title}> {/* @expect public none */}
          <h4>{col.title}</h4>
          {col.links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
      ))}
      <p>Contact us at hello@example.com</p>
      <p className="legal">Example Corp, 1 Sample Street, Springfield</p>
    </footer>
  );
}
