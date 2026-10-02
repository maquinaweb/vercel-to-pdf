const go = document.getElementById('go') as (HTMLButtonElement & { href?: string }) | null
const host = document.getElementById('host') as HTMLButtonElement | null
const input = document.getElementById('url') as HTMLInputElement | null
const errorBox = document.getElementById('error') as HTMLDivElement | null
const errorMsg = document.getElementById('error-msg') as HTMLParagraphElement | null

if (host) {
	host.innerText = `${window.location.host}/`
}

const errors: Record<string, string> = {
	'400': 'Error: Could not generate PDF.',
	'404': 'Error: Invalid URL.',
	'500': 'Error: Please try again.',
}

const statusParam = (window.location.search.split('status=')[1] || '').split('&')[0]
if (statusParam && errors[statusParam]) {
	displayError(errors[statusParam])
}

export function displayError(msg?: string): void {
	if (errorMsg) {
		errorMsg.innerText = msg || 'An unknown error occurred.'
	}
	if (errorBox) {
		errorBox.style.display = 'block'
	}
}

export function generate(): void {
	if (!go?.href || go.href.trim().length === 0) {
		displayError('Please fill out the form.')
		return
	}
	go.innerText = 'Generating...'
	window.location.href = go.href
}

export function onInput(targetInput: HTMLInputElement): void {
	if (!go) return
	const protocol = window.location.protocol || 'https:'
	const value = targetInput.value.trim().replace(/^\/+/, '')
	go.href = `${protocol}//${window.location.host}/${value}`
}

export async function copy(): Promise<void> {
	if (!host) return
	const value = `${window.location.host}/`

	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(value)
		} catch {
			fallbackCopy(value)
		}
	} else {
		fallbackCopy(value)
	}

	host.title = 'Copied!'
	setTimeout(() => {
		if (host) host.title = 'Click to copy'
	}, 1200)
}

function fallbackCopy(text: string): void {
	const tempInput = document.createElement('input')
	document.body.appendChild(tempInput)
	tempInput.setAttribute('value', text)
	tempInput.select()
	document.execCommand('copy')
	document.body.removeChild(tempInput)
}

if (input) {
	input.addEventListener('keyup', (event: KeyboardEvent) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			generate()
		}
	})
	input.addEventListener('input', () => {
		onInput(input)
	})
}

if (go) {
	go.addEventListener('click', () => {
		generate()
	})
}

if (host) {
	host.addEventListener('click', () => {
		copy()
	})
}
// Attach to window for inline onclick handlers in HTML
;(window as any).copy = copy
;(window as any).generate = generate
;(window as any).onInput = onInput
