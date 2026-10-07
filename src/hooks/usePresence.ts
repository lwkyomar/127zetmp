import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Coordinates, Friend, Identity, LocationPayload, PresenceState, SharingPayload } from '../lib/types'

export type ConnectionStatus = 'unconfigured' | 'connecting' | 'connected' | 'error'

const CHANNEL_NAME = 'khazarium:locations'
/** Minimum gap between presence writes while moving (broadcasts are not throttled). */
const TRACK_THROTTLE_MS = 4000
/** Periodic re-broadcast so late joiners and reconnected peers catch up. */
const HEARTBEAT_MS = 15000

interface UsePresenceOptions {
  identity: Identity | null
  sharing: boolean
  coordinates: Coordinates | null
  updatedAt: number | null
}

export interface UsePresenceResult {
  status: ConnectionStatus
  friends: Friend[]
}

type Snapshot = UsePresenceOptions

/**
 * Connects to a single Supabase Realtime channel that carries live locations.
 *
 * - Broadcast `location` events deliver position updates with low latency.
 * - Presence carries identity + sharing flag (and a throttled copy of the last
 *   position) so that anyone who joins later immediately sees who is online.
 * - A heartbeat re-broadcasts the last known position every 15s, which keeps
 *   the map correct even when nobody is moving.
 */
