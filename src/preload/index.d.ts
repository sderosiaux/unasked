import { ElectronAPI } from '@electron-toolkit/preload'

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
    }
  }
}
