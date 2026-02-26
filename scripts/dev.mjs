#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { stripAnsi, toLanUrl, runCommand } from './g2-url-utils.mjs'

function printUsage() {
    console.log('Usage: pnpm dev')
    console.log('  - Vite起動後、Local URLを検出してQRコードを自動生成')
    console.log('  - QR自動生成を無効化する場合: AUTO_QR=0 pnpm dev')
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage()
    process.exit(0)
}

const autoQr = process.env.AUTO_QR !== '0'
const viteArgs = ['exec', 'vite', '--host', '0.0.0.0', '--port', '5174']
const vite = spawn('pnpm', viteArgs, {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
})

let qrStarted = false
let stdoutBuffer = ''
let stderrBuffer = ''

function maybeStartQr(line) {
    if (!autoQr || qrStarted) return
    const cleaned = stripAnsi(line)
    const match = cleaned.match(/Local:\s*(https?:\/\/localhost:\d+\/)/)
    if (!match) return

    qrStarted = true
    const localUrl = match[1]
    const qrUrl = toLanUrl(localUrl)

    console.log(`\n[QR] target: ${qrUrl}`)
    void runCommand('npx', ['-y', '@evenrealities/evenhub-cli', 'qr', '--url', qrUrl]).then((code) => {
        if (code !== 0) {
            console.warn(`[QR] evenhub-cli exited with code ${code}`)
        }
    }).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[QR] failed: ${msg}`)
    })
}

function flushLines(chunk, isErr = false) {
    const text = chunk.toString('utf8')
    if (isErr) {
        stderrBuffer += text
        const lines = stderrBuffer.split(/\r?\n/)
        stderrBuffer = lines.pop() ?? ''
        for (const line of lines) {
            process.stderr.write(line + '\n')
            maybeStartQr(line)
        }
        return
    }

    stdoutBuffer += text
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
        process.stdout.write(line + '\n')
        maybeStartQr(line)
    }
}

vite.stdout.on('data', (chunk) => flushLines(chunk, false))
vite.stderr.on('data', (chunk) => flushLines(chunk, true))

process.on('SIGINT', () => vite.kill('SIGINT'))
process.on('SIGTERM', () => vite.kill('SIGTERM'))

vite.on('exit', (code) => {
    if (stdoutBuffer) process.stdout.write(stdoutBuffer)
    if (stderrBuffer) process.stderr.write(stderrBuffer)
    process.exit(code ?? 0)
})
