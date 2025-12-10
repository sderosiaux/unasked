import { BrowserWindow, ipcMain } from 'electron'
import { EventEmitter } from 'events'
import { getAudioCaptureService, AudioCaptureService } from './AudioCaptureService'
import { getDeepgramService, DeepgramService, TranscriptionResult } from './DeepgramService'
import { getClaudeService, ClaudeService, MeetingAnalysis } from './ClaudeService'
import { getSecureStorage } from './SecureStorage'

export type MeetingStatus = 'idle' | 'recording' | 'paused' | 'processing'

export interface MeetingState {
  status: MeetingStatus
  startTime: number | null
  liveSummary: string[]
  decisions: MeetingAnalysis['decisions']
  actions: MeetingAnalysis['actions']
  openQuestions: MeetingAnalysis['openQuestions']
  loops: MeetingAnalysis['loops']
  contradictions: MeetingAnalysis['contradictions']
  implicitAssumptions: string[]
  ambiguities: MeetingAnalysis['ambiguities']
  lastDirectResponse: string | null
  detectedLanguage: 'en' | 'fr' | 'mixed'
  lastUpdateTime: number
}

/**
 * MeetingStateManager orchestrates the full pipeline:
 * Audio -> Deepgram -> Claude -> UI
 */
export class MeetingStateManager extends EventEmitter {
  private audioService: AudioCaptureService
  private deepgramService: DeepgramService
  private claudeService: ClaudeService
  private mainWindow: BrowserWindow | null = null

  private state: MeetingState = this.getInitialState()
  private analysisInterval: NodeJS.Timeout | null = null
  private readonly ANALYSIS_INTERVAL = 8000 // Analyze every 8 seconds

  constructor() {
    super()
    this.audioService = getAudioCaptureService()
    this.deepgramService = getDeepgramService()
    this.claudeService = getClaudeService()

    this.setupEventHandlers()
    this.setupIPC()
  }

  private getInitialState(): MeetingState {
    return {
      status: 'idle',
      startTime: null,
      liveSummary: [],
      decisions: [],
      actions: [],
      openQuestions: [],
      loops: [],
      contradictions: [],
      implicitAssumptions: [],
      ambiguities: [],
      lastDirectResponse: null,
      detectedLanguage: 'en',
      lastUpdateTime: 0
    }
  }

  private setupEventHandlers(): void {
    // Audio level updates
    this.audioService.on('audioLevel', (level: number) => {
      this.sendToRenderer('audio:level', level)
    })

    // Stream audio directly to Deepgram (real-time transcription)
    this.audioService.on('audioData', (samples: Float32Array) => {
      if (this.deepgramService.hasActiveSession()) {
        this.deepgramService.sendFloat32Audio(samples)
      }
    })

    // Deepgram transcription events
    this.deepgramService.on('transcription', (result: TranscriptionResult) => {
      this.handleTranscription(result)
    })

    this.deepgramService.on('finalTranscription', (result: TranscriptionResult) => {
      // Final transcriptions are more reliable - send to Claude
      this.claudeService.addTranscription(result.text)
    })

    this.deepgramService.on('error', (error: Error) => {
      console.error('Deepgram error:', error)
      this.sendToRenderer('error', { message: 'Transcription failed', error: error.message })
    })

    // Claude analysis complete
    this.claudeService.on('analysis', (analysis: MeetingAnalysis) => {
      this.mergeAnalysis(analysis)
    })

    // Claude errors
    this.claudeService.on('error', (error: Error) => {
      console.error('Claude analysis error:', error)
      this.sendToRenderer('error', { message: 'Analysis failed', error: error.message })
    })
  }

