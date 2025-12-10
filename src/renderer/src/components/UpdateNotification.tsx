import { useState, useEffect } from 'react'
import type { UpdateStatus } from '../../../preload/index.d'

export function UpdateNotification(): React.JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Get initial status
    window.api?.getUpdateStatus().then(setStatus)

    // Subscribe to status updates
    const unsubscribe = window.api?.onUpdateStatus((newStatus) => {
      setStatus(newStatus)
      // Reset dismissed state when a new update becomes available
      if (newStatus.status === 'available') {
        setDismissed(false)
      }
    })

    return () => unsubscribe?.()
  }, [])

  const handleDownload = async (): Promise<void> => {
    await window.api?.downloadUpdate()
  }

  const handleInstall = (): void => {
    window.api?.installUpdate()
  }

  const handleDismiss = (): void => {
    setDismissed(true)
  }

  // Don't show if dismissed or no relevant status
  if (dismissed || !status) return null
  if (status.status === 'not-available' || status.status === 'checking') return null
  if (status.status === 'error') return null

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-xl border border-neutral-200 dark:border-neutral-700 p-4 max-w-sm">
        {status.status === 'available' && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                  Update Available
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Version {status.version} is ready to download
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
              >
                <svg
                  className="w-4 h-4 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleDownload} className="flex-1 btn btn-primary btn-sm">
                Download
              </button>
              <button onClick={handleDismiss} className="btn btn-ghost btn-sm">
                Later
              </button>
            </div>
          </>
        )}

        {status.status === 'downloading' && (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                Downloading Update
              </h3>
              <div className="mt-2">
                <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${status.progress || 0}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {status.progress || 0}% complete
                </p>
              </div>
            </div>
          </div>
        )}

        {status.status === 'downloaded' && (
          <>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 dark:text-neutral-100">Update Ready</h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Restart the app to install version {status.version}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleInstall} className="flex-1 btn btn-primary btn-sm">
                Restart Now
              </button>
              <button onClick={handleDismiss} className="btn btn-ghost btn-sm">
                Later
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
