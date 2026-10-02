<div align="center">
  
# vercel-pdf-converter

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.4+-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Biome](https://img.shields.io/badge/Code_Style-Biome-60a5fa?logo=biome)](https://biomejs.dev/)
[![Obscura](https://img.shields.io/badge/Browser_Engine-Obscura-orange)](https://github.com/h4ckf0r0day/obscura)

High-performance Vercel serverless function that converts webpages to PDFs using the lightweight **[Obscura](https://github.com/h4ckf0r0day/obscura)** headless browser engine.

</div>

---

## 👋 Introduction

`vercel-pdf-converter` has been updated and modernized from ground up:
- **Runtime & Package Manager**: Powered by **[Bun](https://bun.sh)** (no npm or yarn).
- **Linter & Formatter**: Configured with **[Biome](https://biomejs.dev)** (replacing legacy ESLint).
- **Language**: 100% written in **[TypeScript](https://www.typescriptlang.org/)** (`.ts`) with strict type-safety.
- **Browser Engine**: Powered by **[Obscura](https://github.com/h4ckf0r0day/obscura)** instead of Chromium/Headless Chrome.

### Why Obscura over Headless Chrome?

| Feature | Obscura | Headless Chrome |
|---|---|---|
| **Memory Consumption** | **~30 MB** | 200+ MB |
| **Binary Footprint** | **~70 MiB** | 300+ MB |
| **Startup Time** | **Instant** (~100ms) | ~2s |
| **Page Load** | **~85 ms** | ~500 ms |
| **Anti-Detection** | **Built-in** (stealth, UA impersonation, tracker blocking) | Requires 15+ external plugins |
| **Engine** | Native Rust + V8 | Heavy Chromium monolithic build |

---

## 🚀 Getting Started

### Prerequisites

- **[Bun](https://bun.sh)** installed (`curl -fsSL https://bun.sh/install | bash`)

### 1. Clone & Install

```sh
git clone https://github.com/BetaHuhn/vercel-pdf-converter.git
cd vercel-pdf-converter

# Install dependencies with Bun
bun install
```

### 2. Setup Obscura Headless Browser

You can either download the standalone Obscura binary locally or point to an existing Obscura CDP instance:

#### Option A: Local Binary (Automatic Setup)
Run the automated downloader script to fetch the Obscura binary for your OS and architecture (Linux, macOS, Windows):

```sh
bun run download-obscura
```

When running locally or during tests, the service will automatically detect and manage the Obscura server instance on demand.

#### Option B: Remote or Docker Instance
If you run Obscura in Docker or on a remote server:

```sh
docker run -d --name obscura -p 127.0.0.1:9222:9222 h4ckf0r0day/obscura
```

And set the environment variable:

```sh
export OBSCURA_WS_ENDPOINT="ws://127.0.0.1:9222"
# or
export OBSCURA_URL="http://127.0.0.1:9222"
```

---

## 🛠️ Development & Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start local development with Vercel CLI |
| `bun test` | Run test suite with Bun's native test runner |
| `bun run lint` | Check code with Biome |
| `bun run format` | Format files with Biome |
| `bun run typecheck` | Validate TypeScript types with `tsc --noEmit` |
| `bun run build` | Build client bundle and run typecheck |
| `bun run download-obscura` | Download the latest Obscura release binary |
| `bun run deploy` | Deploy to Vercel production |

---

## 📚 Usage

### Path-Based URL:

Append any target URL directly after your deployment domain:

```
https://to-pdf.vercel.app/https://github.com/h4ckf0r0day/obscura
```

### Query Parameter URL:

You can also pass `url` as a query parameter along with optional formatting options:

```
https://to-pdf.vercel.app/api?url=https://github.com/h4ckf0r0day/obscura&format=A4&landscape=false
```

### Available Query Parameters:
- `url`: The target webpage URL.
- `format`: Page format (`A4`, `Letter`, `Legal`, `Tabloid`, `A3`, `A5`, `A6`). Default is `A4`.
- `landscape`: `true` or `false` (default: `false`).
- `waitUntil`: Settle event (`networkidle2`, `load`, `domcontentloaded`, `networkidle0`). Default is `networkidle2`.

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OBSCURA_WS_ENDPOINT` | *None* | WebSocket endpoint (e.g. `ws://127.0.0.1:9222`) |
| `OBSCURA_URL` | `http://127.0.0.1:9222` | HTTP CDP endpoint URL |
| `OBSCURA_HOST` | `127.0.0.1` | Local host to bind/connect |
| `OBSCURA_PORT` | `9222` | Local port to bind/connect |
| `OBSCURA_BIN_PATH` | `./bin/obscura` or `obscura` | Path to Obscura binary |
| `OBSCURA_AUTO_SPAWN` | `true` | Automatically spawn local Obscura if not running |
| `OBSCURA_STEALTH` | `true` | Enable built-in Obscura stealth mode |
| `OBSCURA_ALLOW_PRIVATE_NETWORK` | `true` | Allow loopback/local network fetches |

---

## 📄 License

MIT © [Maximilian Schiller](LICENSE)
