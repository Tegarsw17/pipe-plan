import { get, set, del } from 'idb-keyval'
import type { Project } from './types'

const KEY = 'pipe-plan:last-session'

export interface Session {
  project: Project
  image: Blob | null
}

export async function autosave(s: Session): Promise<void> {
  try {
    await set(KEY, s)
  } catch {
    /* penyimpanan penuh atau diblokir: abaikan, simpan manual tetap tersedia */
  }
}

export async function restoreSession(): Promise<Session | null> {
  try {
    return (await get<Session>(KEY)) ?? null
  } catch {
    return null
  }
}

export const clearSession = (): Promise<void> => del(KEY).catch(() => undefined)
