import { useProfile } from '../hooks/data';
import { Field, Card } from '../components/Field';

export function ProfileSettings() {
  const { data: me } = useProfile();
  const phoneDisplay = formatPhone(me.phoneNumber);
  const where = [me.street, me.city, me.postalCode].join(', ');
  return (
    <div className="profile">
      <Card title="Contact">
        <Field label="Email" value={me.email} /> {/* @expect personal mask */}
        <Field label="Phone" value={phoneDisplay} /> {/* @expect personal mask */}
        <Field label="Address">{where}</Field> {/* @expect personal mask */}
      </Card>
      <Card title="About you">
        <textarea name="bio" defaultValue={me.bio} rows={4} /> {/* @expect personal mask */}
        <input name="pronouns" defaultValue={me.pronouns} /> {/* @expect personal mask */}
      </Card>
      <Card title="Two-factor">
        <QRCode value={me.totpUri} /> {/* @expect secret block */}
        <ul className="backup-codes">{me.backupCodes.map((c) => <li key={c}>{c}</li>)}</ul> {/* @expect secret block */}
      </Card>
    </div>
  );
}