  private setupIPC(): void {
    ipcMain.handle('meeting:start', async () => {
      await this.start()
    })

    ipcMain.handle('meeting:pause', () => {
      this.pause()
    })

    ipcMain.handle('meeting:resume', () => {
      this.resume()
    })

    ipcMain.handle('meeting:reset', () => {
      this.reset()
    })

    ipcMain.handle('meeting:getState', () => {
      return this.state
    })
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  async initialize(): Promise<void> {
    // Get API keys from secure storage (falls back to env vars)
    const secureStorage = getSecureStorage()
    const settings = secureStorage.getSettings()

    // Initialize Deepgram
    this.deepgramService.initialize(settings.deepgramApiKey)

    // Initialize Claude
    this.claudeService.initialize(settings.anthropicApiKey)

    console.log('MeetingStateManager initialized')
  }

  async start(): Promise<void> {
    // Check microphone permission
    const permission = await this.audioService.checkMicrophonePermission()

    if (permission === 'not-determined') {
      const granted = await this.audioService.requestMicrophonePermission()
      if (!granted) {
        this.sendToRenderer('error', { message: 'Microphone permission denied' })
        return
      }
    } else if (permission === 'denied') {
      this.sendToRenderer('error', {
        message: 'Microphone permission denied. Please enable in System Preferences.'
      })
      return
    }

    this.state = {
      ...this.getInitialState(),
      status: 'recording',
      startTime: Date.now()
    }

    // Start Deepgram session for real-time transcription
    const sessionStarted = await this.deepgramService.startSession()
    if (!sessionStarted) {
      this.sendToRenderer('error', { message: 'Failed to start transcription session' })
      this.state.status = 'idle'
      this.broadcastState()
      return
    }

    this.audioService.start()

    // Start periodic analysis
    this.analysisInterval = setInterval(() => {
      this.triggerAnalysis()
    }, this.ANALYSIS_INTERVAL)

    this.broadcastState()
  }

  pause(): void {
    this.state.status = 'paused'
    this.audioService.pause()

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval)
      this.analysisInterval = null
    }

    this.broadcastState()
  }

  resume(): void {
    this.state.status = 'recording'
    this.audioService.resume()

    this.analysisInterval = setInterval(() => {
      this.triggerAnalysis()
    }, this.ANALYSIS_INTERVAL)

    this.broadcastState()
  }

  reset(): void {
    this.audioService.stop()
    this.deepgramService.endSession()
    this.claudeService.reset()

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval)
      this.analysisInterval = null
    }

    this.state = this.getInitialState()
    this.broadcastState()
  }

  private handleTranscription(transcription: TranscriptionResult): void {
    // Update detected language
    if (transcription.language) {
      if (this.state.detectedLanguage === 'en' && transcription.language === 'fr') {
        this.state.detectedLanguage = 'mixed'
      } else if (this.state.detectedLanguage === 'fr' && transcription.language === 'en') {
        this.state.detectedLanguage = 'mixed'
      } else if (this.state.detectedLanguage !== 'mixed') {
        this.state.detectedLanguage = transcription.language
      }
    }

    // Send transcription update to renderer (for live display)
    this.sendToRenderer('transcription:update', transcription)
  }

  private async triggerAnalysis(): Promise<void> {
    if (this.state.status !== 'recording') return

    this.state.status = 'processing'
    this.broadcastState()

    try {
      await this.claudeService.analyze()
    } finally {
      if (this.state.status === 'processing') {
        this.state.status = 'recording'
        this.broadcastState()
      }
    }
  }

  private mergeAnalysis(analysis: MeetingAnalysis): void {
    // Update live summary (replace)
    this.state.liveSummary = analysis.liveSummary

    // Merge decisions (avoid duplicates)
    for (const decision of analysis.decisions) {
      const exists = this.state.decisions.some(
        (d) => d.text.toLowerCase() === decision.text.toLowerCase()
      )
      if (!exists) {
        this.state.decisions.push(decision)
      }
    }

    // Merge actions (avoid duplicates)
    for (const action of analysis.actions) {
      const exists = this.state.actions.some(
        (a) => a.text.toLowerCase() === action.text.toLowerCase()
      )
      if (!exists) {
        this.state.actions.push(action)
      }
    }

    // Update open questions (replace with latest)
    this.state.openQuestions = analysis.openQuestions

    // Update loops
    this.state.loops = analysis.loops

    // Update contradictions
    this.state.contradictions = analysis.contradictions

    // Update assumptions
    this.state.implicitAssumptions = analysis.implicitAssumptions

    // Update ambiguities
    this.state.ambiguities = analysis.ambiguities

    // Update direct response
    if (analysis.directResponse) {
      this.state.lastDirectResponse = analysis.directResponse
    }

    this.state.lastUpdateTime = Date.now()
    this.broadcastState()
  }

  private broadcastState(): void {
    this.sendToRenderer('meeting:stateUpdate', this.state)
    this.emit('stateUpdate', this.state)
  }

  getState(): MeetingState {
    return { ...this.state }
  }
}

// Singleton instance
let instance: MeetingStateManager | null = null

export function getMeetingStateManager(): MeetingStateManager {
  if (!instance) {
    instance = new MeetingStateManager()
  }
  return instance
}
