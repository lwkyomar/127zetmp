import type { ConnectionStatus } from '../hooks/usePresence'
import type { GeoErrorCode, GeoPermission } from '../hooks/useGeolocation'
import { formatClock, formatRelative } from '../lib/format'

interface StatusPanelProps {
  name: string
  status: ConnectionStatus
  sharing: boolean
  lastUpdate: number | null
  friendsCount: number
  permission: GeoPermission
  errorCode: GeoErrorCode
  configured: boolean
  now: number
  onToggleSharing: () => void
  onRecenter: () => void
  onLogout: () => void
}

type Tone = 'ok' | 'warn' | 'bad' | 'muted'

function connectionInfo(status: ConnectionStatus, configured: boolean): { label: string; tone: Tone } {
  if (!configured) return { label: 'Not configured', tone: 'muted' }
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'ok' }
    case 'connecting':
      return { label: 'Connecting…', tone: 'warn' }
    case 'error':
      return { label: 'Reconnecting…', tone: 'bad' }
    default:
      return { label: 'Connecting…', tone: 'warn' }
  }
}

function locationNotice(permission: GeoPermission, errorCode: GeoErrorCode): string | null {
  if (errorCode === 'unsupported') {
    return 'This browser cannot share location. Open the site in a modern mobile or desktop browser.'
  }
  if (permission === 'denied' || errorCode === 'denied') {
    return 'Location access is blocked. Allow it for this site in your browser settings, then tap Start sharing.'
  }
  if (errorCode === 'unavailable') {
    return 'No GPS fix yet. Move somewhere with a clearer view of the sky and we will keep trying.'
  }
  if (errorCode === 'timeout') {
    return 'Getting your location is taking longer than usual. We will retry automatically.'
  }
  return null
}

export function StatusPanel({
  name,
  status,
  sharing,
  lastUpdate,
  friendsCount,
  permission,
  errorCode,
  configured,
  now,
  onToggleSharing,
  onRecenter,
  onLogout,
}: StatusPanelProps) {
  const connection = connectionInfo(status, configured)
  const notice = locationNotice(permission, errorCode)
  const busy = !configured

  return (
    <aside className="panel" aria-label="Tracker status">
      <header className="panel__head">
        <div className="brand brand--sm">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">{name}</span>
        </div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={onLogout}>
          Log out
        </button>
      </header>

      <dl className="panel__rows">
        <div className="row">
          <dt className="row__k">Connection</dt>
          <dd className="row__v">
            <span className={`pill pill--${connection.tone}`}>
              <span className="pill__dot" aria-hidden="true" />
              {connection.label}
            </span>
          </dd>
        </div>

        <div className="row">
          <dt className="row__k">Location sharing</dt>
          <dd className="row__v">
            <span className={`pill pill--${sharing ? 'ok' : 'muted'}`}>
              <span className="pill__dot" aria-hidden="true" />
              {sharing ? 'On' : 'Off'}
            </span>
          </dd>
        </div>

        <div className="row">
          <dt className="row__k">Last update</dt>
          <dd className="row__v mono">
            {formatClock(lastUpdate)} · {formatRelative(lastUpdate, now)}
          </dd>
        </div>

        <div className="row">
          <dt className="row__k">Friends live</dt>
          <dd className="row__v mono">{friendsCount}</dd>
        </div>
      </dl>

      {!configured && (
        <p className="notice notice--warn">
          Add your Supabase URL and anon key to <code>.env</code> to go live. See the README.
        </p>
      )}
      {configured && notice && <p className="notice notice--warn">{notice}</p>}

      <div className="panel__actions">
        <button
          className="btn btn--primary"
          type="button"
          onClick={onToggleSharing}
          disabled={busy}
        >
          {sharing ? 'Stop sharing location' : 'Start sharing location'}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onRecenter} disabled={busy}>
          Center on me
        </button>
      </div>
    </aside>
  )
}
