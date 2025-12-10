import Anthropic from '@anthropic-ai/sdk'
import { EventEmitter } from 'events'

export interface MeetingAnalysis {
  liveSummary: string[]
  decisions: Array<{
    id: string
    text: string
    owner?: string
    timestamp: number
    priority: number
  }>
  actions: Array<{
    id: string
    text: string
    owner?: string
    deadline?: string
    status: 'identified' | 'needs-clarification'
    timestamp: number
    priority: number
  }>
  openQuestions: Array<{
    id: string
    text: string
    priority: number
  }>
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
  ambiguities: Array<{
    id: string
    point: string
    clarifyingQuestion: string
  }>
  directResponse: string | null
}

const SYSTEM_PROMPT = `Tu es Meeting Copilot, un assistant qui écoute une réunion en temps réel (audio transcrit) et aide les participants à avancer de façon claire et productive.

CONTEXTE
- Tu reçois des morceaux de transcription en continu.
- La réunion peut être en anglais ou en français.
- Tu n'as PAS accès à l'identité des speakers (pas de diarization).
- Tu réagis seulement par texte.

OBJECTIF
1) Suivre la réunion en temps réel.
2) Clarifier ce qui se passe.
3) Rendre visibles les décisions, actions, questions ouvertes, boucles et contradictions.
4) Détecter quand la discussion se contredit elle-même (ex: "on fait X" puis plus tard "finalement on ne fait pas X").
5) Suggérer des reformulations ou décisions quand la discussion tourne en rond.

STYLE D'ÉCRITURE
- SUCCINCT: phrases courtes, va droit au but
- Utilise des symboles pour gagner de la place:
  → pour indiquer une conséquence ou direction
  ← pour une cause ou origine
  + pour un ajout ou avantage
  - pour un retrait ou inconvénient
  ⚠️ pour une alerte ou attention
  ✓ pour validé/confirmé
  ? pour incertain
- Évite les phrases complètes quand des mots-clés suffisent
- Exemple: "API → microservices + scalabilité" au lieu de "On a décidé de passer à une architecture microservices pour l'API afin d'améliorer la scalabilité"

PRIORITÉ (1-3)
- 1 = Critique/urgent: bloque le projet, deadline proche, impact majeur
- 2 = Important: à faire, mais pas bloquant immédiatement
- 3 = Nice-to-have: peut attendre, faible impact

DÉTECTION DES CONTRADICTIONS
- Cherche les changements de direction: "on va faire X" → "finalement non"
- Cherche les positions incompatibles: "c'est urgent" vs "on a le temps"
- Cherche les décisions qui s'annulent
- PAS besoin d'identifier les personnes, juste le contenu contradictoire

DÉTECTION DES BOUCLES
- Même sujet abordé plusieurs fois sans avancer
- Discussion qui tourne en rond
- Propose une action concrète pour débloquer

RÈGLES
- Sois proactif: détecte les tensions même subtiles.
- Langage simple et direct.
- Ne pas inventer de décisions non exprimées.
- Si quelqu'un dit "Copilot" ou pose une question au système, réponds dans directResponse.
- Tu DOIS utiliser l'outil analyze_meeting pour structurer ta réponse.`

// Tool definition for structured output
const MEETING_ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'analyze_meeting',
  description: 'Analyze the meeting transcription and extract structured insights',
  input_schema: {
    type: 'object' as const,
    properties: {
      liveSummary: {
        type: 'array',
        items: { type: 'string' },
        description: 'Key points from the current discussion (succinct, use symbols)'
      },
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The decision made (succinct)' },
            owner: { type: 'string', description: 'Person responsible if mentioned' },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: '1=critical, 2=important, 3=nice-to-have'
            }
          },
          required: ['text', 'priority']
        },
        description: 'Decisions made during the meeting'
      },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Action item (succinct)' },
            owner: { type: 'string', description: 'Person responsible if mentioned' },
            deadline: { type: 'string', description: 'Due date if mentioned' },
            status: { type: 'string', enum: ['identified', 'needs-clarification'] },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: '1=critical, 2=important, 3=nice-to-have'
            }
          },
          required: ['text', 'status', 'priority']
        },
        description: 'Action items to follow up on'
      },
      openQuestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Question without clear answer' },
            priority: {
              type: 'number',
              enum: [1, 2, 3],
              description: '1=critical, 2=important, 3=nice-to-have'
            }
          },
          required: ['text', 'priority']
        },
        description: 'Questions that remain unanswered'
      },
      loops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic being discussed repeatedly' },
            occurrences: { type: 'number', description: 'How many times discussed' },
            suggestion: { type: 'string', description: 'Suggestion to move forward' }
          },
          required: ['topic', 'occurrences', 'suggestion']
        },
        description: 'Topics that keep coming back without progress'
      },
      contradictions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            earlier: { type: 'string', description: 'What was said earlier' },
            later: { type: 'string', description: 'What contradicts it' },
            topic: { type: 'string', description: 'Subject of contradiction' },
            suggestion: { type: 'string', description: 'How to resolve' }
          },
          required: ['earlier', 'later', 'topic', 'suggestion']
        },
        description: 'Contradictory statements detected'
      },
      implicitAssumptions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Assumptions being made without explicit validation'
      },
      ambiguities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            point: { type: 'string', description: 'The ambiguous point' },
            clarifyingQuestion: { type: 'string', description: 'Question to clarify it' }
          },
          required: ['point', 'clarifyingQuestion']
        },
        description: 'Points that need clarification'
      },
      directResponse: {
        type: ['string', 'null'],
        description:
          'Response text if someone addressed Copilot directly (e.g. "Hey Copilot, what do you think?"), or null if no one addressed Copilot'
      }
    },
    required: [
      'liveSummary',
      'decisions',
      'actions',
      'openQuestions',
      'loops',
      'contradictions',
      'implicitAssumptions',
      'ambiguities',
      'directResponse'
    ]
  }
}

