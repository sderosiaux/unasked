import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'

// Configure logging for auto-updater
autoUpdater.logger = log
;(autoUpdater.logger as typeof log).transports.file.level = 'info'

// Disable auto-download - we'll control this manually
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  progress?: number
  error?: string
}

class UpdateService {
  private mainWindow: BrowserWindow | null = null
  private currentStatus: UpdateStatus = { status: 'not-available' }

  constructor() {
    this.setupAutoUpdater()
    this.setupIpcHandlers()
  }

  private setupAutoUpdater(): void {
    autoUpdater.on('checking-for-update', () => {
      this.updateStatus({ status: 'checking' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateStatus({
        status: 'available',
        version: info.version,
        releaseNotes:
          typeof info.releaseNotes === 'string'
            ? info.releaseNotes
            : Array.isArray(info.releaseNotes)
              ? info.releaseNotes.map((n) => n.note).join('\n')
              : undefined
      })
    })

    autoUpdater.on('update-not-available', () => {
      this.updateStatus({ status: 'not-available' })
    })

    autoUpdater.on('error', (err: Error) => {
      log.error('Update error:', err)
      this.updateStatus({
        status: 'error',
        error: err.message
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.updateStatus({
        status: 'downloading',
        progress: Math.round(progress.percent)
      })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateStatus({
        status: 'downloaded',
        version: info.version
      })
    })
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('updater:check', async () => {
      return this.checkForUpdates()
    })

    ipcMain.handle('updater:download', async () => {
      return this.downloadUpdate()
    })

    ipcMain.handle('updater:install', () => {
      this.installUpdate()
    })

    ipcMain.handle('updater:getStatus', () => {
      return this.currentStatus
    })
  }

  private updateStatus(status: UpdateStatus): void {
    this.currentStatus = status
    this.sendToRenderer('updater:status', status)
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data)
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    try {
      await autoUpdater.checkForUpdates()
      return this.currentStatus
    } catch (error) {
      log.error('Failed to check for updates:', error)
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      log.error('Failed to download update:', error)
      this.updateStatus({
        status: 'error',
        error: error instanceof Error ? error.message : 'Download failed'
      })
    }
  }

  installUpdate(): void {
    autoUpdater.quitAndInstall(false, true)
  }
}

// Singleton instance
let updateService: UpdateService | null = null

export function getUpdateService(): UpdateService {
  if (!updateService) {
    updateService = new UpdateService()
  }
  return updateService
}
