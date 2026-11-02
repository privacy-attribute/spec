import { useForm } from 'react-hook-form';
import { TextField, DatePicker } from '../ui';

export function SignupPage() {
  const { register, formState: { errors } } = useForm();
  return (
    <form className="signup">
      <TextField label="Full name" {...register('fullName')} /> {/* @expect personal mask */}
      <TextField label="Work email" {...register('email')} /> {/* @expect personal mask */}
      <TextField label="Password" type="password" {...register('password')} /> {/* @expect secret block */}
      <TextField label="Confirm password" type="password" {...register('confirm')} /> {/* @expect secret block */}
      <DatePicker label="Date of birth" {...register('dob')} /> {/* @expect personal mask */}
      {errors.email && <span className="error">{String(errors.email.message)}</span>} {/* @expect personal mask */}
      <button type="submit">Create account</button>
    </form>
  );
}
