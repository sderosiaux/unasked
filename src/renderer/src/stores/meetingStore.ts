import { create } from 'zustand'

export type MeetingStatus = 'idle' | 'recording' | 'paused' | 'processing'

export interface Decision {
  id: string
  text: string
  owner?: string
  timestamp: number
  impact?: string
  priority: 1 | 2 | 3 // 1=high, 2=medium, 3=low
}

export interface Action {
  id: string
  text: string
  owner?: string
  deadline?: string
  status: 'identified' | 'needs-clarification'
  timestamp: number
  priority: 1 | 2 | 3 // 1=high, 2=medium, 3=low
}

export interface Loop {
  id: string
  topic: string
  occurrences: number
  suggestion: string
  firstDetected: number
}

export interface Contradiction {
  id: string
  earlier: string
  later: string
  topic: string
  suggestion: string
}

export interface Ambiguity {
  id: string
  point: string
  clarifyingQuestion: string
}

export interface OpenQuestion {
  id: string
  text: string
  priority: 1 | 2 | 3
}

export interface TranscriptionChunk {
  text: string
  timestamp: number
  duration: number
  confidence: number
  language: 'en' | 'fr'
  speaker?: string
}

export interface MeetingState {
  // Status
  status: MeetingStatus
  startTime: number | null

  // Transcription
  transcriptionBuffer: TranscriptionChunk[]
  fullTranscript: string

  // Extracted entities
  liveSummary: string[]
  decisions: Decision[]
  actions: Action[]
  openQuestions: OpenQuestion[]

  // Tension detection
  loops: Loop[]
  contradictions: Contradiction[]

  // Assumptions
  implicitAssumptions: string[]
  ambiguities: Ambiguity[]

  // Direct Q&A
  lastDirectResponse: string | null

  // Metadata
  detectedLanguage: 'en' | 'fr' | 'mixed'
  lastUpdateTime: number

  // Actions
  start: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  addTranscriptionChunk: (chunk: TranscriptionChunk) => void
  updateAnalysis: (analysis: Partial<MeetingState>) => void
  clearDirectResponse: () => void
}

const initialState = {
  status: 'idle' as MeetingStatus,
  startTime: null,
  transcriptionBuffer: [],
  fullTranscript: '',
  liveSummary: [],
  decisions: [],
  actions: [],
  openQuestions: [],
  loops: [],
  contradictions: [],
  implicitAssumptions: [],
  ambiguities: [],
  lastDirectResponse: null,
  detectedLanguage: 'en' as const,
  lastUpdateTime: 0
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  ...initialState,

  start: () => {
    // Clear previous content and start fresh
    set({
      ...initialState,
      status: 'recording',
      startTime: Date.now()
    })
    // Notify main process
    window.api?.startMeeting()
  },

  pause: () => {
    set({ status: 'paused' })
    window.api?.pauseMeeting()
  },

  resume: () => {
    set({ status: 'recording' })
    window.api?.resumeMeeting()
  },

  stop: () => {
    // Stop recording but keep the content (just set local status, backend will handle the rest)
    window.api?.stopMeeting()
  },

  addTranscriptionChunk: (chunk: TranscriptionChunk) => {
    const state = get()
    set({
      transcriptionBuffer: [...state.transcriptionBuffer, chunk],
      fullTranscript: state.fullTranscript + ' ' + chunk.text,
      lastUpdateTime: Date.now()
    })
  },

  updateAnalysis: (analysis: Partial<MeetingState>) => {
    set({
      ...analysis,
      lastUpdateTime: Date.now()
    })
  },

  clearDirectResponse: () => {
    set({ lastDirectResponse: null })
  }
}))
