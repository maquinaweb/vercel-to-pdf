import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PaperFormat } from 'puppeteer-core'
import { type ConvertOptions, getPdf, normalizeUrl } from './_service/convert.js'

const CACHE_MAX_AGE = 24 * 60 * 60 // 24 hours in seconds

export default async function handler(req: VercelRequest, res: VercelResponse) {
	try {
		// Only allow GET requests
		if (req.method !== 'GET') {
			return res.status(405).json({ error: 'Method Not Allowed' })
		}

		// Extract target URL from query parameter or request path
		let rawUrl = (req.query.url as string) || ''

		if (!rawUrl) {
			const pathOnly = (req.url || '').split('?')[0]
			rawUrl = pathOnly.replace(/^\/+/, '')
		}

		// Filter out static assets or empty requests
		if (!rawUrl || rawUrl === 'favicon.ico' || rawUrl === 'robots.txt' || rawUrl === 'api') {
			return res.status(400).send('Error: Please provide a valid URL to convert.')
		}

		// Validate & normalize target URL
		let targetUrl: string
		try {
			targetUrl = normalizeUrl(rawUrl)
		} catch (err: any) {
			return res.status(400).send(`Error: ${err.message || 'Invalid target URL'}`)
		}

		const format = (req.query.format as PaperFormat) || 'A4'
		const landscape = req.query.landscape === 'true' || req.query.landscape === '1'
		const waitUntil = (req.query.waitUntil as ConvertOptions['waitUntil']) || 'load'

		console.log(`[Convert] Converting URL to PDF: ${targetUrl}`)

		const pdfBuffer = await getPdf(targetUrl, {
			format,
			landscape,
			waitUntil,
		})

		if (!pdfBuffer || pdfBuffer.length === 0) {
			return res.status(500).send('Error: Could not generate PDF from URL.')
		}

		// Cache header for production
		if (process.env.NODE_ENV !== 'development') {
			res.setHeader('Cache-Control', `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}`)
		}

		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader('Content-Disposition', 'inline; filename="converted.pdf"')
		return res.send(pdfBuffer)
	} catch (err: any) {
		console.error('[Convert Error]:', err)

		if (err.message?.includes('Cannot navigate to invalid URL')) {
			return res.status(404).send('Error: Page not found or invalid URL.')
		}

		return res.status(500).send(`Error: Failed to convert page (${err.message || 'Unknown error'})`)
	}
}
