import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // Meeting control
  startMeeting: (): Promise<void> => ipcRenderer.invoke('meeting:start'),
  pauseMeeting: (): Promise<void> => ipcRenderer.invoke('meeting:pause'),
  resumeMeeting: (): Promise<void> => ipcRenderer.invoke('meeting:resume'),
  stopMeeting: (): Promise<void> => ipcRenderer.invoke('meeting:stop'),
  resetMeeting: (): Promise<void> => ipcRenderer.invoke('meeting:reset'),

  // Audio control
  getAudioDevices: (): Promise<{ deviceId: string; label: string; kind: string }[]> =>
    ipcRenderer.invoke('audio:getDevices'),
  setAudioDevice: (deviceId: string): Promise<void> =>
    ipcRenderer.invoke('audio:setDevice', deviceId),

  // State subscriptions
  onMeetingStateUpdate: (callback: (state: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown): void => {
      callback(state)
    }
    ipcRenderer.on('meeting:stateUpdate', handler)
    return () => {
      ipcRenderer.removeListener('meeting:stateUpdate', handler)
    }
  },

  onTranscriptionUpdate: (callback: (chunk: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: unknown): void => {
      callback(chunk)
    }
    ipcRenderer.on('transcription:update', handler)
    return () => {
      ipcRenderer.removeListener('transcription:update', handler)
    }
  },

  onAudioLevel: (callback: (level: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, level: number): void => {
      callback(level)
    }
    ipcRenderer.on('audio:level', handler)
    return () => {
      ipcRenderer.removeListener('audio:level', handler)
    }
  },

  onError: (callback: (error: { message: string; error?: string }) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { message: string; error?: string }
    ): void => {
      callback(error)
    }
    ipcRenderer.on('error', handler)
    return () => {
      ipcRenderer.removeListener('error', handler)
    }
  },

  // Send audio data from renderer to main process
  sendAudioData: (data: { samples: number[]; timestamp: number }): void => {
    ipcRenderer.send('audio:data', data)
  },

  // Settings
  getSettings: (): Promise<{ anthropicApiKey?: string; deepgramApiKey?: string }> =>
    ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: {
    anthropicApiKey?: string
    deepgramApiKey?: string
  }): Promise<{ success: boolean }> => ipcRenderer.invoke('settings:save', settings),
  hasApiKeys: (): Promise<{ anthropic: boolean; deepgram: boolean }> =>
    ipcRenderer.invoke('settings:hasApiKeys'),

  onSettingsOpen: (callback: (data: { message: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { message: string }): void => {
      callback(data)
    }
    ipcRenderer.on('settings:open', handler)
    return () => {
      ipcRenderer.removeListener('settings:open', handler)
    }
  },

  // Meeting history
  listMeetings: (): Promise<MeetingListItem[]> => ipcRenderer.invoke('history:list'),
  getMeeting: (id: string): Promise<SavedMeeting | null> => ipcRenderer.invoke('history:get', id),
  searchMeetings: (query: string): Promise<SearchResult[]> =>
    ipcRenderer.invoke('history:search', query),
  deleteMeeting: (id: string): Promise<boolean> => ipcRenderer.invoke('history:delete', id),
  updateMeetingTitle: (id: string, title: string): Promise<boolean> =>
    ipcRenderer.invoke('history:updateTitle', id, title),

  onMeetingSaved: (callback: (data: { id: string; title: string }) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { id: string; title: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on('meeting:saved', handler)
    return () => {
      ipcRenderer.removeListener('meeting:saved', handler)
    }
  }
}

// Type definitions for meeting history (matching MeetingStorageService)
interface MeetingListItem {
  id: string
  title: string
  startTime: number
  duration: number
  summaryPreview: string
  decisionsCount: number
  actionsCount: number
}

interface SavedMeeting {
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

interface SearchResult {
  meeting: MeetingListItem
  matchType: 'title' | 'summary' | 'decision' | 'action' | 'transcript'
  matchText: string
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.electron = electronAPI
  // @ts-expect-error (define in dts)
  window.api = api
}
