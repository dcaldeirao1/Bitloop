import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BrandLogo } from '../components/BrandLogo'
import { ThemeToggle } from '../components/ThemeToggle'
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
          <Link to="/signin" className="auth-link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="auth-form">
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
        {error && <p className="alert-error">{error}</p>}
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
          <Link to="/signup" className="auth-link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="auth-form">
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
        {error && <p className="alert-error">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}

function AuthShell({ title, subtitle, footer, children }) {
  return (
    <div className="auth-page">
      <div className="auth-atmosphere" aria-hidden="true">
        <span className="landing-orb is-a" />
        <span className="landing-orb is-b" />
        <span className="landing-orb is-c" />
        <div className="landing-grid-bg auth-grid" />
        <div className="landing-hero-noise" />
      </div>

      <header className="auth-top">
        <BrandLogo to="/" size="nav" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/" className="auth-back">
            Back
          </Link>
        </div>
      </header>

      <div className="auth-center">
        <div className="auth-panel">
          <p className="auth-eyebrow">bitloop</p>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          <div className="auth-body">{children}</div>
          <p className="auth-footer">{footer}</p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', ...rest }) {
  return (
    <label className="auth-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        {...rest}
      />
    </label>
  )
}
