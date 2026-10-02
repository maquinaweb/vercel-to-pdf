import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chmod, unlink } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import puppeteer, { type Browser } from 'puppeteer-core'

export interface ObscuraConfig {
	wsEndpoint?: string
	url?: string
	host: string
	port: number
	binPath?: string
	autoSpawn: boolean
	stealth: boolean
	allowPrivateNetwork: boolean
}

let obscuraProcess: ChildProcess | null = null
let isStarting = false

const OBSCURA_VERSION = process.env.OBSCURA_VERSION || 'v0.2.3'
const GITHUB_REPO = 'h4ckf0r0day/obscura'

function getReleaseAsset(): string {
	const currentPlatform = platform()
	const currentArch = arch()

	if (currentPlatform === 'linux') {
		if (currentArch === 'x64') return 'obscura-x86_64-linux.tar.gz'
		if (currentArch === 'arm64') return 'obscura-aarch64-linux.tar.gz'
	} else if (currentPlatform === 'darwin') {
		if (currentArch === 'arm64') return 'obscura-aarch64-macos.tar.gz'
		if (currentArch === 'x64') return 'obscura-x86_64-macos.tar.gz'
	} else if (currentPlatform === 'win32') {
		if (currentArch === 'x64') return 'obscura-x86_64-windows.zip'
	}
	throw new Error(`Unsupported platform or architecture: ${currentPlatform} ${currentArch}`)
}

/**
 * Ensures an Obscura binary exists on disk.
 * Supports pre-bundled Brotli compressed binaries (zero download on Vercel)
 * and falls back to /tmp download only if neither binary nor bundle exists.
 */
export async function ensureBinaryAvailable(configuredPath?: string): Promise<string> {
	const exeName = platform() === 'win32' ? 'obscura.exe' : 'obscura'

	// 1. If user explicitly provided a path and it exists
	if (configuredPath && existsSync(configuredPath)) {
		return configuredPath
	}

	// 2. Check /tmp (standard writable location in AWS Lambda / Vercel Serverless)
	const tmpPath = join('/tmp', exeName)
	if (existsSync(tmpPath)) {
		return tmpPath
	}

	// 3. Check ./bin/obscura (local development)
	const localBin = join(process.cwd(), 'bin', exeName)
	if (existsSync(localBin)) {
		return localBin
	}

	// 4. Check if `obscura` is available in PATH
	try {
		const checkPath = spawnSync(exeName, ['--version'], { encoding: 'utf8' })
		if (checkPath.status === 0) {
			return exeName
		}
	} catch {
		// Not in PATH
	}

	// 5. Check if pre-bundled compressed binary exists (e.g. deployed to Vercel in vendor/)
	const bundledBrCandidates = [
		join(process.cwd(), 'vendor', 'obscura-linux-x64.br'),
		join(process.cwd(), 'bin', 'obscura.br'),
		join(import.meta.dir, '..', '..', 'vendor', 'obscura-linux-x64.br'),
	]

	for (const brPath of bundledBrCandidates) {
		if (existsSync(brPath)) {
			console.log(`[Obscura] Found pre-bundled binary at ${brPath}. Decompressing to ${tmpPath}...`)
			const compressed = readFileSync(brPath)
			const decompressed = brotliDecompressSync(compressed)
			writeFileSync(tmpPath, decompressed, { mode: 0o755 })
			if (platform() !== 'win32') {
				await chmod(tmpPath, 0o755)
			}
			console.log(`[Obscura] Ready at ${tmpPath} (from pre-bundled package)`)
			return tmpPath
		}
	}

	// 6. Fallback: Download from release assets directly into /tmp
	const targetDir = '/tmp'
	const asset = getReleaseAsset()
	const downloadUrl =
		process.env.OBSCURA_DOWNLOAD_URL ||
		`https://github.com/${GITHUB_REPO}/releases/download/${OBSCURA_VERSION}/${asset}`

	console.log(
		`[Obscura] Binary not found. Bootstrapping Obscura in ${targetDir} from ${downloadUrl}...`,
	)

	const archivePath = join(targetDir, asset)
	const res = await fetch(downloadUrl, {
		redirect: 'follow',
		headers: { 'User-Agent': 'vercel-obscura-fetcher' },
	})

	if (!res.ok || !res.body) {
		throw new Error(
			`Failed to download Obscura binary from ${downloadUrl}: ${res.status} ${res.statusText}`,
		)
	}

	const arrayBuffer = await res.arrayBuffer()
	await Bun.write(archivePath, arrayBuffer)

	console.log(`[Obscura] Extracting ${asset} into ${targetDir}...`)
	if (asset.endsWith('.tar.gz')) {
		const tarResult = spawnSync('tar', ['-xzf', archivePath, '-C', targetDir], { stdio: 'inherit' })
		if (tarResult.status !== 0) {
			throw new Error(`Failed to extract ${asset}`)
		}
	} else if (asset.endsWith('.zip')) {
		const unzipResult = spawnSync('unzip', ['-o', archivePath, '-d', targetDir], {
			stdio: 'inherit',
		})
		if (unzipResult.status !== 0) {
			throw new Error(`Failed to unzip ${asset}`)
		}
	}

	await unlink(archivePath).catch(() => {})

	if (platform() !== 'win32' && existsSync(tmpPath)) {
		await chmod(tmpPath, 0o755)
	}

	console.log(`[Obscura] Successfully installed Obscura in ${tmpPath}`)
	return tmpPath
}

