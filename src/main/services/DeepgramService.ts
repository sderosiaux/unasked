import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk'
import { EventEmitter } from 'events'

export interface TranscriptionResult {
  text: string
  timestamp: number
  duration: number
  confidence: number
  language: 'en' | 'fr'
  isFinal: boolean
  speaker?: number
}

export interface DeepgramConfig {
  model: string
  language: string
  punctuate: boolean
  interimResults: boolean
  utteranceEndMs: number
  vadEvents: boolean
}

/**
 * DeepgramService handles real-time speech-to-text transcription
 * using Deepgram's WebSocket API.
 */
export class DeepgramService extends EventEmitter {
  private client: ReturnType<typeof createClient> | null = null
  private connection: LiveClient | null = null
  private isReady = false
  private config: DeepgramConfig
  private keepAliveInterval: NodeJS.Timeout | null = null

  constructor(config: Partial<DeepgramConfig> = {}) {
    super()
    this.config = {
      model: config.model || 'nova-2',
      language: config.language || 'fr', // French by default
      punctuate: config.punctuate ?? true,
      interimResults: config.interimResults ?? true,
      utteranceEndMs: config.utteranceEndMs || 1500, // More time for utterance end
      vadEvents: config.vadEvents ?? true
    }
  }

  /**
   * Initialize the Deepgram client with API key.
   */
  initialize(apiKey?: string): boolean {
    const key = apiKey || process.env.DEEPGRAM_API_KEY

    if (!key) {
      console.warn('DEEPGRAM_API_KEY not set - transcription will be disabled')
      this.emit('warning', 'Deepgram API key not configured')
      return false
    }

    this.client = createClient(key)
    this.isReady = true
    this.emit('ready')
    return true
  }

  /**
   * Start a live transcription session.
   */
  async startSession(): Promise<boolean> {
    if (!this.client) {
      console.error('Deepgram client not initialized')
      return false
    }

    try {
      this.connection = this.client.listen.live({
        model: this.config.model,
        language: this.config.language,
        punctuate: this.config.punctuate,
        interim_results: this.config.interimResults,
        utterance_end_ms: this.config.utteranceEndMs,
        vad_events: this.config.vadEvents,
        smart_format: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1
      })

      this.setupEventHandlers()

      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 10000)

        this.connection!.on(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timeout)
          console.log('Deepgram connection opened')
          resolve()
        })

        this.connection!.on(LiveTranscriptionEvents.Error, (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      // Start keepalive to prevent connection timeout
      this.keepAliveInterval = setInterval(() => {
        if (this.connection) {
          try {
            this.connection.keepAlive()
          } catch (e) {
            console.warn('Keepalive failed:', e)
          }
        }
      }, 5000) // Send keepalive every 5 seconds

      this.emit('sessionStarted')
      return true
    } catch (error) {
      console.error('Failed to start Deepgram session:', error)
      this.emit('error', error)
      return false
    }
  }

  private setupEventHandlers(): void {
    if (!this.connection) return

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives?.[0]

      // Log all transcript events for debugging
      if (transcript) {
        console.log(
          `[Deepgram] Transcript: "${transcript.transcript}" (final: ${data.is_final}, confidence: ${transcript.confidence?.toFixed(2)})`
        )
      }

      if (transcript && transcript.transcript) {
        const result: TranscriptionResult = {
          text: transcript.transcript,
          timestamp: Date.now(),
          duration: data.duration || 0,
          confidence: transcript.confidence || 0,
          language: this.detectLanguage(transcript.transcript),
          isFinal: data.is_final || false,
          speaker: data.channel?.alternatives?.[0]?.words?.[0]?.speaker
        }

        this.emit('transcription', result)

        // Emit final transcriptions separately for easier handling
        if (result.isFinal) {
          this.emit('finalTranscription', result)
        }
      }
    })

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.emit('utteranceEnd')
    })

    this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
      this.emit('speechStarted')
    })

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed')
      this.emit('sessionEnded')
    })

    this.connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('Deepgram error:', error)
      this.emit('error', error)
    })
  }

  /**
   * Simple language detection based on common French words.
   */
  private detectLanguage(text: string): 'en' | 'fr' {
    const frenchIndicators = [
      'je',
      'tu',
      'il',
      'elle',
      'nous',
      'vous',
      'ils',
      'elles',
      'le',
      'la',
      'les',
      'un',
      'une',
      'des',
      'est',
      'sont',
      'être',
      'avoir',
      'fait',
      'faire',
      'que',
      'qui',
      'quoi',
      'comment',
      'pourquoi',
      'quand',
      'avec',
      'pour',
      'dans',
      'sur',
      'mais',
      'donc',
      'car',
      "c'est",
      "n'est",
      "d'accord",
      'oui',
      'non',
      'merci'
    ]

    const lowerText = text.toLowerCase()
    const words = lowerText.split(/\s+/)

    let frenchScore = 0
    for (const word of words) {
      if (frenchIndicators.includes(word)) {
        frenchScore++
      }
    }

    // If more than 20% of words are French indicators, consider it French
    return frenchScore / words.length > 0.2 ? 'fr' : 'en'
  }

  /**
   * Send audio data to Deepgram for transcription.
   * @param audioData - Raw audio data (Int16Array or Buffer)
   */
  sendAudio(audioData: Int16Array | Buffer | ArrayBuffer): void {
    if (!this.connection) {
      console.warn('No active Deepgram connection')
      return
    }

    try {
      // Convert to ArrayBuffer for Deepgram
      let buffer: ArrayBuffer
      if (audioData instanceof Int16Array) {
        buffer = audioData.buffer as ArrayBuffer
      } else if (Buffer.isBuffer(audioData)) {
        // Convert Node.js Buffer to ArrayBuffer
        const arrayBuffer = new ArrayBuffer(audioData.length)
        const view = new Uint8Array(arrayBuffer)
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData[i]
        }
        buffer = arrayBuffer
      } else {
        buffer = audioData
      }
      this.connection.send(buffer)
    } catch (error) {
      console.error('Error sending audio to Deepgram:', error)
    }
  }

  private audioChunksSent = 0

  /**
   * Send audio data from Float32Array (Web Audio API format).
   * Converts to Int16 PCM format expected by Deepgram.
   */
  sendFloat32Audio(samples: Float32Array): void {
    // Convert Float32Array to Int16Array
    const int16 = new Int16Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }

    this.audioChunksSent++
    if (this.audioChunksSent <= 5) {
      const maxInt16 = Math.max(...Array.from(int16).map(Math.abs))
      console.log(
        `[Deepgram] Sending chunk ${this.audioChunksSent}: ${int16.length} samples, max int16: ${maxInt16}`
      )
    }

    this.sendAudio(int16)
  }

  /**
   * End the current transcription session.
   */
  endSession(): void {
    // Clear keepalive
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }

    if (this.connection) {
      try {
        this.connection.finish()
      } catch (error) {
        console.error('Error closing Deepgram connection:', error)
      }
      this.connection = null
    }

    this.audioChunksSent = 0
  }

  /**
   * Check if the service is ready.
   */
  isInitialized(): boolean {
    return this.isReady
  }

  /**
   * Check if there's an active session.
   */
  hasActiveSession(): boolean {
    return this.connection !== null
  }

  getConfig(): DeepgramConfig {
    return { ...this.config }
  }
}

// Singleton instance
let instance: DeepgramService | null = null

export function getDeepgramService(config?: Partial<DeepgramConfig>): DeepgramService {
  if (!instance) {
    instance = new DeepgramService(config)
  }
  return instance
}
