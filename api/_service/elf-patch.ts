/**
 * ELF binary patcher to relax GLIBC requirements for Amazon Linux / Vercel Serverless.
 *
 * Obscura v0.2.3 was compiled on Ubuntu 22.04 with glibc 2.35+, referencing `hypotf@GLIBC_2.35`.
 * Amazon Linux 2023 (and AWS Lambda / Vercel Node 20 runtime) provides glibc 2.34.
 * In glibc 2.34, `hypotf` is available under `GLIBC_2.2.5` (and glibc has supported hypotf since 2.2.5).
 *
 * This utility dynamically locates `hypotf@GLIBC_2.35` in the ELF symbol table and points it
 * to `GLIBC_2.2.5`, unlinking `GLIBC_2.35` from `.gnu.version_r` (VERNEED).
 */

export function patchElfGlibcForAmazonLinux(buf: Buffer): boolean {
	// 1. Verify ELF header
	if (buf.length < 64 || buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
		return false // Not an ELF binary
	}

	const is64 = buf[4] === 2
	const isLittle = buf[5] === 1
	if (!is64 || !isLittle) {
		return false // Only x86_64 / 64-bit LE
	}

	const e_shoff = Number(buf.readBigUInt64LE(40))
	const e_shentsize = buf.readUInt16LE(58)
	const e_shnum = buf.readUInt16LE(60)
	const e_shstrndx = buf.readUInt16LE(62)

	if (e_shoff === 0 || e_shnum === 0 || e_shstrndx >= e_shnum) {
		return false
	}

	// 2. Read section headers
	interface SectionHdr {
		name: string
		sh_name: number
		sh_type: number
		sh_offset: number
		sh_size: number
		sh_entsize: number
	}

	const shdrs: SectionHdr[] = []
	for (let i = 0; i < e_shnum; i++) {
		const off = e_shoff + i * e_shentsize
		shdrs.push({
			name: '',
			sh_name: buf.readUInt32LE(off),
			sh_type: buf.readUInt32LE(off + 4),
			sh_offset: Number(buf.readBigUInt64LE(off + 24)),
			sh_size: Number(buf.readBigUInt64LE(off + 32)),
			sh_entsize: Number(buf.readBigUInt64LE(off + 56)),
		})
	}

	const shstrtab = shdrs[e_shstrndx]
	function getShString(idx: number): string {
		let s = ''
		let p = shstrtab.sh_offset + idx
		while (p < buf.length && buf[p] !== 0) {
			s += String.fromCharCode(buf[p++])
		}
		return s
	}

	for (const s of shdrs) {
		s.name = getShString(s.sh_name)
	}

	const dynsym = shdrs.find((s) => s.name === '.dynsym')
	const dynstr = shdrs.find((s) => s.name === '.dynstr')
	const gnuVer = shdrs.find((s) => s.name === '.gnu.version')
	const gnuVerR = shdrs.find((s) => s.name === '.gnu.version_r')

	if (!dynsym || !dynstr || !gnuVer || !gnuVerR) {
		return false
	}

	const dynstrOffset = dynstr.sh_offset
	function getDynString(idx: number): string {
		let s = ''
		let p = dynstrOffset + idx
		while (p < buf.length && buf[p] !== 0) {
			s += String.fromCharCode(buf[p++])
		}
		return s
	}

	// 3. Scan .gnu.version_r for libm.so.6 and GLIBC_2.35 / GLIBC_2.2.5
	let glibc225Index: number | null = null
	let glibc235Index: number | null = null
	let patchedVerneed = false

	let vn_off = gnuVerR.sh_offset
	while (vn_off < gnuVerR.sh_offset + gnuVerR.sh_size) {
		const vn_file_name = getDynString(buf.readUInt32LE(vn_off + 4))
		const vn_cnt = buf.readUInt16LE(vn_off + 2)
		const vn_aux = buf.readUInt32LE(vn_off + 8)
		const vn_next = buf.readUInt32LE(vn_off + 12)

		if (vn_file_name.includes('libm')) {
			let vna_off = vn_off + vn_aux
			let prev_vna_off: number | null = null

			for (let i = 0; i < vn_cnt; i++) {
				const vna_other = buf.readUInt16LE(vna_off + 6)
				const vna_name = getDynString(buf.readUInt32LE(vna_off + 8))
				const vna_next = buf.readUInt32LE(vna_off + 12)

				if (vna_name === 'GLIBC_2.2.5') {
					glibc225Index = vna_other
				}

				if (vna_name === 'GLIBC_2.35') {
					glibc235Index = vna_other
					// Unlink GLIBC_2.35 from the vernaux chain
					if (prev_vna_off !== null) {
						buf.writeUInt32LE(vna_next, prev_vna_off + 12)
						buf.writeUInt16LE(vn_cnt - 1, vn_off + 2)
						patchedVerneed = true
					}
				} else {
					prev_vna_off = vna_off
				}

				if (vna_next === 0) break
				vna_off += vna_next
			}
		}

		if (vn_next === 0) break
		vn_off += vn_next
	}

	if (!patchedVerneed || glibc235Index === null || glibc225Index === null) {
		// Either already patched or not requiring GLIBC_2.35
		return false
	}

	// 4. Update symbols in dynsym referencing glibc235Index to glibc225Index
	let patchedSymbols = 0
	const numSyms = dynsym.sh_entsize > 0 ? dynsym.sh_size / dynsym.sh_entsize : 0
	for (let i = 0; i < numSyms; i++) {
		const symOff = dynsym.sh_offset + i * dynsym.sh_entsize
		const st_name = buf.readUInt32LE(symOff)
		const name = getDynString(st_name)

		const verOff = gnuVer.sh_offset + i * 2
		const ver = buf.readUInt16LE(verOff)

		if (name === 'hypotf' && ver === glibc235Index) {
			buf.writeUInt16LE(glibc225Index, verOff)
			patchedSymbols++
		}
	}

	return patchedVerneed && patchedSymbols > 0
}
