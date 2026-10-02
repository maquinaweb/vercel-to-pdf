import chromium from '@sparticuz/chromium-min'
import puppeteer, { type Browser } from 'puppeteer-core'

const DEFAULT_CHROMIUM_PACK_URL =
	'https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar'

export interface ChromiumConfig {
	packUrl?: string
	headless?: boolean | 'shell'
}

let cachedBrowser: Browser | null = null

/**
 * Resolves the Chromium binary path and launches a Puppeteer Browser instance.
 */
export async function getBrowser(config: ChromiumConfig = {}): Promise<Browser> {
	if (cachedBrowser?.connected) {
		return cachedBrowser
	}

	const packUrl = config.packUrl || process.env.CHROMIUM_PACK_URL || DEFAULT_CHROMIUM_PACK_URL

	chromium.setGraphicsMode = false

	const executablePath = await chromium.executablePath(packUrl)

	const browser = await puppeteer.launch({
		args: chromium.args,
		defaultViewport: null,
		executablePath,
		headless: config.headless ?? true,
	})

	cachedBrowser = browser

	browser.on('disconnected', () => {
		if (cachedBrowser === browser) {
			cachedBrowser = null
		}
	})

	return browser
}
