import { useState, useEffect, useCallback } from 'react'
import type { MeetingListItem, SavedMeeting, SearchResult } from '../../../preload/index.d'

interface MeetingHistoryProps {
  isOpen: boolean
  onClose: () => void
  onSelectMeeting: (meeting: SavedMeeting) => void
  isRecording: boolean
}

export function MeetingHistory({
  isOpen,
  onClose,
  onSelectMeeting,
  isRecording
}: MeetingHistoryProps): React.JSX.Element | null {
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null)
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadMeetings = useCallback(async () => {
    try {
      const list = await window.api.listMeetings()
      setMeetings(list)
    } catch (error) {
      console.error('Failed to load meetings:', error)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadMeetings()
    }
  }, [isOpen, loadMeetings])

  // Listen for new meetings saved
  useEffect(() => {
    const unsubscribe = window.api.onMeetingSaved(() => {
      loadMeetings()
    })
    return unsubscribe
  }, [loadMeetings])

  const handleSearch = async (query: string): Promise<void> => {
    setSearchQuery(query)
    if (query.trim().length < 2) {
      setSearchResults(null)
      return
    }

    try {
      const results = await window.api.searchMeetings(query)
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  const handleSelectMeeting = async (id: string): Promise<void> => {
    if (isRecording) return // Don't allow switching while recording

    setIsLoading(true)
    setSelectedMeetingId(id)

    try {
      const meeting = await window.api.getMeeting(id)
      if (meeting) {
        onSelectMeeting(meeting)
        onClose()
      }
    } catch (error) {
      console.error('Failed to load meeting:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteMeeting = async (e: React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation()
    if (!confirm('Delete this meeting from history?')) return

    try {
      await window.api.deleteMeeting(id)
      await loadMeetings()
      if (searchResults) {
        setSearchResults(searchResults.filter((r) => r.meeting.id !== id))
      }
    } catch (error) {
      console.error('Failed to delete meeting:', error)
    }
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (minutes: number): string => {
    if (minutes < 1) return '<1 min'
    if (minutes < 60) return `${Math.round(minutes)} min`
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }

  if (!isOpen) return null

  const displayList = searchResults ? searchResults.map((r) => r.meeting) : meetings

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sidebar */}
      <div className="relative w-96 max-w-[90vw] bg-neutral-900 border-r border-neutral-800 flex flex-col h-full animate-slide-in">
        {/* Header */}
        <div className="p-4 border-b border-neutral-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Meeting History</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <CloseIcon className="w-5 h-5 text-neutral-400" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>

        {/* Meeting List */}
        <div className="flex-1 overflow-y-auto">
          {isRecording && (
            <div className="p-4 bg-yellow-500/10 border-b border-yellow-500/20">
              <p className="text-sm text-yellow-500">Stop the current meeting to view history</p>
            </div>
          )}

          {displayList.length === 0 ? (
            <div className="p-8 text-center">
              <HistoryIcon className="w-12 h-12 mx-auto mb-3 text-neutral-600" />
              <p className="text-neutral-400 text-sm">
                {searchQuery ? 'No meetings match your search' : 'No meetings yet'}
              </p>
              <p className="text-neutral-500 text-xs mt-1">
                {searchQuery ? 'Try different keywords' : 'Your meetings will appear here'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              {displayList.map((meeting) => {
                const searchResult = searchResults?.find((r) => r.meeting.id === meeting.id)
                return (
                  <button
                    key={meeting.id}
                    onClick={() => handleSelectMeeting(meeting.id)}
                    disabled={isRecording || isLoading}
                    className={`w-full p-4 text-left hover:bg-neutral-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      selectedMeetingId === meeting.id && isLoading ? 'bg-neutral-800/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-white truncate">{meeting.title}</h3>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {formatDate(meeting.startTime)} · {formatDuration(meeting.duration)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteMeeting(e, meeting.id)}
                        className="p-1 rounded hover:bg-neutral-700 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete meeting"
                      >
                        <TrashIcon className="w-4 h-4 text-neutral-500 hover:text-red-400" />
                      </button>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                      {meeting.decisionsCount > 0 && (
                        <span className="flex items-center gap-1">
                          <DecisionIcon className="w-3.5 h-3.5" />
                          {meeting.decisionsCount}
                        </span>
                      )}
                      {meeting.actionsCount > 0 && (
                        <span className="flex items-center gap-1">
                          <ActionIcon className="w-3.5 h-3.5" />
                          {meeting.actionsCount}
                        </span>
                      )}
                    </div>

                    {/* Search match highlight */}
                    {searchResult && (
                      <div className="mt-2 p-2 bg-violet-500/10 rounded text-xs">
                        <span className="text-violet-400 font-medium">
                          {searchResult.matchType}:
                        </span>{' '}
                        <span className="text-neutral-300">{searchResult.matchText}</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Icons
function CloseIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  )
}

function HistoryIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  )
}

function DecisionIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ActionIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
      />
    </svg>
  )
}
