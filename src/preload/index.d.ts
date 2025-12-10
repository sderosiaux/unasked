import { ElectronAPI } from '@electron-toolkit/preload'

// Meeting history types
export interface MeetingListItem {
  id: string
  title: string
  startTime: number
  duration: number
  summaryPreview: string
  decisionsCount: number
  actionsCount: number
}

export interface SavedMeeting {
  id: string
  title: string
  startTime: number
  endTime: number
  duration: number
  liveSummary: string[]
  decisions: Array<{
    id: string
    text: string
    owner?: string
    timestamp: number
    priority: 1 | 2 | 3
  }>
  actions: Array<{
    id: string
    text: string
    owner?: string
    deadline?: string
    status: 'identified' | 'needs-clarification'
    timestamp: number
    priority: 1 | 2 | 3
  }>
  openQuestions: Array<{ id: string; text: string; priority: 1 | 2 | 3 }>
  loops: Array<{
    id: string
    topic: string
    occurrences: number
    suggestion: string
    firstDetected: number
  }>
  contradictions: Array<{
    id: string
    earlier: string
    later: string
    topic: string
    suggestion: string
  }>
  implicitAssumptions: string[]
  ambiguities: Array<{ id: string; point: string; clarifyingQuestion: string }>
  detectedLanguage: 'en' | 'fr' | 'mixed'
  transcript: string
}

export interface SearchResult {
  meeting: MeetingListItem
  matchType: 'title' | 'summary' | 'decision' | 'action' | 'transcript'
  matchText: string
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  progress?: number
  error?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      startMeeting: () => Promise<void>
      pauseMeeting: () => Promise<void>
      resumeMeeting: () => Promise<void>
      stopMeeting: () => Promise<void>
      resetMeeting: () => Promise<void>
      getAudioDevices: () => Promise<{ deviceId: string; label: string; kind: string }[]>
      setAudioDevice: (deviceId: string) => Promise<void>
      onMeetingStateUpdate: (callback: (state: unknown) => void) => () => void
      onTranscriptionUpdate: (callback: (chunk: unknown) => void) => () => void
      onAudioLevel: (callback: (level: number) => void) => () => void
      onError: (callback: (error: { message: string; error?: string }) => void) => () => void
      sendAudioData: (data: { samples: number[]; timestamp: number }) => void
      // Settings
      getSettings: () => Promise<{ anthropicApiKey?: string; deepgramApiKey?: string }>
      saveSettings: (settings: {
        anthropicApiKey?: string
        deepgramApiKey?: string
      }) => Promise<{ success: boolean }>
      hasApiKeys: () => Promise<{ anthropic: boolean; deepgram: boolean }>
      onSettingsOpen: (callback: (data: { message: string }) => void) => () => void
      // Meeting history
      listMeetings: () => Promise<MeetingListItem[]>
      getMeeting: (id: string) => Promise<SavedMeeting | null>
      searchMeetings: (query: string) => Promise<SearchResult[]>
      deleteMeeting: (id: string) => Promise<boolean>
      updateMeetingTitle: (id: string, title: string) => Promise<boolean>
      onMeetingSaved: (callback: (data: { id: string; title: string }) => void) => () => void
      // Auto-updater
      checkForUpdates: () => Promise<UpdateStatus>
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      getUpdateStatus: () => Promise<UpdateStatus>
      onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
    }
  }
}
