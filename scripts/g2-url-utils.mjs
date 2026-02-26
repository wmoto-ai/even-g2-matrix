import os from 'node:os'
import { spawn } from 'node:child_process'

export const APP_TITLE = '<title>Even G2 Matrix Rain</title>'
export const DEFAULT_PORTS = [5174, 5175, 5176, 5177, 5178, 5179, 5180]

export function stripAnsi(text) {
    return text.replace(/\u001b\[[0-9;]*m/g, '')
}

export async function fetchWithTimeout(url, timeoutMs = 1200) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) return null
        return await res.text()
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

export async function detectAppUrlByTitle(title = APP_TITLE, ports = DEFAULT_PORTS) {
    for (const port of ports) {
        const url = `http://localhost:${port}/`
        const html = await fetchWithTimeout(url)
        if (!html) continue
        if (html.includes(title)) return url
    }
    return null
}

function isPrivateV4(ip) {
    return (
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    )
}

export function getLanIp() {
    const nets = os.networkInterfaces()
    const candidates = []

    for (const group of Object.values(nets)) {
        if (!group) continue
        for (const net of group) {
            if (net.family !== 'IPv4' || net.internal) continue
            candidates.push(net.address)
        }
    }

    const privateIp = candidates.find(isPrivateV4)
    return privateIp ?? candidates[0] ?? null
}

export function toLanUrl(urlString) {
    const parsed = new URL(urlString)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        const lanIp = getLanIp()
        if (lanIp) parsed.hostname = lanIp
    }
    return parsed.toString()
}

export function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: false,
        })

        child.on('error', reject)
        child.on('exit', (code) => resolve(code ?? 0))
    })
}
