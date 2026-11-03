import { useAuth } from '../hooks/session';
import { useToast } from '../hooks/toast';
import { RecordChip, MultipleRecordPicker, OTPInput, Controller, Input, BillingValue } from '../components/ui';

// Patterns from a CRM front end: record chips and pickers, email threads, workspace settings.
export function CrmWorkspace({ opportunity, thread, apiKeys, webhook, field, form, plan, memberName, t }) {
  const { signOut } = useAuth();
  const { enqueueToast } = useToast();
  const onSave = () => enqueueToast({ children: 'Settings saved' });
  const onInvite = (email) => enqueueToast({
    children: `Invitation sent to ${email}`, // @expect personal mask
  });
  return (
    <section>
      <h2>Opportunity</h2>
      <RecordChip record={opportunity.pointOfContact} /> {/* @expect third-party mask */}
      <MultipleRecordPicker selectedRecordIds={opportunity.attendeeIds} /> {/* @expect third-party mask */}
      <label>Stage</label>
      <select options={field.metadata.options} aria-label={field.label} /> {/* @expect public none */}
      <h3 className="thread-subject">{thread.subject}</h3> {/* @expect third-party mask */}
      <p className="thread-excerpt">{thread.lastMessage.snippet}</p> {/* @expect third-party mask */}
      <OTPInput maxLength={6} value={form.code} onChange={form.setCode} /> {/* @expect secret block */}
      <Controller name="signingSecret" control={form.control} render={({ field: f }) => <Input {...f} />} /> {/* @expect secret block */}
      <Input readOnly value={webhook.targetUrl} /> {/* @expect secret block */}
      <table>
        <tbody>
          {apiKeys.map((key) => (
            <tr key={key.id}>
              <td className="key-name">{key.name}</td> {/* @expect personal mask */}
              <td>{key.expiresAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">{t`Send the recovery code to ${memberName} today.`}</p> {/* @expect third-party mask */}
      <BillingValue>{plan.seats}</BillingValue>
      <span className="billing-value">{value}</span> {/* @expect personal mask */}
      <button onClick={onSave}>Save</button>
      <button onClick={() => onInvite(form.email)}>Invite</button>
      <button onClick={signOut}>Sign out</button>
    </section>
  );
}
