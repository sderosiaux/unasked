/**
 * Spikelog - Metric tracking service
 * Fire and forget approach - never blocks main app
 */

const SPIKELOG_API_URL = 'https://api.spikelog.com/api/v1/ingest'
const SPIKELOG_API_KEY = 'sk_qkYyy39ZOvttq231yL3VeWNe7VcHR4x3zuUGBtvN15c'

interface TrackOptions {
  tags?: Record<string, string | number | boolean>
  timestamp?: string // ISO 8601
}

/**
 * Track a metric to Spikelog.
 * Fire and forget - never blocks, fails silently.
 */
export function track(chart: string, value: number, options?: TrackOptions): void {
  // Don't block - run async
  trackAsync(chart, value, options).catch(() => {
    // Silently ignore errors
  })
}

async function trackAsync(chart: string, value: number, options?: TrackOptions): Promise<void> {
  try {
    const body: Record<string, unknown> = {
      chart,
      value
    }

    if (options?.tags) {
      body.tags = options.tags
    }

    if (options?.timestamp) {
      body.timestamp = options.timestamp
    }

    const response = await fetch(SPIKELOG_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': SPIKELOG_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      console.warn(`[Spikelog] Failed to track "${chart}": ${response.status}`)
    }
  } catch (error) {
    // Log but don't throw - app must work even if Spikelog is down
    console.warn('[Spikelog] Tracking error:', error)
  }
}

// Convenience methods for common metrics
export const spikelog = {
  track,

  /**
   * Track Claude API analysis duration
   */
  claudeAnalysisDuration(durationMs: number): void {
    track('Claude Analysis Duration', durationMs)
  },

  /**
   * Track Claude token usage
   */
  claudeTokenUsage(inputTokens: number, outputTokens: number): void {
    track('Claude Token Usage', inputTokens + outputTokens, {
      tags: { input: inputTokens, output: outputTokens }
    })
  },

  /**
   * Track meeting duration when it ends
   */
  meetingDuration(durationMinutes: number): void {
    track('Meeting Duration', durationMinutes)
  },

  /**
   * Track number of insights extracted per analysis
   */
  insightsExtracted(counts: {
    decisions: number
    actions: number
    questions: number
    loops: number
  }): void {
    const total = counts.decisions + counts.actions + counts.questions
    track('Insights Extracted', total, { tags: counts })
  },

  /**
   * Track loops detected
   */
  loopsDetected(count: number): void {
    track('Loops Detected', count)
  },

  /**
   * Track API errors
   */
  apiError(service: 'claude' | 'deepgram', errorMessage: string): void {
    track('API Errors', 1, {
      tags: { service, error: errorMessage.substring(0, 100) }
    })
  },

  /**
   * Track active meetings (increment/decrement)
   */
  activeMeetings(delta: 1 | -1): void {
    track('Active Meetings', delta)
  }
}
