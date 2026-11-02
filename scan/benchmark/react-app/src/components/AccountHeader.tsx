import { useCurrentUser } from '../hooks/session';
import { Avatar } from './Avatar';

export function AccountHeader() {
  const user = useCurrentUser(); // @expect personal mask
  const greeting = `Welcome back, ${user.firstName}`;
  return (
    <header className="account-header">
      <Avatar src={user.avatarUrl} size={32} /> {/* @expect personal mask */}
      <h2 className="greeting">{greeting}</h2> {/* @expect personal mask */}
      <div className="account-meta">
        <span className="account-name">{user.name}</span> {/* @expect personal mask */}
        <span className="account-email">{user.email}</span> {/* @expect personal mask */}
      </div>
    </header>
  );
}