export function usePresence({ identity, sharing, coordinates, updatedAt }: UsePresenceOptions): UsePresenceResult {
  const [status, setStatus] = useState<ConnectionStatus>(
    isSupabaseConfigured ? 'connecting' : 'unconfigured',
  )
  const [friends, setFriends] = useState<Record<string, Friend>>({})

  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastTrackRef = useRef(0)
  const snapshotRef = useRef<Snapshot>({ identity, sharing, coordinates, updatedAt })
  snapshotRef.current = { identity, sharing, coordinates, updatedAt }

  const identityId = identity?.id ?? null

  const safeSend = useCallback((event: string, payload: unknown) => {
    const channel = channelRef.current
    if (!channel) return
    channel.send({ type: 'broadcast', event, payload }).catch(() => {
      /* the channel is reconnecting; the heartbeat will retry */
    })
  }, [])

  const buildPresenceState = useCallback((): PresenceState | null => {
    const snap = snapshotRef.current
    if (!snap.identity) return null
    const located = snap.sharing && snap.coordinates
    return {
      id: snap.identity.id,
      name: snap.identity.name,
      sharing: snap.sharing,
      lat: located ? snap.coordinates!.lat : null,
      lng: located ? snap.coordinates!.lng : null,
      accuracy: located ? snap.coordinates!.accuracy : null,
      updatedAt: located ? snap.updatedAt : null,
    }
  }, [])

  const safeTrack = useCallback(() => {
    const channel = channelRef.current
    if (!channel) return
    const presence = buildPresenceState()
    if (!presence) return
    channel.track(presence).catch(() => {
      /* the channel is reconnecting; the heartbeat will retry */
    })
  }, [buildPresenceState])

  const trackPresence = useCallback(
    (force = false) => {
      const now = Date.now()
      if (!force && now - lastTrackRef.current < TRACK_THROTTLE_MS) return
      lastTrackRef.current = now
      safeTrack()
    },
    [safeTrack],
  )

  /** Re-announces our current position + presence. Used by heartbeat and recovery. */
  const publishCurrent = useCallback(
    (forceTrack: boolean) => {
      const snap = snapshotRef.current
      if (!snap.identity) return
      if (snap.sharing && snap.coordinates && snap.updatedAt) {
        safeSend('location', {
          id: snap.identity.id,
          name: snap.identity.name,
          lat: snap.coordinates.lat,
          lng: snap.coordinates.lng,
          accuracy: snap.coordinates.accuracy,
          updatedAt: snap.updatedAt,
        } satisfies LocationPayload)
      }
      trackPresence(forceTrack)
    },
    [safeSend, trackPresence],
  )

  const handleLocation = useCallback((payload: LocationPayload) => {
    if (!payload || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return
    if (payload.id === snapshotRef.current.identity?.id) return
    setFriends((prev) => {
      const prior = prev[payload.id]
      if (prior && prior.updatedAt > payload.updatedAt) return prev
      return {
        ...prev,
        [payload.id]: {
          id: payload.id,
          name: payload.name || prior?.name || 'Friend',
          lat: payload.lat,
          lng: payload.lng,
          accuracy: payload.accuracy ?? 0,
          updatedAt: payload.updatedAt,
        },
      }
    })
  }, [])

  const handleSharing = useCallback((payload: SharingPayload) => {
    if (!payload || payload.id === snapshotRef.current.identity?.id) return
    if (payload.sharing) return
    setFriends((prev) => {
      if (!(payload.id in prev)) return prev
      const next = { ...prev }
      delete next[payload.id]
      return next
    })
  }, [])

  const handlePresenceSync = useCallback(() => {
    const channel = channelRef.current
    if (!channel) return
    const myId = snapshotRef.current.identity?.id
    const state = channel.presenceState<PresenceState>()

    const incoming: Record<string, Friend> = {}
    for (const key of Object.keys(state)) {
      const entries = state[key]
      if (!entries) continue
      for (const entry of entries) {
        if (!entry || entry.id === myId) continue
        if (!entry.sharing) continue
        if (typeof entry.lat !== 'number' || typeof entry.lng !== 'number') continue
        const candidate: Friend = {
          id: entry.id,
          name: entry.name || 'Friend',
          lat: entry.lat,
          lng: entry.lng,
          accuracy: entry.accuracy ?? 0,
          updatedAt: entry.updatedAt ?? Date.now(),
        }
        const existing = incoming[entry.id]
        if (!existing || candidate.updatedAt > existing.updatedAt) {
          incoming[entry.id] = candidate
        }
      }
    }

    setFriends((prev) => {
      const next: Record<string, Friend> = {}
      for (const id of Object.keys(incoming)) {
        const prior = prev[id]
        next[id] = prior && prior.updatedAt > incoming[id].updatedAt ? prior : incoming[id]
      }
      return next
    })
  }, [])

  // (Re)subscribe whenever the identity id changes.
  useEffect(() => {
    const client = supabase
    if (!client) {
      setStatus('unconfigured')
      return
    }
    if (!identityId) return

    const channel = client.channel(CHANNEL_NAME, {
      config: {
        presence: { key: identityId },
        broadcast: { self: false },
      },
    })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'location' }, (message) =>
        handleLocation(message.payload as LocationPayload),
      )
      .on('broadcast', { event: 'sharing' }, (message) =>
        handleSharing(message.payload as SharingPayload),
      )
      .on('presence', { event: 'sync' }, () => handlePresenceSync())
      .on('presence', { event: 'join' }, () => handlePresenceSync())
      .on('presence', { event: 'leave' }, () => handlePresenceSync())

    setStatus('connecting')
    lastTrackRef.current = 0

    channel.subscribe((subscribeStatus) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        setStatus('connected')
        trackPresence(true)
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        setStatus('error')
      } else if (subscribeStatus === 'CLOSED') {
        setStatus('connecting')
      }
    })

    return () => {
      channelRef.current = null
      setFriends({})
      void client.removeChannel(channel)
    }
  }, [identityId, handleLocation, handleSharing, handlePresenceSync, trackPresence])

  // React to our own state changes: send the position or announce we stopped.
  useEffect(() => {
    if (status !== 'connected' || !identity) return

    if (!sharing) {
      safeSend('sharing', { id: identity.id, sharing: false } satisfies SharingPayload)
      trackPresence(true)
      return
    }

    if (coordinates && updatedAt) {
      safeSend(
        'location',
        {
          id: identity.id,
          name: identity.name,
          lat: coordinates.lat,
          lng: coordinates.lng,
          accuracy: coordinates.accuracy,
          updatedAt,
        } satisfies LocationPayload,
      )
      trackPresence()
    } else {
      // Sharing is on but we have no fix yet — let peers know we are online.
      trackPresence(true)
    }
  }, [status, identity, sharing, coordinates, updatedAt, safeSend, trackPresence])

  // Heartbeat: keeps the map correct for stationary users and late joiners.
  useEffect(() => {
    if (status !== 'connected' || !identityId) return
    const id = window.setInterval(() => publishCurrent(true), HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [status, identityId, publishCurrent])

  // Recovery + page lifecycle. A background tab is throttled, then may be
  // frozen, so we push the latest position on the way out (visibilitychange →
  // hidden, pagehide, freeze) and re-announce whenever we come back (visible,
  // focus, online, pageshow, resume). Supabase reconnects the socket on its own;
  // these calls make sure the freshest position reaches the server around those
  // transitions even when this tab is not the one in front.
  useEffect(() => {
    if (!identityId) return
    const republish = () => publishCurrent(true)
    // Flush when hidden and refresh when visible again — the same call is safe
    // either way and the socket may have dropped while we were away.
    const onVisibility = () => republish()

    window.addEventListener('online', republish)
    window.addEventListener('focus', republish)
    window.addEventListener('pageshow', republish)
    window.addEventListener('pagehide', republish)
    document.addEventListener('visibilitychange', onVisibility)

    // 'freeze'/'resume' are Page Lifecycle events, not part of the DOM lib's
    // event maps; use the base EventTarget surface so the names type-check.
    const lifecycle: EventTarget = document
    lifecycle.addEventListener('freeze', republish)
    lifecycle.addEventListener('resume', republish)

    return () => {
      window.removeEventListener('online', republish)
      window.removeEventListener('focus', republish)
      window.removeEventListener('pageshow', republish)
      window.removeEventListener('pagehide', republish)
      document.removeEventListener('visibilitychange', onVisibility)
      lifecycle.removeEventListener('freeze', republish)
      lifecycle.removeEventListener('resume', republish)
    }
  }, [identityId, publishCurrent])

  const friendList = useMemo(
    () => Object.values(friends).sort((a, b) => a.name.localeCompare(b.name)),
    [friends],
  )

  return { status, friends: friendList }
}
