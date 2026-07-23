import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Wrench, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TextField from '../components/TextField';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';
import ThemeToggle from '../components/ThemeToggle';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function validate() {
    if (!form.name.trim()) return 'Please enter your name.';
    if (!EMAIL_RE.test(form.email)) return 'Please enter a valid email address.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);
    try {
      await signup(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-muted text-accent">
            <Wrench size={22} />
          </span>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-text">Create your account</h1>
            <p className="mt-1 text-sm text-text-muted">
              Start building a searchable troubleshooting log with your class.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          <ErrorBanner message={error} />

          <TextField
            label="Name"
            icon={User}
            placeholder="Ada Lovelace"
            value={form.name}
            onChange={update('name')}
            autoComplete="name"
          />
          <TextField
            label="Email"
            icon={Mail}
            type="email"
            placeholder="you@school.edu"
            value={form.email}
            onChange={update('email')}
            autoComplete="email"
          />
          <TextField
            label="Password"
            icon={Lock}
            type="password"
            placeholder="At least 8 characters"
            value={form.password}
            onChange={update('password')}
            autoComplete="new-password"
          />

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Creating account…' : 'Create account'}
            {!loading && <ArrowRight size={16} />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:text-accent-hover">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
