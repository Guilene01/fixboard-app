import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Wrench, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import TextField from '../components/TextField';
import Button from '../components/Button';
import ErrorBanner from '../components/ErrorBanner';
import ThemeToggle from '../components/ThemeToggle';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.email || !form.password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await login(form);
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
            <h1 className="text-xl font-semibold text-text">Welcome back</h1>
            <p className="mt-1 text-sm text-text-muted">
              Log in to keep troubleshooting with your cohort.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          <ErrorBanner message={error} />

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
            placeholder="••••••••"
            value={form.password}
            onChange={update('password')}
            autoComplete="current-password"
          />

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Logging in…' : 'Log in'}
            {!loading && <ArrowRight size={16} />}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          New to FixBoard?{' '}
          <Link to="/signup" className="font-medium text-accent hover:text-accent-hover">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
