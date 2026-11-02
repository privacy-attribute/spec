import { useNavigate, useSearchParams } from 'react-router-dom';

export function ResetRequest() {
  const navigate = useNavigate();
  const submit = (email: string) => {
    navigate(`/reset/sent?email=${encodeURIComponent(email)}`); // @expect personal mask
  };
  return <ResetForm onSubmit={submit} />;
}

export function MagicLinkSent() {
  const [params] = useSearchParams();
  const address = params.get('email');
  return <p className="sent">Check your inbox at {address}</p>; // @expect personal mask
}

export function goToVerify(router: { push: (u: string) => void }, email: string, token: string) {
  router.push('/verify?' + new URLSearchParams({ email, token }).toString()); // @expect secret block
}
