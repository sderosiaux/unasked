import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { MeetingState } from './MeetingStateManager'

export interface SavedMeeting {
  id: string
  title: string
  startTime: number
  endTime: number
  duration: number // in minutes
  liveSummary: string[]
  decisions: MeetingState['decisions']
  actions: MeetingState['actions']
  openQuestions: MeetingState['openQuestions']
  loops: MeetingState['loops']
  contradictions: MeetingState['contradictions']
  implicitAssumptions: string[]
  ambiguities: MeetingState['ambiguities']
  detectedLanguage: 'en' | 'fr' | 'mixed'
  transcript: string
}

export interface MeetingListItem {
  id: string
  title: string
  startTime: number
  duration: number
  summaryPreview: string
  decisionsCount: number
  actionsCount: number
}

export interface SearchResult {
  meeting: MeetingListItem
  matchType: 'title' | 'summary' | 'decision' | 'action' | 'transcript'
  matchText: string
}

/**
 * Service for persisting meetings to local storage
 */
export class MeetingStorageService {
  private storagePath: string
  private indexPath: string
  private meetingsDir: string

  constructor() {
    this.storagePath = path.join(app.getPath('userData'), 'meetings')
    this.indexPath = path.join(this.storagePath, 'index.json')
    this.meetingsDir = path.join(this.storagePath, 'data')
    this.ensureStorageExists()
  }

