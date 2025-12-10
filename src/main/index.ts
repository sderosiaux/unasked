import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { config } from 'dotenv'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getMeetingStateManager } from './services/MeetingStateManager'
import { getSecureStorage } from './services/SecureStorage'
import { getMeetingStorageService } from './services/MeetingStorageService'

// Load environment variables from .env file
config()

// Initialize the meeting state manager
const meetingManager = getMeetingStateManager()

function createWindow(): BrowserWindow {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 10 },
    ...(process.platform === 'linux'
      ? {
          icon: join(__dirname, '../../resources/icon.png')
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.meetingcopilot')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC handlers
  ipcMain.handle('ping', () => 'pong')

  // Settings IPC handlers
  const secureStorage = getSecureStorage()

  ipcMain.handle('settings:get', () => {
    return secureStorage.getSettings()
  })

  ipcMain.handle(
    'settings:save',
    async (_event, settings: { anthropicApiKey?: string; deepgramApiKey?: string }) => {
      secureStorage.saveSettings(settings)
      // Re-initialize services with new keys
      await meetingManager.initialize()
      return { success: true }
    }
  )

  ipcMain.handle('settings:hasApiKeys', () => {
    return secureStorage.hasApiKeys()
  })

  // Meeting history IPC handlers
  const meetingStorage = getMeetingStorageService()

  ipcMain.handle('history:list', () => {
    return meetingStorage.listMeetings()
  })

  ipcMain.handle('history:get', (_event, id: string) => {
    return meetingStorage.getMeeting(id)
  })

  ipcMain.handle('history:search', (_event, query: string) => {
    return meetingStorage.searchMeetings(query)
  })

  ipcMain.handle('history:delete', (_event, id: string) => {
    return meetingStorage.deleteMeeting(id)
  })

  ipcMain.handle('history:updateTitle', (_event, id: string, title: string) => {
    return meetingStorage.updateMeetingTitle(id, title)
  })

  const mainWindow = createWindow()

  // Set up meeting manager with main window reference
  meetingManager.setMainWindow(mainWindow)

  // Initialize services
  meetingManager.initialize().catch(console.error)

  app.on('activate', function () {
    // On macOS re-create window when dock icon is clicked and no windows open
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
