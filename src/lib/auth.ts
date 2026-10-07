/**
 * Client-side gate for a small private group site.
 *
 * This is intentionally lightweight: the site is static (GitHub Pages) and has
 * no backend. The password is never stored in plain text — only its SHA-256
 * digest is compared. This keeps casual visitors out; it is not real security.
 */

// SHA-256 of the group password.
const PASSWORD_HASH = '465fb0624d39e5e333b392062e44fee931e4c1c32638c4247689e95758d78fba'

const SESSION_KEY = 'khazarium.session'
const USER_ID_KEY = 'khazarium.userId'

export interface Session {
  name: string
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyPassword(input: string): Promise<boolean> {
  if (!input) return false
  try {
    return (await sha256Hex(input)) === PASSWORD_HASH
  } catch {
    return false
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<Session>
    if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
      return { name: parsed.name.trim() }
    }
  } catch {
    /* ignore malformed session */
  }
  return null
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

/**
 * Stable per-browser id. Reusing it across tabs means one person maps to one
 * marker, even when the site is open in several tabs.
 */
export function createUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}
