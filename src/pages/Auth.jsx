import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { useAuth } from '../context/AuthContext'

export function SignUp() {
  const { signUp, session, loading } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!loading && session) return <Navigate to="/app" replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signUp(username, email, password)
      navigate('/app')
    } catch (err) {
      setError(err.message || 'Sign up failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Choose a username and email. We’ll create your smart account after you sign up."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-ink hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Username"
          value={username}
          onChange={setUsername}
          autoComplete="username"
          placeholder="alice"
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="alice@email.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder="••••••••"
        />
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Creating…' : 'Sign up'}
        </button>
      </form>
    </AuthShell>
  )
}

export function SignIn() {
  const { signIn, session, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!loading && session) return <Navigate to="/app" replace />

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email, password)
      navigate('/app')
    } catch (err) {
      setError(err.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the email and password you signed up with."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-ink hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="alice@email.com"
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="••••••••"
        />
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

function AuthShell({ title, subtitle, footer, children }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <BrandLogo to="/" size="nav" />
        <Link to="/" className="text-[13px] text-muted hover:text-ink">
          Back
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-2 text-[14px] text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-center text-[13px] text-muted">{footer}</p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <label className="block text-[13px] font-medium text-ink">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none focus:border-ink"
        required
        {...rest}
      />
    </label>
  )
}
