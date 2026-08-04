import { Link, useNavigate } from 'react-router-dom';
import AuthLayout, { step } from '../components/AuthLayout';
import PasswordField from '../components/PasswordField';
import { SubmitButton, FormError, SocialRow } from '../components/AuthExtras';
import useAuthForm from '../hooks/useAuthForm';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { armWelcome } from '../components/WelcomeAlerts';
import * as v from '../utils/validate';

const rules = { name: v.name, email: v.email, password: v.password };

export default function Signup() {
  const navigate = useNavigate();
  const toast = useToast();
  const { register } = useAuth();

  const { form, errors, submitting, apiError, set, blur, submit } = useAuthForm({
    initial: { name: '', email: '', password: '' },
    rules,
    onSubmit: async (values) => {
      await register({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password,
      });
      // Arms the one-time alerts popup for the dashboard we are about to land
      // on — asked there rather than here so it does not interrupt signup.
      armWelcome();
      toast.success('Account created. Add your first monitor.');
      navigate('/', { replace: true });
    },
  });

  return (
    <AuthLayout
      eyebrow="Create account"
      title={<>Start<br />watching</>}
      sub="Drop a URL. We take the night shift — probe on your cadence, mute the blips, ping you the second it goes dark."
      tagline="Your sites' night watch"
    >
      <form className="form auth-form" onSubmit={submit} noValidate>
        <FormError message={apiError} />

        <div className="form-row" style={step(4)}>
          <label htmlFor="name">Name <span className="req" aria-hidden="true">*</span></label>
          <div className={`input-wrap ${errors.name ? 'has-error' : ''}`}>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              onBlur={blur('name')}
              placeholder="Ada Lovelace"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'name-error' : undefined}
              autoFocus
              required
            />
          </div>
          {errors.name && (
            <span className="field-error" id="name-error" role="alert">{errors.name}</span>
          )}
        </div>

        <div className="form-row" style={step(5)}>
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
              required
            />
          </div>
          {errors.email && (
            <span className="field-error" id="email-error" role="alert">{errors.email}</span>
          )}
          <span className="hint">Downtime alerts go here.</span>
        </div>

        <div style={step(6)}>
          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={set('password')}
            onBlur={blur('password')}
            error={errors.password}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            showStrength
          />
        </div>

        <div style={step(7)}>
          <SubmitButton busy={submitting} busyLabel="Creating account…">Create account</SubmitButton>
          <p className="auth-fine">
            By creating an account you agree to the{' '}
            <Link to="/docs" className="auth-link">terms</Link> and{' '}
            <Link to="/docs" className="auth-link">privacy policy</Link>.
          </p>
        </div>

        <div style={step(8)}>
          <SocialRow verb="sign up" />
        </div>

        <p className="auth-swap" style={step(9)}>
          Already have an account? <Link to="/login" className="auth-link strong">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
