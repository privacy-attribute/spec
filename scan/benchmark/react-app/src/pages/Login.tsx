import { useState } from 'react';
import { Input, Button } from '../ui';

export function LoginPage() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); signIn(email, pw); }}>
      <label htmlFor="email">Email</label>
      <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} /> {/* @expect personal mask */}
      <label htmlFor="pw">Password</label>
      <Input id="pw" type={visible ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} /> {/* @expect secret block */}
      <button type="button" onClick={() => setVisible((v) => !v)}>{visible ? 'Hide' : 'Show'}</button>
      <Button type="submit">Sign in</Button>
      <p className="hint">Signed in before as {localStorage.getItem('lastLogin')}?</p> {/* @expect personal mask */}
    </form>
  );
}
