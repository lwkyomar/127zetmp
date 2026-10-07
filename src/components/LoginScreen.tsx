import { useState, type FormEvent } from 'react'
import { verifyPassword } from '../lib/auth'

interface LoginScreenProps {
  onAuthenticated: (name: string) => void
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Add your name so friends can recognise you on the map.')
      return
    }

    setBusy(true)
    setError(null)
    const ok = await verifyPassword(password)
    if (ok) {
      onAuthenticated(trimmedName)
    } else {
      setError('That password does not match. Check it and try again.')
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login__glow" aria-hidden="true" />
      <main className="login__card">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Khazarium</span>
        </div>

        <h1 className="login__title">Your friends, live on one map</h1>
        <p className="login__lede">
          Enter the group password to open the tracker. Your browser will then ask for location
          access so the others can see where you are while the page is open.
        </p>

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field__label">Your name</span>
            <input
              className="field__input"
              type="text"
              name="name"
              autoComplete="nickname"
              placeholder="e.g. Mara"
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field__label">Group password</span>
            <input
              className="field__input"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && (
            <p className="form__error" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Open the map'}
          </button>
        </form>

        <p className="login__foot">
          Only your live position is shared, and only while this page is open.
        </p>
      </main>
    </div>
  )
}
