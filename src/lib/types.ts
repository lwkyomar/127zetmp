export interface Coordinates {
  lat: number
  lng: number
  accuracy: number
}

export interface Friend {
  id: string
  name: string
  lat: number
  lng: number
  accuracy: number
  /** Epoch milliseconds of the sender's last position fix. */
  updatedAt: number
}

/** Payload broadcast over the Supabase realtime channel. */
export interface LocationPayload {
  id: string
  name: string
  lat: number
  lng: number
  accuracy: number
  updatedAt: number
}

/** Payload used to announce that sharing was turned off. */
export interface SharingPayload {
  id: string
  sharing: boolean
}

/** Shape of the state each client keeps in Supabase Presence. */
export interface PresenceState {
  id: string
  name: string
  sharing: boolean
  lat: number | null
  lng: number | null
  accuracy: number | null
  updatedAt: number | null
}

export interface Identity {
  id: string
  name: string
}
