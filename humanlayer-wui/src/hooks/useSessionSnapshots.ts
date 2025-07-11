import { useState, useEffect } from 'react'
import { daemonClient } from '@/lib/daemon/client'
import type { FileSnapshot } from '@/lib/daemon/types'

interface SnapshotCache {
  [filePath: string]: FileSnapshot
}

export function useSessionSnapshots(sessionId: string | undefined) {
  const [snapshots, setSnapshots] = useState<SnapshotCache>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const fetchSnapshots = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await daemonClient.getSessionSnapshots(sessionId)

        // Build cache indexed by file path
        const cache: SnapshotCache = {}
        response.snapshots.forEach(snapshot => {
          // Keep most recent snapshot per file
          if (
            !cache[snapshot.file_path] ||
            new Date(snapshot.created_at) > new Date(cache[snapshot.file_path].created_at)
          ) {
            cache[snapshot.file_path] = snapshot
          }
        })

        setSnapshots(cache)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch snapshots'
        console.error('[useSessionSnapshots] Error fetching snapshots:', err)
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchSnapshots()
  }, [sessionId])

  const getSnapshot = (filePath: string): FileSnapshot | undefined => {
    return snapshots[filePath]
  }

  return { snapshots, getSnapshot, loading, error }
}
