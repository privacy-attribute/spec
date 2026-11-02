import { useState } from 'react';
import { useApiKeys, useWebhook } from '../hooks/data';

export function ApiKeysPage() {
  const keys = useApiKeys();
  const hook = useWebhook();
  const [shown, setShown] = useState<Record<string, boolean>>({});
  return (
    <div className="api-keys">
      <ul>
        {keys.map((k) => (
          <li key={k.id}>
            <span className="key-label">{k.label}</span>
            <code className="key-value">{shown[k.id] ? k.plaintext : `${k.prefix}••••••••`}</code> {/* @expect secret block */}
            <button onClick={() => setShown({ ...shown, [k.id]: !shown[k.id] })}>Reveal</button>
            <button onClick={() => navigator.clipboard.writeText(k.plaintext)}>Copy</button> {/* @expect secret block */}
          </li>
        ))}
      </ul>
      <h3>Webhook</h3>
      <code>{hook.signingSecret}</code> {/* @expect secret block */}
      <input readOnly value={hook.url} /> {/* @expect personal mask */}
    </div>
  );
}
