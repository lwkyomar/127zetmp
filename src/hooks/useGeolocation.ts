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

const PERMISSION_DENIED = 1
const POSITION_UNAVAILABLE = 2
const POSITION_TIMEOUT = 3

function toPermission(state: PermissionState): GeoPermission {
  return state
}

/**
 * Wraps `navigator.geolocation.watchPosition` with the recovery behaviour a
 * background tab needs: the watcher is restarted whenever the tab becomes
 * visible again, regains focus, or the network comes back. The watcher also
 * restarts itself if the browser silently drops it while hidden.
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

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }
    watchIdRef.current = null
  }, [])

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      sharingRef.current = false
      setState((prev) => ({ ...prev, errorCode: 'unsupported', permission: 'denied', sharing: false }))
      return
    }

    clearWatch()

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
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
    setState((prev) => ({ ...prev, sharing: true, errorCode: null }))
    startWatch()
  }, [startWatch])

  const stop = useCallback(() => {
    sharingRef.current = false
    clearWatch()
    setState((prev) => ({ ...prev, sharing: false }))
  }, [clearWatch])

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

  // Recovery: restart the watcher when the tab returns to the foreground.
  useEffect(() => {
    const resumeIfSharing = () => {
      if (sharingRef.current) startWatch()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') resumeIfSharing()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', resumeIfSharing)
    window.addEventListener('online', resumeIfSharing)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', resumeIfSharing)
      window.removeEventListener('online', resumeIfSharing)
    }
  }, [startWatch])

  // Stop watching when the component unmounts.
  useEffect(() => clearWatch, [clearWatch])

  return { ...state, start, stop }
}