  private ensureStorageExists(): void {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true })
    }
    if (!fs.existsSync(this.meetingsDir)) {
      fs.mkdirSync(this.meetingsDir, { recursive: true })
    }
    if (!fs.existsSync(this.indexPath)) {
      fs.writeFileSync(this.indexPath, JSON.stringify({ meetings: [] }))
    }
  }

  private generateId(): string {
    return `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private generateTitle(meeting: Partial<SavedMeeting>): string {
    // Try to generate a meaningful title from the summary
    if (meeting.liveSummary && meeting.liveSummary.length > 0) {
      const firstPoint = meeting.liveSummary[0]
      // Take first 50 chars
      return firstPoint.length > 50 ? firstPoint.substring(0, 50) + '...' : firstPoint
    }

    // Fallback to date-based title
    const date = new Date(meeting.startTime || Date.now())
    return `Meeting ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  private loadIndex(): { meetings: MeetingListItem[] } {
    try {
      const data = fs.readFileSync(this.indexPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return { meetings: [] }
    }
  }

  private saveIndex(index: { meetings: MeetingListItem[] }): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2))
  }

  /**
   * Save a meeting to local storage
   */
  saveMeeting(state: MeetingState, transcript: string): SavedMeeting {
    const id = this.generateId()
    const endTime = Date.now()
    const startTime = state.startTime || endTime
    const duration = Math.round((endTime - startTime) / 1000 / 60)

    const meeting: SavedMeeting = {
      id,
      title: '',
      startTime,
      endTime,
      duration,
      liveSummary: state.liveSummary,
      decisions: state.decisions,
      actions: state.actions,
      openQuestions: state.openQuestions,
      loops: state.loops,
      contradictions: state.contradictions,
      implicitAssumptions: state.implicitAssumptions,
      ambiguities: state.ambiguities,
      detectedLanguage: state.detectedLanguage,
      transcript
    }

    meeting.title = this.generateTitle(meeting)

    // Save full meeting data
    const meetingPath = path.join(this.meetingsDir, `${id}.json`)
    fs.writeFileSync(meetingPath, JSON.stringify(meeting, null, 2))

    // Update index
    const index = this.loadIndex()
    const listItem: MeetingListItem = {
      id,
      title: meeting.title,
      startTime,
      duration,
      summaryPreview:
        meeting.liveSummary.slice(0, 2).join(' ').substring(0, 100) || 'No summary available',
      decisionsCount: meeting.decisions.length,
      actionsCount: meeting.actions.length
    }
    index.meetings.unshift(listItem) // Add to beginning (newest first)
    this.saveIndex(index)

    console.log(`Meeting saved: ${id}`)
    return meeting
  }

  /**
   * Get list of all meetings (metadata only)
   */
  listMeetings(): MeetingListItem[] {
    const index = this.loadIndex()
    return index.meetings
  }

  /**
   * Get full meeting data by ID
   */
  getMeeting(id: string): SavedMeeting | null {
    const meetingPath = path.join(this.meetingsDir, `${id}.json`)
    if (!fs.existsSync(meetingPath)) {
      return null
    }
    try {
      const data = fs.readFileSync(meetingPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * Delete a meeting
   */
  deleteMeeting(id: string): boolean {
    const meetingPath = path.join(this.meetingsDir, `${id}.json`)

    // Remove from index
    const index = this.loadIndex()
    index.meetings = index.meetings.filter((m) => m.id !== id)
    this.saveIndex(index)

    // Remove file
    if (fs.existsSync(meetingPath)) {
      fs.unlinkSync(meetingPath)
      console.log(`Meeting deleted: ${id}`)
      return true
    }
    return false
  }

  /**
   * Search meetings by query
   */
  searchMeetings(query: string): SearchResult[] {
    const results: SearchResult[] = []
    const lowerQuery = query.toLowerCase()
    const index = this.loadIndex()

    for (const listItem of index.meetings) {
      // Check title
      if (listItem.title.toLowerCase().includes(lowerQuery)) {
        results.push({
          meeting: listItem,
          matchType: 'title',
          matchText: listItem.title
        })
        continue
      }

      // Check summary preview
      if (listItem.summaryPreview.toLowerCase().includes(lowerQuery)) {
        results.push({
          meeting: listItem,
          matchType: 'summary',
          matchText: listItem.summaryPreview
        })
        continue
      }

      // For deeper search, load full meeting
      const meeting = this.getMeeting(listItem.id)
      if (!meeting) continue

      // Check decisions
      const matchedDecision = meeting.decisions.find((d) =>
        d.text.toLowerCase().includes(lowerQuery)
      )
      if (matchedDecision) {
        results.push({
          meeting: listItem,
          matchType: 'decision',
          matchText: matchedDecision.text
        })
        continue
      }

      // Check actions
      const matchedAction = meeting.actions.find((a) => a.text.toLowerCase().includes(lowerQuery))
      if (matchedAction) {
        results.push({
          meeting: listItem,
          matchType: 'action',
          matchText: matchedAction.text
        })
        continue
      }

      // Check transcript
      if (meeting.transcript.toLowerCase().includes(lowerQuery)) {
        // Find context around match
        const idx = meeting.transcript.toLowerCase().indexOf(lowerQuery)
        const start = Math.max(0, idx - 30)
        const end = Math.min(meeting.transcript.length, idx + query.length + 30)
        const matchText =
          (start > 0 ? '...' : '') +
          meeting.transcript.substring(start, end) +
          (end < meeting.transcript.length ? '...' : '')

        results.push({
          meeting: listItem,
          matchType: 'transcript',
          matchText
        })
      }
    }

    return results
  }

  /**
   * Update meeting title
   */
  updateMeetingTitle(id: string, title: string): boolean {
    const meeting = this.getMeeting(id)
    if (!meeting) return false

    meeting.title = title
    const meetingPath = path.join(this.meetingsDir, `${id}.json`)
    fs.writeFileSync(meetingPath, JSON.stringify(meeting, null, 2))

    // Update index
    const index = this.loadIndex()
    const listItem = index.meetings.find((m) => m.id === id)
    if (listItem) {
      listItem.title = title
      this.saveIndex(index)
    }

    return true
  }
}

// Singleton
let instance: MeetingStorageService | null = null

export function getMeetingStorageService(): MeetingStorageService {
  if (!instance) {
    instance = new MeetingStorageService()
  }
  return instance
}
