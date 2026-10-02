import { describe, expect, it } from 'bun:test'
import { getBrowser } from '../service/chromium'
import { getPdf, normalizeUrl } from '../service/convert'

describe('URL Normalization', () => {
	it('should add https:// if protocol is missing', () => {
		expect(normalizeUrl('example.com')).toBe('https://example.com')
		expect(normalizeUrl('github.com/Sparticuz/chromium')).toBe(
			'https://github.com/Sparticuz/chromium',
		)
	})

	it('should keep existing http or https protocol', () => {
		expect(normalizeUrl('http://example.com')).toBe('http://example.com')
		expect(normalizeUrl('https://example.com')).toBe('https://example.com')
	})

	it('should fix collapsed slashes from path routing', () => {
		expect(normalizeUrl('https:/www.google.com/')).toBe('https://www.google.com/')
		expect(normalizeUrl('http:/example.com')).toBe('http://example.com')
		expect(normalizeUrl('https:///www.google.com/')).toBe('https://www.google.com/')
	})

	it('should throw an error on empty URL', () => {
		expect(() => normalizeUrl('')).toThrow('URL cannot be empty')
		expect(() => normalizeUrl('   ')).toThrow('URL cannot be empty')
	})
})

describe('Chromium Browser Service', () => {
	it('should resolve and launch Chromium browser instance', async () => {
		const browser = await getBrowser()
		expect(browser).toBeDefined()
		expect(browser.connected).toBe(true)
	}, 35000)
})

describe('Native PDF Generation with Chromium', () => {
	it('should generate a valid vector PDF from a webpage', async () => {
		const buffer = await getPdf('https://example.com', {
			timeout: 20000,
			waitUntil: 'load',
		})

		expect(buffer).toBeDefined()
		expect(buffer.length).toBeGreaterThan(1000)

		// A valid PDF file starts with '%PDF'
		const header = buffer.subarray(0, 4).toString('ascii')
		expect(header).toBe('%PDF')
	}, 35000)
})