interface ToolInput {
  liveSummary?: string[]
  decisions?: Array<{ text: string; owner?: string; priority?: number }>
  actions?: Array<{
    text: string
    owner?: string
    deadline?: string
    status?: string
    priority?: number
  }>
  openQuestions?: Array<{ text: string; priority?: number }>
  loops?: Array<{ topic: string; occurrences?: number; suggestion?: string }>
  contradictions?: Array<{ earlier: string; later: string; topic: string; suggestion?: string }>
  implicitAssumptions?: string[]
  ambiguities?: Array<{ point: string; clarifyingQuestion: string }>
  directResponse?: string | null
}

export class ClaudeService extends EventEmitter {
  private client: Anthropic | null = null
  private conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  private accumulatedTranscript = ''
  private lastAnalysis: MeetingAnalysis | null = null
  private isProcessing = false

  constructor() {
    super()
  }

  initialize(apiKey?: string): void {
    const key = apiKey || process.env.ANTHROPIC_API_KEY

    if (!key) {
      console.warn('ANTHROPIC_API_KEY not set - Claude analysis will be disabled')
      this.emit('warning', 'API key not configured')
      return
    }

    this.client = new Anthropic({ apiKey: key })
    this.emit('ready')
  }

  isReady(): boolean {
    return this.client !== null
  }

  /**
   * Add transcription text to the accumulated buffer.
   */
  addTranscription(text: string): void {
    this.accumulatedTranscript += ' ' + text.trim()
  }

  /**
   * Analyze the accumulated transcription using structured tool output.
   */
  async analyze(): Promise<MeetingAnalysis | null> {
    if (!this.client) {
      console.warn('Claude client not initialized')
      return null
    }

    if (this.isProcessing) {
      console.log('Analysis already in progress, skipping')
      return this.lastAnalysis
    }

    if (this.accumulatedTranscript.trim().length < 10) {
      console.log('Not enough transcription to analyze')
      return this.lastAnalysis
    }

    this.isProcessing = true
    this.emit('analyzing')

    // Capture the transcript NOW, so new transcriptions don't get lost
    const transcriptToAnalyze = this.accumulatedTranscript.trim()
    this.accumulatedTranscript = '' // Clear immediately, new text will accumulate here

    try {
      // Build the user message with context
      const userMessage = this.buildUserMessage(transcriptToAnalyze)
      console.log('[Claude] Sending to analyze:', userMessage.substring(0, 300))

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        tools: [MEETING_ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: 'analyze_meeting' },
        messages: [...this.conversationHistory, { role: 'user', content: userMessage }]
      })

      // Extract tool use content - this is guaranteed structured JSON
      const toolUse = response.content.find((c) => c.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        throw new Error('No tool use response from Claude')
      }

      console.log('[Claude] Tool response received')
      const analysis = this.parseToolResponse(toolUse.input as ToolInput)
      console.log(
        '[Claude] Parsed analysis:',
        JSON.stringify({
          liveSummary: analysis.liveSummary.length,
          decisions: analysis.decisions.length,
          actions: analysis.actions.length,
          openQuestions: analysis.openQuestions.length,
          loops: analysis.loops.length,
          contradictions: analysis.contradictions.length,
          implicitAssumptions: analysis.implicitAssumptions.length,
          ambiguities: analysis.ambiguities.length,
          directResponse: !!analysis.directResponse
        })
      )

