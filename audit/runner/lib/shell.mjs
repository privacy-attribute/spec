// The public baseline (P-public-text, P-public-style, P-public-media, P-public-interaction)
// that wraps every fixture, so the fidelity check has public content on every page.
export const shell = {
  head: `<style>
:root{--brand:#2b5cad}
body{font:15px/1.4 Georgia,serif;margin:0}
.audit-nav{display:flex;gap:16px;padding:10px 16px;background:var(--brand);color:#fff}
.audit-nav a{color:#fff}
.audit-menu{position:relative}
.audit-menu ul{display:none;position:absolute;background:#fff;color:#000;margin:0;padding:6px;list-style:none}
.audit-menu:hover ul{display:block}
.audit-main{padding:16px}
.audit-hero{display:flex;gap:12px;align-items:center;animation:audit-fade 1s}
@keyframes audit-fade{from{opacity:.2}to{opacity:1}}
</style>`,
  top: `<nav class="audit-nav" data-audit-category="public" data-audit-pattern="P-public-interaction">
<a href="/">Home</a><a href="/pricing">Pricing</a>
<span class="audit-menu" data-audit-category="public">Products<ul><li>Cameras</li><li>Lenses</li></ul></span>
</nav>
<div class="audit-hero" data-audit-category="public" data-audit-pattern="P-public-media">
<img src="/img.svg?c=2b5cad" alt="Acme logo" width="40" height="40" data-audit-category="public">
<h1 data-audit-category="public" data-audit-pattern="P-public-text">Acme Camera Store</h1>
<span data-audit-category="public" data-audit-pattern="P-public-text">Free shipping on orders over €50. Lens kit from €249.</span>
</div>
<main class="audit-main">`,
  bottom: `</main>
<footer data-audit-category="public" data-audit-pattern="P-public-text">© Acme Camera Store. Help, returns and privacy policy.</footer>`,
};
