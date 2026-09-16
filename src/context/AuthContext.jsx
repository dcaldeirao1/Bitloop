import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  isValidEmail,
  isValidUsername,
  normalizeUsername,
  supabase,
} from '../lib/supabase'
import { createSmartAccount } from '../lib/relayer'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [provisioning, setProvisioning] = useState(false)
  const [error, setError] = useState(null)

  const refreshProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return null
    }
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) throw profileError
    setProfile(data)
    return data
  }, [])

  const ensureSmartAccount = useCallback(
    async (activeSession) => {
      if (!activeSession?.access_token) return null
      setProvisioning(true)
      try {
        const result = await createSmartAccount(activeSession.access_token)
        const next = await refreshProfile(activeSession.user.id)
        return { result, profile: next }
      } finally {
        setProvisioning(false)
      }
    },
    [refreshProfile],
  )

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      if (data.session?.user) {
        try {
          let p = await refreshProfile(data.session.user.id)
          if (p && !p.account_address) {
            await ensureSmartAccount(data.session)
            p = await refreshProfile(data.session.user.id)
          }
        } catch (err) {
          console.error(err)
          setError(err.message)
        }
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next?.user) {
        try {
          let p = await refreshProfile(next.user.id)
          if (p && !p.account_address) {
            await ensureSmartAccount(next)
          }
        } catch (err) {
          console.error(err)
          setError(err.message)
        }
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [ensureSmartAccount, refreshProfile])

  const signUp = useCallback(async (username, email, password) => {
    setError(null)
    if (!isValidUsername(username)) {
      throw new Error('Username must be 3–24 characters (letters, numbers, underscore).')
    }
    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email address.')
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.')
    }

    const name = normalizeUsername(username)
    const cleanEmail = email.trim().toLowerCase()

    const { data: taken, error: takenError } = await supabase.rpc('is_username_taken', {
      name,
    })
    if (takenError) throw takenError
    if (taken) throw new Error('That username is already taken.')

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: name } },
    })
    if (signUpError) throw signUpError
    if (!data.user) throw new Error('Sign up failed.')

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username: name,
    })
    if (profileError) {
      throw new Error(profileError.message || 'Could not create profile.')
    }

    if (data.session) {
      setSession(data.session)
      await refreshProfile(data.user.id)
      await ensureSmartAccount(data.session)
    } else {
      throw new Error(
        'Check your email to confirm the account, or disable email confirmation in Supabase Auth settings.',
      )
    }

    return data
  }, [ensureSmartAccount, refreshProfile])

  const signIn = useCallback(async (email, password) => {
    setError(null)
    if (!isValidEmail(email)) {
      throw new Error('Enter a valid email address.')
    }
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (signInError) throw signInError

    setSession(data.session)
    const p = await refreshProfile(data.user.id)
    if (p && !p.account_address) {
      await ensureSmartAccount(data.session)
    }
    return data
  }, [ensureSmartAccount, refreshProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      provisioning,
      error,
      signUp,
      signIn,
      signOut,
      refreshProfile,
      ensureSmartAccount,
    }),
    [
      session,
      profile,
      loading,
      provisioning,
      error,
      signUp,
      signIn,
      signOut,
      refreshProfile,
      ensureSmartAccount,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
