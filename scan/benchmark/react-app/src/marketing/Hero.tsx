import { hero, testimonials } from './content';

export function Hero() {
  return (
    <section className="hero">
      <h1>{hero.title}</h1> {/* @expect public none */}
      <p className="lede">{hero.subtitle}</p>
      <img src={hero.imageUrl} alt="Product screenshot" /> {/* @expect public none */}
      <a className="cta" href="/signup">Start free trial</a>
      <div className="quotes">
        {testimonials.map((t) => (
          <figure key={t.id}>
            <blockquote>{t.quote}</blockquote>
            <figcaption>{t.author.name}, {t.author.company}</figcaption> {/* @expect public none */}
          </figure>
        ))}
      </div>
    </section>
  );
}
