import { useMembers } from '../hooks/data';
import { Avatar } from '../components/Avatar';

export function TeamMembers() {
  const members = useMembers();
  return (
    <table className="team">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.id}>
            <td><Avatar src={m.avatarUrl} initials={m.initials} /> {m.name}</td> {/* @expect third-party mask */}
            <td>{m.email}</td> {/* @expect third-party mask */}
            <td>{m.role}</td>
            <td><button aria-label={`Remove ${m.email}`}>Remove</button></td> {/* @expect third-party mask */}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InviteForm({ onInvite }: { onInvite: (to: string) => void }) {
  return (
    <form onSubmit={(e) => onInvite(new FormData(e.currentTarget).get('to') as string)}>
      <input name="to" type="email" placeholder="colleague@example.com" /> {/* @expect third-party mask */}
      <button>Send invite</button>
    </form>
  );
}
