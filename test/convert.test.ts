import { describe, expect, it } from 'bun:test'
import { getPdf, normalizeUrl } from '../service/convert'
import { getObscuraConfig, isObscuraHealthy } from '../service/obscura'

describe('URL Normalization', () => {
	it('should add https:// if protocol is missing', () => {
		expect(normalizeUrl('example.com')).toBe('https://example.com')
		expect(normalizeUrl('github.com/h4ckf0r0day/obscura')).toBe(
			'https://github.com/h4ckf0r0day/obscura',
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

describe('Obscura Configuration', () => {
	it('should provide default Obscura configuration', () => {
		const config = getObscuraConfig()
		expect(config.host).toBe('127.0.0.1')
		expect(config.port).toBe(9222)
		expect(config.autoSpawn).toBe(true)
		expect(config.stealth).toBe(true)
	})

	it('should handle unreachable endpoint health check gracefully', async () => {
		const healthy = await isObscuraHealthy('http://127.0.0.1:59999', 500)
		expect(healthy).toBe(false)
	})

	it('should resolve or locate an available Obscura binary', async () => {
		const { ensureBinaryAvailable } = await import('../service/obscura')
		const binPath = await ensureBinaryAvailable()
		expect(binPath).toBeDefined()
		expect(binPath.length).toBeGreaterThan(0)
	})
})

describe('PDF Generation with Obscura', () => {
	it('should generate a valid PDF from a webpage', async () => {
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

describe('Amazon Linux / Vercel GLIBC Compatibility', () => {
	it('should not contain unpatched GLIBC_2.35 requirements in binary', async () => {
		const { readFileSync, existsSync } = await import('node:fs')
		const { join } = await import('node:path')
		const binPath = join(import.meta.dir, '..', 'bin', 'obscura')
		if (existsSync(binPath)) {
			const buf = readFileSync(binPath)
			// Ensure hypotf was patched and no GLIBC_2.35 verneed exists
			const { patchElfGlibcForAmazonLinux } = await import('../api/_service/elf-patch.js')
			// It was already patched, so patching again should return false (idempotent)
			const rePatched = patchElfGlibcForAmazonLinux(buf)
			expect(rePatched).toBe(false)
		}
	})
})
