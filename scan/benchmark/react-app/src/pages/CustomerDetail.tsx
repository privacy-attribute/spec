import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCustomer } from '../hooks/data';
import { Field, Card } from '../components/Field';
import { usePageTitle } from '../hooks/page';

export function CustomerDetail() {
  const { id } = useParams();
  const { data: rec } = useCustomer(id);
  const { primaryContact: pc, lifetimeValue, healthScore } = rec;
  usePageTitle(`${rec.fullName} | Customers`); // @expect third-party mask
  useEffect(() => { document.title = rec.company; }, [rec]); // @expect third-party mask

  return (
    <div className="customer">
      <h1>{rec.fullName}</h1> {/* @expect third-party mask */}
      <Card title="Primary contact">
        <Field label="Name" value={pc.displayName} /> {/* @expect third-party mask */}
        <Field label="Mobile" value={pc.mobile} /> {/* @expect third-party mask */}
        <Field label="Lifetime value" value={lifetimeValue} /> {/* @expect third-party mask */}
        <Field label="Health">{healthScore}</Field> {/* @expect third-party mask */}
      </Card>
      <Card title="Notes">
        <p className="notes">{rec.internalNotes}</p> {/* @expect third-party mask */}
      </Card>
      <Card title="Tags">
        {rec.labels.map((l) => <span key={l} className="chip">{l}</span>)} {/* @expect third-party mask */}
      </Card>
    </div>
  );
}
