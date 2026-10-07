import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoginScreen } from './components/LoginScreen'
import { MapView } from './components/MapView'
import { StatusPanel } from './components/StatusPanel'
import { useGeolocation } from './hooks/useGeolocation'
import { useNow } from './hooks/useNow'
import { usePresence } from './hooks/usePresence'
import { clearSession, createUserId, loadSession, saveSession } from './lib/auth'
import { isSupabaseConfigured } from './lib/supabase'

export default function App() {
  const [name, setName] = useState<string | null>(() => loadSession()?.name ?? null)
  const userId = useMemo(() => createUserId(), [])

  const geo = useGeolocation()
  const { start, stop, sharing, coordinates, updatedAt, permission, errorCode } = geo

  const identity = useMemo(() => (name ? { id: userId, name } : null), [name, userId])
  const { status, friends } = usePresence({ identity, sharing, coordinates, updatedAt })

  const now = useNow(1000)
  const [focusSignal, setFocusSignal] = useState(0)

  // Ask for location permission once the user is signed in.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!name || autoStartedRef.current) return
    autoStartedRef.current = true
    start()
  }, [name, start])

  const self = useMemo(
    () => (name && coordinates ? { lat: coordinates.lat, lng: coordinates.lng, name } : null),
    [name, coordinates],
  )

  const handleAuthenticate = useCallback((newName: string) => {
    saveSession({ name: newName })
    autoStartedRef.current = false
    setName(newName)
  }, [])

  const handleLogout = useCallback(() => {
    stop()
    clearSession()
    autoStartedRef.current = false
    setName(null)
  }, [stop])

  const handleToggleSharing = useCallback(() => {
    if (sharing) stop()
    else start()
  }, [sharing, start, stop])

  const handleRecenter = useCallback(() => setFocusSignal((value) => value + 1), [])

  if (!name) {
    return <LoginScreen onAuthenticated={handleAuthenticate} />
  }

  return (
    <div className="app">
      <MapView
        self={self}
        selfSharing={sharing}
        friends={friends}
        now={now}
        focusSignal={focusSignal}
      />
      <StatusPanel
        name={name}
        status={status}
        sharing={sharing}
        lastUpdate={updatedAt}
        friendsCount={friends.length}
        permission={permission}
        errorCode={errorCode}
        configured={isSupabaseConfigured}
        now={now}
        onToggleSharing={handleToggleSharing}
        onRecenter={handleRecenter}
        onLogout={handleLogout}
      />
    </div>
  )
}