      // Update conversation history (keep last 10 exchanges to manage context)
      this.conversationHistory.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: JSON.stringify(toolUse.input) }
      )
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20)
      }

      // Buffer already cleared at start - just save the analysis
      this.lastAnalysis = analysis

      this.emit('analysis', analysis)
      return analysis
    } catch (error) {
      console.error('Claude analysis error:', error)
      this.emit('error', error)
      return this.lastAnalysis
    } finally {
      this.isProcessing = false
    }
  }

  private buildUserMessage(transcript: string): string {
    const contextParts: string[] = []

    // Add current state context if we have previous analysis
    if (this.lastAnalysis) {
      contextParts.push('ÉTAT ACTUEL DE LA RÉUNION:')
      if (this.lastAnalysis.liveSummary.length > 0) {
        contextParts.push(`Résumé: ${this.lastAnalysis.liveSummary.join('; ')}`)
      }
      if (this.lastAnalysis.decisions.length > 0) {
        contextParts.push(
          `Décisions prises: ${this.lastAnalysis.decisions.map((d) => d.text).join('; ')}`
        )
      }
      if (this.lastAnalysis.actions.length > 0) {
        contextParts.push(
          `Actions: ${this.lastAnalysis.actions.map((a) => `${a.owner || '?'}: ${a.text}`).join('; ')}`
        )
      }
      if (this.lastAnalysis.openQuestions.length > 0) {
        contextParts.push(
          `Questions ouvertes: ${this.lastAnalysis.openQuestions.map((q) => q.text).join('; ')}`
        )
      }
      if (this.lastAnalysis.loops.length > 0) {
        contextParts.push(
          `Boucles détectées: ${this.lastAnalysis.loops.map((l) => l.topic).join('; ')}`
        )
      }
      if (this.lastAnalysis.contradictions.length > 0) {
        contextParts.push(
          `Contradictions: ${this.lastAnalysis.contradictions.map((c) => c.topic).join('; ')}`
        )
      }
      contextParts.push('')
    }

    contextParts.push('NOUVELLE TRANSCRIPTION (depuis la dernière analyse):')
    contextParts.push(transcript)
    contextParts.push('')
    contextParts.push(
      "Analyse cette nouvelle partie en tenant compte du contexte. Détecte si quelque chose contredit ce qui a été dit avant. Utilise l'outil analyze_meeting pour structurer ta réponse."
    )

    return contextParts.join('\n')
  }

  private parseToolResponse(input: ToolInput): MeetingAnalysis {
    const timestamp = Date.now()

    return {
      liveSummary: Array.isArray(input.liveSummary) ? input.liveSummary : [],
      decisions: (input.decisions || []).map((d, i) => ({
        id: `dec_${timestamp}_${i}`,
        text: d.text || '',
        owner: d.owner,
        priority: d.priority || 2,
        timestamp
      })),
      actions: (input.actions || []).map((a, i) => ({
        id: `act_${timestamp}_${i}`,
        text: a.text || '',
        owner: a.owner,
        deadline: a.deadline,
        status:
          a.status === 'needs-clarification'
            ? ('needs-clarification' as const)
            : ('identified' as const),
        priority: a.priority || 2,
        timestamp
      })),
      openQuestions: (input.openQuestions || []).map((q, i) => ({
        id: `q_${timestamp}_${i}`,
        text: q.text || '',
        priority: q.priority || 2
      })),
      loops: (input.loops || []).map((l, i) => ({
        id: `loop_${timestamp}_${i}`,
        topic: l.topic || '',
        occurrences: l.occurrences || 1,
        suggestion: l.suggestion || '',
        firstDetected: timestamp
      })),
      contradictions: (input.contradictions || []).map((c, i) => ({
        id: `contra_${timestamp}_${i}`,
        earlier: c.earlier || '',
        later: c.later || '',
        topic: c.topic || '',
        suggestion: c.suggestion || ''
      })),
      implicitAssumptions: Array.isArray(input.implicitAssumptions)
        ? input.implicitAssumptions
        : [],
      ambiguities: (input.ambiguities || []).map((a, i) => ({
        id: `amb_${timestamp}_${i}`,
        point: a.point || '',
        clarifyingQuestion: a.clarifyingQuestion || ''
      })),
      // Ensure directResponse is a valid non-empty string, not boolean or "null"
      directResponse:
        typeof input.directResponse === 'string' &&
        input.directResponse.trim() !== '' &&
        input.directResponse !== 'null'
          ? input.directResponse
          : null
    }
  }

  /**
   * Reset the conversation state.
   */
  reset(): void {
    this.conversationHistory = []
    this.accumulatedTranscript = ''
    this.lastAnalysis = null
    this.emit('reset')
  }

  getLastAnalysis(): MeetingAnalysis | null {
    return this.lastAnalysis
  }
}

// Singleton instance
let instance: ClaudeService | null = null

export function getClaudeService(): ClaudeService {
  if (!instance) {
    instance = new ClaudeService()
  }
  return instance
}
