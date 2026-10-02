#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

const ROOT_DIR = join(import.meta.dir, '..')
const BIN_PATH = join(ROOT_DIR, 'bin', 'obscura')
const VENDOR_DIR = join(ROOT_DIR, 'vendor')
const TARGET_BR = join(VENDOR_DIR, 'obscura-linux-x64.br')

async function main() {
	if (!existsSync(BIN_PATH)) {
		console.log('[Vendor] bin/obscura not found. Downloading first...')
		const dl = Bun.spawnSync(['bun', 'run', 'scripts/download-obscura.ts'], {
			cwd: ROOT_DIR,
			stdio: ['inherit', 'inherit', 'inherit'],
		})
		if (dl.exitCode !== 0) {
			throw new Error('Failed to download obscura')
		}
	}

	console.log(`[Vendor] Preparing ${BIN_PATH} for Amazon Linux / Vercel...`)
	const raw = readFileSync(BIN_PATH)
	const { patchElfGlibcForAmazonLinux } = await import('../api/_service/elf-patch.js')

	const wasPatched = patchElfGlibcForAmazonLinux(raw)
	if (wasPatched) {
		console.log('[Vendor] Patched GLIBC requirements in binary for Amazon Linux compatibility.')
		writeFileSync(BIN_PATH, raw)
	}

	console.log(`[Vendor] Compressing with Brotli...`)
	const compressed = brotliCompressSync(raw, {
		params: {
			[constants.BROTLI_PARAM_QUALITY]: 6,
		},
	})

	if (!existsSync(VENDOR_DIR)) {
		mkdirSync(VENDOR_DIR, { recursive: true })
	}

	writeFileSync(TARGET_BR, compressed)
	const sizeMb = (compressed.length / 1024 / 1024).toFixed(2)
	console.log(`[Vendor] Successfully generated ${TARGET_BR} (${sizeMb} MB)`)
	console.log(
		'[Vendor] This file will be deployed with your Vercel functions for zero-download cold starts!',
	)
}

main().catch((err) => {
	console.error('[Vendor Error]:', err)
	process.exit(1)
})
