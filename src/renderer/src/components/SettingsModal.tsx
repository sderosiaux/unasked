import { useState, useEffect } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface Settings {
  anthropicApiKey: string
  deepgramApiKey: string
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps): React.JSX.Element | null {
  const [settings, setSettings] = useState<Settings>({
    anthropicApiKey: '',
    deepgramApiKey: ''
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      // Load settings from secure storage via IPC
      setLoading(true)
      window.api
        ?.getSettings()
        .then((stored) => {
          setSettings({
            anthropicApiKey: stored?.anthropicApiKey || '',
            deepgramApiKey: stored?.deepgramApiKey || ''
          })
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [isOpen])

  const handleSave = async (): Promise<void> => {
    try {
      await window.api?.saveSettings(settings)
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 1000)
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-neutral-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5 text-neutral-500"
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

        {/* Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* API Keys Section */}
              <div>
                <h3 className="text-sm font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-4">
                  API Keys
                </h3>

                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="anthropic-key"
                      className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Anthropic API Key
                    </label>
                    <input
                      id="anthropic-key"
                      type="password"
                      value={settings.anthropicApiKey}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, anthropicApiKey: e.target.value }))
                      }
                      placeholder="sk-ant-..."
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Required for AI analysis.{' '}
                      <a
                        href="https://console.anthropic.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        Get an API key
                      </a>
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="deepgram-key"
                      className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
                    >
                      Deepgram API Key
                    </label>
                    <input
                      id="deepgram-key"
                      type="password"
                      value={settings.deepgramApiKey}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, deepgramApiKey: e.target.value }))
                      }
                      placeholder="Enter your Deepgram API key"
                      className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Required for transcription.{' '}
                      <a
                        href="https://console.deepgram.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        Get an API key
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {/* Info Notice */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
                <p className="text-xs text-emerald-800 dark:text-emerald-200">
                  <strong>Secure:</strong> Your API keys are encrypted and stored locally using your
                  system keychain. They are never sent to any server except the respective API
                  providers.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
