import { useCallback, useEffect, useRef, useState } from 'react'
import type { Coordinates } from '../lib/types'

export type GeoPermission = 'unknown' | 'prompt' | 'granted' | 'denied'
export type GeoErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | null

interface GeoState {
  coordinates: Coordinates | null
  permission: GeoPermission
  errorCode: GeoErrorCode
  sharing: boolean
  updatedAt: number | null
}

export interface UseGeolocationResult extends GeoState {
  start: () => void
  stop: () => void
}

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
}

/**
 * If a sharing tab receives no fix for this long, assume the browser silently
 * dropped the watcher (which happens when a tab is hidden or the device sleeps)
 * and start it again. Background tabs clamp timers to roughly once a minute, so
 * recovery can take up to about a minute.
 */
const WATCHDOG_STALE_MS = 30000
/** How often the watchdog checks how old the last fix is while sharing. */
const WATCHDOG_TICK_MS = 20000

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const POSITION_TIMEOUT = 3

function toPermission(state: PermissionState): GeoPermission {
  return state
}

/**
 * Wraps `navigator.geolocation.watchPosition` with the recovery behaviour a
 * background tab needs, so location keeps flowing to the server even when this
 * tab is not the one in front:
 *
 * - `watchPosition` is event-driven (not a timer), so fixes keep arriving while
 *   the tab is hidden, as far as the browser allows.
 * - A watchdog restarts the watcher if fixes stop arriving while sharing.
 * - The watcher is restarted whenever the tab becomes visible again, regains
 *   focus, the network returns, the page is restored from the back/forward
 *   cache, or the Page Lifecycle API resumes it.
 * - A screen wake lock is held while sharing so a phone left open (but untouched)
 *   does not fall asleep and stop tracking.
 */
export function useGeolocation(): UseGeolocationResult {
  const [state, setState] = useState<GeoState>({
    coordinates: null,
    permission: 'unknown',
    errorCode: null,
    sharing: false,
    updatedAt: null,
  })

  const watchIdRef = useRef<number | null>(null)
  const sharingRef = useRef(false)
  const lastFixRef = useRef(0)
  const watchdogRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
  }, [])

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current
    wakeLockRef.current = null
    if (sentinel && !sentinel.released) {
      void sentinel.release().catch(() => {
        /* already released */
      })
    }
  }, [])

  /**
   * Holds the screen wake lock while sharing, so a phone left open (but
   * untouched) does not fall asleep and stop tracking. The browser drops the
   * lock whenever the page is hidden; it is re-requested when the tab is visible.
   */
  const requestWakeLock = useCallback(() => {
    if (!('wakeLock' in navigator)) return
    if (document.visibilityState !== 'visible') return
    if (wakeLockRef.current) return
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (!sharingRef.current) {
          void sentinel.release().catch(() => {})
          return
        }
        wakeLockRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null
        })
      })
      .catch(() => {
        /* Not allowed (permissions policy, low battery, …). Tracking continues. */
      })
  }, [])

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      sharingRef.current = false
      setState((prev) => ({ ...prev, errorCode: 'unsupported', permission: 'denied', sharing: false }))
      return
    }

    clearWatch()
    // Give the fresh watcher a full window before the watchdog may restart it.
    lastFixRef.current = Date.now()

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        lastFixRef.current = Date.now()
        setState((prev) => ({
          ...prev,
          permission: 'granted',
          errorCode: null,
          coordinates: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
          updatedAt: position.timestamp || Date.now(),
        }))
      },
      (error) => {
        if (error.code === PERMISSION_DENIED) {
          sharingRef.current = false
          clearWatch()
          setState((prev) => ({ ...prev, permission: 'denied', errorCode: 'denied', sharing: false }))
        } else if (error.code === POSITION_UNAVAILABLE) {
          setState((prev) => ({ ...prev, errorCode: 'unavailable' }))
        } else if (error.code === POSITION_TIMEOUT) {
          setState((prev) => ({ ...prev, errorCode: 'timeout' }))
        }
      },
      GEOLOCATION_OPTIONS,
    )
  }, [clearWatch])

  const start = useCallback(() => {
    sharingRef.current = true
    lastFixRef.current = Date.now()
    setState((prev) => ({ ...prev, sharing: true, errorCode: null }))
    startWatch()
    requestWakeLock()
  }, [startWatch, requestWakeLock])

  const stop = useCallback(() => {
    sharingRef.current = false
    clearWatch()
    clearWatchdog()
    releaseWakeLock()
    setState((prev) => ({ ...prev, sharing: false }))
  }, [clearWatch, clearWatchdog, releaseWakeLock])

  // Track permission changes reported by the browser.
  useEffect(() => {
    if (!('permissions' in navigator) || typeof navigator.permissions?.query !== 'function') {
      return
    }
    let cancelled = false
    let status: PermissionStatus | null = null

    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) return
        status = result
        setState((prev) => ({ ...prev, permission: toPermission(result.state) }))
        result.onchange = () => {
          setState((prev) => ({ ...prev, permission: toPermission(result.state) }))
        }
      })
      .catch(() => {
        /* Permission API unsupported for geolocation — ignore. */
      })

    return () => {
      cancelled = true
      if (status) status.onchange = null
    }
  }, [])

  // Watchdog: while sharing, restart the watcher if fixes stop arriving. A
  // hidden tab (or a sleeping device) can make the browser silently stop
  // delivering updates; this brings the watcher back without waiting for the tab
  // to be looked at again. Background tabs clamp timers to about once a minute.
  useEffect(() => {
    if (!state.sharing) return
    const tick = () => {
      if (!sharingRef.current) return
      if (Date.now() - lastFixRef.current >= WATCHDOG_STALE_MS) {
        startWatch()
      }
      watchdogRef.current = window.setTimeout(tick, WATCHDOG_TICK_MS)
    }
    watchdogRef.current = window.setTimeout(tick, WATCHDOG_TICK_MS)
    return clearWatchdog
  }, [state.sharing, startWatch, clearWatchdog])

  // Recovery: restart the watcher — and re-take the wake lock — whenever the tab
  // returns to the foreground, regains focus, the network returns, the page is
  // restored from the back/forward cache, or the Page Lifecycle API resumes it.
  useEffect(() => {
    const resumeIfSharing = () => {
      if (!sharingRef.current) return
      startWatch()
      requestWakeLock()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        resumeIfSharing()
      } else {
        // The browser releases the wake lock as soon as the page is hidden.
        releaseWakeLock()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', resumeIfSharing)
    window.addEventListener('online', resumeIfSharing)
    window.addEventListener('pageshow', resumeIfSharing)

    // 'resume' is a Page Lifecycle event, not part of the DOM lib's event maps;
    // use the base EventTarget surface so the string name type-checks.
    const lifecycle: EventTarget = document
    lifecycle.addEventListener('resume', resumeIfSharing)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', resumeIfSharing)
      window.removeEventListener('online', resumeIfSharing)
      window.removeEventListener('pageshow', resumeIfSharing)
      lifecycle.removeEventListener('resume', resumeIfSharing)
    }
  }, [startWatch, requestWakeLock, releaseWakeLock])

  // Stop watching and drop the wake lock when the component unmounts.
  useEffect(
    () => () => {
      clearWatch()
      clearWatchdog()
      releaseWakeLock()
    },
    [clearWatch, clearWatchdog, releaseWakeLock],
  )

  return { ...state, start, stop }
}
