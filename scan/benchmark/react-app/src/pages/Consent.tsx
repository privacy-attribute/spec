import { Switch } from '../ui';
import { usePrefs } from '../hooks/data';

export function ConsentSettings() {
  const { prefs, update } = usePrefs();
  return (
    <div className="consent">
      <h2>Privacy choices</h2>
      <label>Product emails <Switch checked={prefs.productEmails} onCheckedChange={(v) => update({ productEmails: v })} /></label> {/* @expect personal mask */}
      <label>Share usage data <Switch checked={prefs.analytics} onCheckedChange={(v) => update({ analytics: v })} /></label> {/* @expect personal mask */}
      <div className="pill-toggle" onClick={() => update({ ads: !prefs.ads })} data-on={prefs.ads}>Personalised ads</div> {/* @expect personal mask */}
      <p>Last changed by {prefs.changedBy} on {prefs.changedAt}</p> {/* @expect personal mask */}
    </div>
  );
}
