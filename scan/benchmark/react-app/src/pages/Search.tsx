import { useState } from 'react';
import { useSearchResults } from '../hooks/data';

export function SearchPage() {
  const [term, setTerm] = useState('');
  const hits = useSearchResults(term);
  return (
    <div className="search">
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Find customers" /> {/* @expect third-party mask */}
      <p className="summary">{hits.length} results for "{term}"</p> {/* @expect third-party mask */}
      <ul>
        {hits.map((h) => (
          <li key={h.id}>
            <a href={`/customers/${h.id}`}>{h.title}</a> {/* @expect third-party mask */}
            <span className="sub">{h.subtitle}</span> {/* @expect third-party mask */}
          </li>
        ))}
      </ul>
    </div>
  );
}
