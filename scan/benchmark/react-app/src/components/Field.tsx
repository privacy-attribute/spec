import type { ReactNode } from 'react';

// Generic read-only field: a label and a value or children.
export function Field({ label, value, children }: { label: string; value?: ReactNode; children?: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{value ?? children}</dd>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
