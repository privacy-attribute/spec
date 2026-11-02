import { CardField, Input } from '../ui';
import { useBilling } from '../hooks/data';

export function BillingPage() {
  const billing = useBilling();
  const pm = billing.paymentMethod;
  return (
    <div className="billing">
      <h2>Payment method</h2>
      <p className="current-card">{pm.brand} ending in {pm.last4}, expires {pm.expMonth}/{pm.expYear}</p> {/* @expect personal mask */}
      <form className="update-card">
        <CardField name="number" placeholder="1234 1234 1234 1234" /> {/* @expect secret block */}
        <CardField name="expiry" placeholder="MM / YY" /> {/* @expect secret block */}
        <CardField name="cvc" placeholder="CVC" /> {/* @expect secret block */}
        <Input name="holder" autoComplete="cc-name" placeholder="Name on card" /> {/* @expect personal mask */}
      </form>
      <h2>Invoices</h2>
      <p>Invoices go to {billing.invoiceEmail}</p> {/* @expect personal mask */}
      <table className="invoices">
        <tbody>
          {billing.invoices.map((inv) => (
            <tr key={inv.id}><td>{inv.number}</td><td>{inv.total}</td></tr> // @expect personal mask
          ))}
        </tbody>
      </table>
    </div>
  );
}
