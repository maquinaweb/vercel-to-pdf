#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chmod } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { join } from 'node:path'

const OBSCURA_VERSION = process.env.OBSCURA_VERSION || 'v0.2.3'
const GITHUB_REPO = 'h4ckf0r0day/obscura'
const BIN_DIR = join(import.meta.dir, '..', 'bin')
const isWindows = platform() === 'win32'
const binaryName = isWindows ? 'obscura.exe' : 'obscura'
const targetBinaryPath = join(BIN_DIR, binaryName)

function getReleaseAsset(): string {
	const currentPlatform = platform()
	const currentArch = arch()

	if (currentPlatform === 'linux') {
		if (currentArch === 'x64') {
			return 'obscura-x86_64-linux.tar.gz'
		}
		if (currentArch === 'arm64') {
			return 'obscura-aarch64-linux.tar.gz'
		}
	} else if (currentPlatform === 'darwin') {
		if (currentArch === 'arm64') {
			return 'obscura-aarch64-macos.tar.gz'
		}
		if (currentArch === 'x64') {
			return 'obscura-x86_64-macos.tar.gz'
		}
	} else if (currentPlatform === 'win32') {
		if (currentArch === 'x64') {
			return 'obscura-x86_64-windows.zip'
		}
	}

	throw new Error(`Unsupported platform or architecture: ${currentPlatform} ${currentArch}`)
}

async function main() {
	const force = process.argv.includes('--force')

	if (!force && existsSync(targetBinaryPath)) {
		console.log(`[Obscura] Binary already exists at ${targetBinaryPath}`)
		try {
			const check = spawnSync(targetBinaryPath, ['--version'], { encoding: 'utf8' })
			if (check.status === 0) {
				console.log(`[Obscura] Verified version: ${check.stdout.trim()}`)
				return
			}
		} catch {
			console.log('[Obscura] Existing binary failed version check. Re-downloading...')
		}
	}

	const asset = getReleaseAsset()
	const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/${OBSCURA_VERSION}/${asset}`
	console.log(
		`[Obscura] Downloading ${OBSCURA_VERSION} for ${platform()}-${arch()} from ${downloadUrl}...`,
	)

	if (!existsSync(BIN_DIR)) {
		mkdirSync(BIN_DIR, { recursive: true })
	}

	const tempArchive = join(BIN_DIR, asset)

	const response = await fetch(downloadUrl, {
		redirect: 'follow',
		headers: {
			'User-Agent': 'bun-obscura-downloader',
		},
	})

	if (!response.ok || !response.body) {
		throw new Error(`Failed to download ${downloadUrl}: ${response.status} ${response.statusText}`)
	}

	const file = Bun.file(tempArchive)
	await Bun.write(file, response)
	console.log(`[Obscura] Downloaded ${asset} successfully. Extracting...`)

	if (asset.endsWith('.tar.gz')) {
		const tarResult = spawnSync('tar', ['-xzf', tempArchive, '-C', BIN_DIR], { stdio: 'inherit' })
		if (tarResult.status !== 0) {
			throw new Error(`Failed to extract ${asset}`)
		}
	} else if (asset.endsWith('.zip')) {
		const unzipResult = spawnSync('unzip', ['-o', tempArchive, '-d', BIN_DIR], { stdio: 'inherit' })
		if (unzipResult.status !== 0) {
			throw new Error(`Failed to unzip ${asset}`)
		}
	}

	// Clean up archive
	try {
		const rmResult = spawnSync('rm', ['-f', tempArchive])
		if (rmResult.status !== 0 && isWindows) {
			spawnSync('cmd', ['/c', 'del', tempArchive])
		}
	} catch {
		// Ignore cleanup error
	}

	if (!isWindows && existsSync(targetBinaryPath)) {
		if (platform() === 'linux') {
			try {
				const { readFileSync, writeFileSync } = await import('node:fs')
				const { patchElfGlibcForAmazonLinux } = await import('../api/_service/elf-patch.js')
				const raw = readFileSync(targetBinaryPath)
				if (patchElfGlibcForAmazonLinux(raw)) {
					writeFileSync(targetBinaryPath, raw)
					console.log('[Obscura] Applied GLIBC compatibility patch for Amazon Linux.')
				}
			} catch (e) {
				console.warn('[Obscura] Could not apply glibc patch:', e)
			}
		}
		await chmod(targetBinaryPath, 0o755)
	}

	const verify = spawnSync(targetBinaryPath, ['--version'], { encoding: 'utf8' })
	if (verify.status !== 0) {
		throw new Error(`Failed to verify obscura binary at ${targetBinaryPath}`)
	}

	console.log(`[Obscura] Installed successfully: ${verify.stdout.trim()}`)
	console.log(`[Obscura] Binary path: ${targetBinaryPath}`)
}

main().catch((err) => {
	console.error('[Obscura] Error installing Obscura:', err)
	process.exit(1)
})