export function getObscuraConfig(): ObscuraConfig {
	const host = process.env.OBSCURA_HOST || '127.0.0.1'
	const port = Number.parseInt(process.env.OBSCURA_PORT || '9222', 10)
	const wsEndpoint = process.env.OBSCURA_WS_ENDPOINT
	const url = process.env.OBSCURA_URL || (wsEndpoint ? undefined : `http://${host}:${port}`)

	const defaultBinPath = join(
		process.cwd(),
		'bin',
		process.platform === 'win32' ? 'obscura.exe' : 'obscura',
	)
	const binPath =
		process.env.OBSCURA_BIN_PATH || (existsSync(defaultBinPath) ? defaultBinPath : undefined)

	const autoSpawn = process.env.OBSCURA_AUTO_SPAWN !== 'false'
	const stealth = process.env.OBSCURA_STEALTH !== 'false'
	const allowPrivateNetwork = process.env.OBSCURA_ALLOW_PRIVATE_NETWORK !== 'false'

	return {
		wsEndpoint,
		url,
		host,
		port,
		binPath,
		autoSpawn,
		stealth,
		allowPrivateNetwork,
	}
}

/**
 * Checks if Obscura HTTP CDP endpoint is healthy.
 */
export async function isObscuraHealthy(url: string, timeoutMs = 1500): Promise<boolean> {
	try {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeoutMs)
		const versionUrl = `${url.replace(/\/$/, '')}/json/version`
		const res = await fetch(versionUrl, { signal: controller.signal })
		clearTimeout(timer)
		return res.ok
	} catch {
		return false
	}
}

/**
 * Ensures an Obscura server is running and returns the connection target.
 */
export async function ensureObscura(config = getObscuraConfig()): Promise<{
	browserURL?: string
	browserWSEndpoint?: string
}> {
	if (config.wsEndpoint) {
		return { browserWSEndpoint: config.wsEndpoint }
	}

	const serverUrl = config.url || `http://${config.host}:${config.port}`

	// 1. Check if already running
	const healthy = await isObscuraHealthy(serverUrl)
	if (healthy) {
		return { browserURL: serverUrl }
	}

	// 2. If autoSpawn is enabled and binary is present, spawn local server
	if (config.autoSpawn) {
		if (isStarting) {
			// Wait for startup in progress
			for (let i = 0; i < 20; i++) {
				await new Promise((r) => setTimeout(r, 200))
				if (await isObscuraHealthy(serverUrl)) {
					return { browserURL: serverUrl }
				}
			}
		}

		isStarting = true
		try {
			// Resolve or bootstrap binary (decompresses from vendor/ in serverless)
			const resolvedBinPath = await ensureBinaryAvailable(config.binPath)

			console.log(
				`[Obscura] Starting local instance on port ${config.port} (${resolvedBinPath})...`,
			)
			const args = ['serve', '--port', String(config.port), '--host', config.host]

			if (config.stealth) {
				args.push('--stealth')
			}
			if (config.allowPrivateNetwork) {
				args.push('--allow-private-network')
			}

			obscuraProcess = spawn(resolvedBinPath, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				detached: false,
			})

			obscuraProcess.on('error', (err) => {
				console.error('[Obscura] Process error:', err.message)
				obscuraProcess = null
			})

			obscuraProcess.on('exit', (code, signal) => {
				if (code !== 0 && code !== null) {
					console.warn(`[Obscura] Process exited with code ${code} (signal: ${signal})`)
				}
				obscuraProcess = null
			})

			// Wait up to 5 seconds for CDP server to become ready
			const start = Date.now()
			let isUp = false
			while (Date.now() - start < 5000) {
				await new Promise((r) => setTimeout(r, 200))
				if (await isObscuraHealthy(serverUrl)) {
					isUp = true
					break
				}
			}

			if (!isUp) {
				throw new Error(
					`Obscura server failed to start on ${serverUrl}. Ensure the binary is installed or set OBSCURA_WS_ENDPOINT.`,
				)
			}

			console.log(`[Obscura] Local instance ready on ${serverUrl}`)
			return { browserURL: serverUrl }
		} finally {
			isStarting = false
		}
	}

	throw new Error(
		`No running Obscura instance found at ${serverUrl} and AUTO_SPAWN is disabled. Start one with 'obscura serve --port ${config.port}' or configure OBSCURA_WS_ENDPOINT.`,
	)
}

/**
 * Connects to Obscura via Puppeteer.
 */
export async function connectToObscura(config = getObscuraConfig()): Promise<Browser> {
	const target = await ensureObscura(config)
	if (target.browserWSEndpoint) {
		return puppeteer.connect({ browserWSEndpoint: target.browserWSEndpoint })
	}
	return puppeteer.connect({ browserURL: target.browserURL })
}

/**
 * Stops the locally spawned Obscura process if one exists.
 */
export function stopLocalObscura(): void {
	if (obscuraProcess && !obscuraProcess.killed) {
		console.log('[Obscura] Stopping local instance...')
		obscuraProcess.kill('SIGTERM')
		obscuraProcess = null
	}
}

// Cleanup on process termination
process.on('exit', () => stopLocalObscura())
process.on('SIGINT', () => {
	stopLocalObscura()
	process.exit(0)
})
process.on('SIGTERM', () => {
	stopLocalObscura()
	process.exit(0)
})
