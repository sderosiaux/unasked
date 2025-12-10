import { safeStorage, app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

interface StoredSettings {
  anthropicApiKey?: string
  deepgramApiKey?: string
}

const SETTINGS_FILE = 'settings.enc'

/**
 * Secure storage for API keys using Electron's safeStorage API.
 * Keys are encrypted using the OS keychain (macOS Keychain, Windows Credential Manager).
 */
class SecureStorage {
  private settingsPath: string

  constructor() {
    this.settingsPath = join(app.getPath('userData'), SETTINGS_FILE)
  }

  /**
   * Check if encryption is available on this system.
   */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /**
   * Get all stored settings.
   */
  getSettings(): StoredSettings {
    if (!existsSync(this.settingsPath)) {
      return {}
    }

    try {
      const encryptedBuffer = readFileSync(this.settingsPath)
      if (encryptedBuffer.length === 0) {
        return {}
      }

      const decrypted = safeStorage.decryptString(encryptedBuffer)
      return JSON.parse(decrypted)
    } catch (error) {
      console.error('Failed to read settings:', error)
      return {}
    }
  }

  /**
   * Save settings securely.
   */
  saveSettings(settings: StoredSettings): void {
    try {
      // Ensure userData directory exists
      const userDataPath = app.getPath('userData')
      if (!existsSync(userDataPath)) {
        mkdirSync(userDataPath, { recursive: true })
      }

      const json = JSON.stringify(settings)
      const encrypted = safeStorage.encryptString(json)
      writeFileSync(this.settingsPath, encrypted)
    } catch (error) {
      console.error('Failed to save settings:', error)
      throw error
    }
  }

  /**
   * Get a specific API key.
   */
  getApiKey(key: 'anthropicApiKey' | 'deepgramApiKey'): string | undefined {
    const settings = this.getSettings()
    return settings[key]
  }

  /**
   * Set a specific API key.
   */
  setApiKey(key: 'anthropicApiKey' | 'deepgramApiKey', value: string): void {
    const settings = this.getSettings()
    settings[key] = value
    this.saveSettings(settings)
  }

  /**
   * Check if API keys are configured.
   */
  hasApiKeys(): { anthropic: boolean; deepgram: boolean } {
    const settings = this.getSettings()
    return {
      anthropic: !!settings.anthropicApiKey,
      deepgram: !!settings.deepgramApiKey
    }
  }
}

// Singleton instance
let instance: SecureStorage | null = null

export function getSecureStorage(): SecureStorage {
  if (!instance) {
    instance = new SecureStorage()
  }
  return instance
}
