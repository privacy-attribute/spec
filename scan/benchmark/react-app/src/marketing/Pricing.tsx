import { plans } from './content';

export function Pricing() {
  return (
    <section className="pricing">
      <h2>Simple pricing</h2>
      <div className="plans">
        {plans.map((plan) => (
          <article key={plan.id} className="plan">
            <h3>{plan.name}</h3> {/* @expect public none */}
            <p className="price">{plan.amount} per seat / month</p> {/* @expect public none */}
            <ul>{plan.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <a href={`/signup?plan=${plan.id}`}>Choose {plan.title}</a> {/* @expect public none */}
          </article>
        ))}
      </div>
    </section>
  );
}
