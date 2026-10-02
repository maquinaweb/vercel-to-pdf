import { describe, expect, it } from 'bun:test'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import handler from '../api/index'

function createMockReqRes(options: {
	method?: string
	url?: string
	query?: Record<string, string>
}) {
	const req = {
		method: options.method || 'GET',
		url: options.url || '/',
		query: options.query || {},
	} as unknown as VercelRequest

	let statusCode = 200
	let sentBody: any = null
	const headers: Record<string, string> = {}

	const res = {
		status: (code: number) => {
			statusCode = code
			return res
		},
		setHeader: (name: string, value: string) => {
			headers[name.toLowerCase()] = value
			return res
		},
		send: (body: any) => {
			sentBody = body
			return res
		},
		json: (body: any) => {
			sentBody = body
			return res
		},
		end: () => res,
	} as unknown as VercelResponse

	return {
		req,
		res,
		getStatus: () => statusCode,
		getBody: () => sentBody,
		getHeaders: () => headers,
	}
}

describe('API Route Handler', () => {
	it('should reject non-GET methods with 405', async () => {
		const { req, res, getStatus, getBody } = createMockReqRes({ method: 'POST' })
		await handler(req, res)
		expect(getStatus()).toBe(405)
		expect(getBody()).toEqual({ error: 'Method Not Allowed' })
	})

	it('should return 400 when no URL is provided', async () => {
		const { req, res, getStatus, getBody } = createMockReqRes({ url: '/' })
		await handler(req, res)
		expect(getStatus()).toBe(400)
		expect(getBody()).toContain('Please provide a valid URL')
	})

	it('should return 400 for favicon.ico request', async () => {
		const { req, res, getStatus } = createMockReqRes({ url: '/favicon.ico' })
		await handler(req, res)
		expect(getStatus()).toBe(400)
	})

	it('should return 400 for robots.txt request', async () => {
		const { req, res, getStatus } = createMockReqRes({ url: '/robots.txt' })
		await handler(req, res)
		expect(getStatus()).toBe(400)
	})
})
