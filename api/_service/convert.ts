import type { PaperFormat } from 'puppeteer-core'
import { connectToObscura } from './obscura.js'

export interface ConvertOptions {
	/**
	 * Page paper format (default: 'A4')
	 */
	format?: PaperFormat
	/**
	 * Print in landscape orientation (default: false)
	 */
	landscape?: boolean
	/**
	 * Print background graphics (default: true)
	 */
	printBackground?: boolean
	/**
	 * Navigation timeout in ms (default: 30000)
	 */
	timeout?: number
	/**
	 * Navigation settle level: 'domcontentloaded' | 'load' | 'networkidle2' | 'networkidle0'
	 * (default: 'networkidle2')
	 */
	waitUntil?: 'domcontentloaded' | 'load' | 'networkidle2' | 'networkidle0'
	/**
	 * Viewport dimensions
	 */
	viewport?: {
		width: number
		height: number
		deviceScaleFactor?: number
	}
	/**
	 * Whether to scroll down the page to trigger lazy loading (default: true)
	 */
	scrollLazyLoad?: boolean
	/**
	 * Scale of the webpage rendering (between 0.1 and 2, default: 1)
	 */
	scale?: number
	/**
	 * Paper margins (default: ~10mm)
	 */
	margin?: {
		top?: string | number
		bottom?: string | number
		left?: string | number
		right?: string | number
	}
}

/**
 * Normalizes and validates incoming URL string.
 */
export function normalizeUrl(rawUrl: string): string {
	let trimmed = rawUrl.trim()
	if (!trimmed) {
		throw new Error('URL cannot be empty')
	}

	// Fix collapsed slashes from URL path routing (e.g. https:/www.google.com -> https://www.google.com)
	if (/^https?:\/+[^/]/i.test(trimmed)) {
		trimmed = trimmed.replace(/^(https?):\/+/i, '$1://')
	}

	let finalUrl = trimmed
	if (!/^https?:\/\//i.test(finalUrl)) {
		finalUrl = `https://${finalUrl}`
	}

	try {
		new URL(finalUrl)
		return finalUrl
	} catch {
		throw new Error(`Invalid URL: ${rawUrl}`)
	}
}

/**
 * Converts a webpage to a PDF buffer using Obscura.
 */
export async function getPdf(rawUrl: string, options: ConvertOptions = {}): Promise<Buffer> {
	const url = normalizeUrl(rawUrl)
	const timeout = options.timeout ?? 20000
	const waitUntil = options.waitUntil ?? 'load'

	const browser = await connectToObscura()
	let page: any = null

	try {
		page = await browser.newPage()

		if (options.viewport) {
			await page.setViewport(options.viewport).catch(() => {})
		}

		// Visit URL with specified wait condition
		try {
			await page.goto(url, { waitUntil, timeout })
		} catch (gotoErr: any) {
			if (waitUntil !== 'load' && gotoErr.message?.includes('timeout')) {
				console.warn(
					`[Convert] Navigation with '${waitUntil}' timed out. Falling back to 'load'...`,
				)
				await page.goto(url, { waitUntil: 'load', timeout: 10000 })
			} else {
				throw gotoErr
			}
		}

		// Scroll to bottom of page to force loading of lazy loaded images
		if (options.scrollLazyLoad !== false) {
			try {
				await page.evaluate(async () => {
					await new Promise<void>((resolve) => {
						let totalHeight = 0
						const distance = 250
						const scrollLimit = 12000

						const timer = setInterval(() => {
							const scrollHeight = document.body ? document.body.scrollHeight : 0
							window.scrollBy(0, distance)
							totalHeight += distance

							if (totalHeight >= scrollHeight || totalHeight >= scrollLimit) {
								clearInterval(timer)
								window.scrollTo(0, 0)
								resolve()
							}
						}, 10)

						// Safety ceiling after 2.5 seconds
						setTimeout(() => {
							clearInterval(timer)
							window.scrollTo(0, 0)
							resolve()
						}, 2500)
					})
				})
			} catch {
				// Evaluate might fail on restricted pages; proceed to print anyway
			}
		}

		// Wait for web fonts to load and layout to settle
		try {
			await page.evaluate(async () => {
				if (document.fonts?.ready) {
					await document.fonts.ready
				}
				await new Promise((resolve) => setTimeout(resolve, 80))
			})
		} catch {
			// Ignore if document.fonts is not supported
		}

		// Inject print styling for sharp text, images and SVG edges
		try {
			await page.evaluate(() => {
				const style = document.createElement('style')
				style.textContent = `
					*, *::before, *::after {
						-webkit-font-smoothing: antialiased !important;
						-moz-osx-font-smoothing: grayscale !important;
						text-rendering: geometricPrecision !important;
					}
					svg, rect, table {
						shape-rendering: crispEdges !important;
					}
					img {
						image-rendering: -webkit-optimize-contrast !important;
					}
					html, body {
						-webkit-print-color-adjust: exact !important;
						print-color-adjust: exact !important;
					}
				`
				document.head?.appendChild(style)
			})
		} catch {
			// Ignore if evaluation is restricted
		}

		// Emulate screen media if supported
		try {
			await page.emulateMediaType('screen')
		} catch {
			// Supported via native style in Obscura
		}

		// Request PDF output from Obscura CDP
		const pdfData = await page.pdf({
			format: options.format ?? 'A4',
			landscape: options.landscape ?? false,
			printBackground: options.printBackground ?? true,
			scale: options.scale ?? 1,
			margin: options.margin,
		})

		return Buffer.from(pdfData)
	} finally {
		if (page) {
			await page.close().catch(() => {})
		}
		await browser.disconnect().catch(() => {})
	}
}
