import type { FoundBrowser, BrowserStatus } from '@packages/types'
import os from 'os'
import execa from 'execa'

import type { DataContext } from '..'

let isPowerShellAvailable: undefined | boolean
let powerShellPromise: Promise<void> | undefined

// Only need to worry about checking for PowerShell in windows,
// doing it asynchronously so to not block startup
if (os.platform() === 'win32') {
  powerShellPromise = execa(`[void] ''`, { shell: 'powershell' }).then(() => {
    isPowerShellAvailable = true
  }).catch(() => {
    // Powershell is unavailable
    isPowerShellAvailable = false
  }).finally(() => {
    powerShellPromise = undefined
  })
}

const platform = os.platform()

export interface BrowserApiShape {
  close(): Promise<any>
  ensureAndGetByNameOrPath(nameOrPath: string): Promise<FoundBrowser>
  getBrowsers(): Promise<FoundBrowser[]>
  focusActiveBrowserWindow(): Promise<any>
  relaunchBrowser(): Promise<void> | null
}

export class BrowserDataSource {
  constructor (private ctx: DataContext) {}

  /**
   * Gets the browsers from the machine, caching the Promise on the coreData
   * so we only look them up once
   */
  machineBrowsers () {
    if (!this.ctx.coreData.machineBrowsers) {
      const p = this.ctx._apis.browserApi.getBrowsers()

      this.ctx.coreData.machineBrowsers = p.then(async (browsers) => {
        if (!browsers[0]) throw new Error('no browsers found in machineBrowsers')

        return browsers
      }).catch((e) => {
        this.ctx.update((coreData) => {
          coreData.machineBrowsers = null
          coreData.baseError = e
        })

        throw e
      })
    }

    return this.ctx.coreData.machineBrowsers
  }

  idForBrowser (obj: FoundBrowser) {
    return `${obj.name}-${obj.family}-${obj.channel}`
  }

  isSelected (obj: FoundBrowser) {
    if (!this.ctx.coreData.activeBrowser) {
      return false
    }

    return this.idForBrowser(this.ctx.coreData.activeBrowser) === this.idForBrowser(obj)
  }

  async isFocusSupported (obj: FoundBrowser) {
    if (obj.family !== 'firefox') {
      return true
    }

    // Only allow focusing if PowerShell is available on Windows, since that's what we use to do it
    if (platform === 'win32') {
      if (powerShellPromise) {
        await powerShellPromise
      }

      return isPowerShellAvailable ?? false
    }

    return false
  }

  isVersionSupported (obj: FoundBrowser) {
    return Boolean(!obj.unsupportedVersion)
  }

  setBrowserStatus (browserStatus: BrowserStatus) {
    this.ctx.update((d) => {
      d.app.browserStatus = browserStatus
    })

    this.ctx.emitter.browserStatusChange()
  }
}