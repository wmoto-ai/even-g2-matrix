#!/usr/bin/env node
import {
    APP_TITLE,
    detectAppUrlByTitle,
    toLanUrl,
    runCommand,
} from './g2-url-utils.mjs'

function printUsage() {
    console.log('Usage: pnpm sim -- [url]')
    console.log('  - URL指定時: そのURLでシミュレーター起動')
    console.log('  - URL未指定: localhost:5174-5180 を探索し、このアプリを自動検出')
    console.log('  - QR生成を無効化する場合: AUTO_QR=0 pnpm sim')
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
    const autoQr = process.env.AUTO_QR !== '0'

    let targetUrl = parseUrlArg(process.argv)
    if (!targetUrl) {
        targetUrl = await detectAppUrlByTitle(APP_TITLE)
    }

    if (!targetUrl) {
        console.error('このアプリのdevサーバーURLを検出できませんでした。')
        console.error('先に `pnpm dev` を起動し、次を実行してください:')
        console.error('  pnpm sim -- http://localhost:<port>/')
        process.exit(1)
    }

    console.log(`Simulator target: ${targetUrl}`)

    if (autoQr) {
        const qrUrl = toLanUrl(targetUrl)
        console.log(`QR target: ${qrUrl}`)
        const qrCode = await runCommand('npx', ['-y', '@evenrealities/evenhub-cli', 'qr', '--url', qrUrl])
        if (qrCode !== 0) {
            console.warn(`QR生成に失敗しました (code=${qrCode})。シミュレーター起動は継続します。`)
        }
    }

    const simCode = await runCommand('npx', ['-y', '@evenrealities/evenhub-simulator', '--glow', targetUrl])
    process.exit(simCode)
}

void main()
