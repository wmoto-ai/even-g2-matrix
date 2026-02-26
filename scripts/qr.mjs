#!/usr/bin/env node
import { APP_TITLE, detectAppUrlByTitle, toLanUrl, runCommand } from './g2-url-utils.mjs'

function printUsage() {
    console.log('Usage: pnpm qr -- [url]')
    console.log('  - URL指定時: そのURLでQR生成')
    console.log('  - URL未指定: localhost:5174-5180 からこのアプリを自動検出')
}

function parseUrlArg(argv) {
    const args = argv.slice(2)
    if (args.includes('--help') || args.includes('-h')) {
        printUsage()
        process.exit(0)
    }

    const urlArg = args.find((arg) => /^https?:\/\//.test(arg))
    if (urlArg) return urlArg

    const envUrl = process.env.APP_URL
    if (envUrl && /^https?:\/\//.test(envUrl)) return envUrl

    return null
}

async function main() {
    let appUrl = parseUrlArg(process.argv)
    if (!appUrl) {
        appUrl = await detectAppUrlByTitle(APP_TITLE)
    }

    if (!appUrl) {
        console.error('このアプリのdevサーバーURLを検出できませんでした。')
        console.error('先に `pnpm dev` を起動してから `pnpm qr` を実行してください。')
        process.exit(1)
    }

    const qrUrl = toLanUrl(appUrl)
    console.log(`QR target: ${qrUrl}`)

    const code = await runCommand('npx', ['-y', '@evenrealities/evenhub-cli', 'qr', '--url', qrUrl])
    process.exit(code)
}

void main()
