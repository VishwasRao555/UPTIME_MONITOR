import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout, { step } from '../components/AuthLayout';
import PasswordField from '../components/PasswordField';
import { SubmitButton, FormError, SocialRow } from '../components/AuthExtras';
import useAuthForm from '../hooks/useAuthForm';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import * as v from '../utils/validate';

const rules = { email: v.email, password: v.password };

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const { signIn } = useAuth();

  // Controlled, and actually sent: it decides whether the browser keeps the
  // session cookie after it closes. Previously this was decorative.
  const [remember, setRemember] = useState(true);

  const { form, errors, submitting, apiError, set, blur, submit } = useAuthForm({
    initial: { email: '', password: '' },
    rules,
    onSubmit: async (values) => {
      const user = await signIn({
        email: values.email.trim(),
        password: values.password,
        remember,
      });
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      navigate('/', { replace: true });
    },
  });

  return (
    <AuthLayout
      eyebrow="Sign in"
      title={<>Welcome<br />back</>}
      sub="The watch kept ticking. Sign in and see who blinked while you were gone."
      tagline="Your sites' night watch"
    >
      <form className="form auth-form" onSubmit={submit} noValidate>
        <FormError message={apiError} />

        <div className="form-row" style={step(4)}>
          <label htmlFor="email">Email <span className="req" aria-hidden="true">*</span></label>
          <div className={`input-wrap ${errors.email ? 'has-error' : ''}`}>
            <input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              onBlur={blur('email')}
              placeholder="you@company.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              autoFocus
              required
            />
          </div>
          {errors.email && (
            <span className="field-error" id="email-error" role="alert">{errors.email}</span>
          )}
        </div>

        <div style={step(5)}>
          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={set('password')}
            onBlur={blur('password')}
            error={errors.password}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </div>

        <div className="auth-row" style={step(6)}>
          <label className="checkbox">
            <input
              type="checkbox"
              name="remember"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Keep me signed in</span>
          </label>
          <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
        </div>

        <div style={step(7)}>
          <SubmitButton busy={submitting} busyLabel="Signing in…">Sign in</SubmitButton>
        </div>

        <div style={step(8)}>
          <SocialRow verb="sign in" />
        </div>

        <p className="auth-swap" style={step(9)}>
          New here? <Link to="/signup" className="auth-link strong">Create an account</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
