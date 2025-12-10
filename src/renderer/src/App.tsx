import { useState, useEffect } from 'react'
import { useMeetingStore } from './stores/meetingStore'
import { useMeetingSync } from './hooks/useMeetingSync'
import { useAudioCapture } from './hooks/useAudioCapture'
import { LiveSummary } from './components/LiveSummary'
import { LiveTranscription } from './components/LiveTranscription'
import { DecisionsList } from './components/DecisionsList'
import { ActionsList } from './components/ActionsList'
import { OpenQuestions } from './components/OpenQuestions'
import { TensionAlerts } from './components/TensionAlerts'
import { DirectResponse } from './components/DirectResponse'
import { Controls } from './components/Controls'
import { SettingsModal } from './components/SettingsModal'

function App(): React.JSX.Element {
  const status = useMeetingStore((state) => state.status)
  const startTime = useMeetingStore((state) => state.startTime)
  const liveSummary = useMeetingStore((state) => state.liveSummary)
  const decisions = useMeetingStore((state) => state.decisions)
  const actions = useMeetingStore((state) => state.actions)
  const openQuestions = useMeetingStore((state) => state.openQuestions)
  const loops = useMeetingStore((state) => state.loops)
  const contradictions = useMeetingStore((state) => state.contradictions)

  // Sync state from main process
  useMeetingSync()

  // Audio capture
  const { audioLevel, isCapturing, startCapture, stopCapture } = useAudioCapture()

  // Listen for audio level updates from main process
  const [mainAudioLevel, setMainAudioLevel] = useState(0)

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Track if we should show results after stopping
  const hasContent =
    liveSummary.length > 0 ||
    decisions.length > 0 ||
    actions.length > 0 ||
    openQuestions.length > 0 ||
    loops.length > 0 ||
    contradictions.length > 0

  // Show content during meeting OR after stop if there's content
  const showContent = status !== 'idle' || hasContent

  useEffect(() => {
    const unsubscribe = window.api?.onAudioLevel((level: number) => {
      setMainAudioLevel(level)
    })
    return () => unsubscribe?.()
  }, [])

  // Start/stop audio capture based on status
  // Keep capturing during 'processing' (Claude analysis) - only stop on 'idle' or 'paused'
  useEffect(() => {
    const shouldCapture = status === 'recording' || status === 'processing'
    if (shouldCapture && !isCapturing) {
      startCapture()
    } else if (!shouldCapture && isCapturing) {
      stopCapture()
    }
  }, [status, isCapturing, startCapture, stopCapture])

  const displayLevel = mainAudioLevel || audioLevel
  const isActive = status === 'recording' || status === 'processing'

  return (
    <div className="flex flex-col h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
      {/* Drag region with settings button */}
      <div className="h-10 drag-region flex-shrink-0 flex items-center justify-end px-4">
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="no-drag p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          title="Settings"
        >
          <svg
            className="w-5 h-5 text-neutral-500 dark:text-neutral-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        {showContent ? (
          <div className="h-full flex flex-col space-y-4">
            {/* Tensions/Alerts - Top priority, only show when detected */}
            <TensionAlerts />

            {/* Main content: Decisions & Actions - grows to fill space */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
              <DecisionsList />
              <ActionsList />
            </div>

            {/* Secondary: Open Questions */}
            <OpenQuestions />

            {/* Context: Summary + Transcription collapsed */}
            <details className="group flex-shrink-0">
              <summary className="cursor-pointer text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300 flex items-center gap-2 py-2">
                <svg
                  className="w-4 h-4 transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                Context & Transcription
              </summary>
              <div className="space-y-4 pt-2">
                <LiveSummary />
                <LiveTranscription />
              </div>
            </details>
          </div>
        ) : (
          <EmptyState />
        )}

        {/* Direct Response Overlay */}
        <DirectResponse />
      </main>

      {/* Footer Controls - only show when meeting is active or has content */}
      {showContent && (
        <footer className="px-6 py-4 border-t border-neutral-200 dark:border-neutral-800">
          <Controls
            status={status}
            startTime={startTime}
            audioLevel={displayLevel}
            isActive={isActive}
          />
        </footer>
      )}
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  const start = useMeetingStore((state) => state.start)

  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <div className="w-20 h-20 mb-6 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-medium mb-2">Ready to start</h2>
      <p className="text-neutral-500 dark:text-neutral-400 max-w-md mb-6">
        Capture and analyze your meeting in real-time.
      </p>
      <button onClick={start} className="btn btn-primary btn-lg">
        <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        Start Meeting
      </button>
    </div>
  )
}

export default App
