/**
 * Even G2 Bridge の初期化と抽象化
 *
 * シミュレーター/実機どちらでも動作する。
 * Bridge が見つからない場合は Mock モードにフォールバック。
 */
import {
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import { log } from './log'

export type BridgeConnection = {
  mode: 'bridge' | 'mock'
  bridge: EvenAppBridge | null
  onEvent: (handler: (event: EvenHubEvent) => void) => void
  onAudio: (handler: (pcm: Uint8Array) => void) => void
  startAudio: () => Promise<void>
  stopAudio: () => Promise<void>
}

export async function initBridge(timeoutMs = 4000): Promise<BridgeConnection> {
  let bridge: EvenAppBridge | null = null
  const eventHandlers: Array<(event: EvenHubEvent) => void> = []
  const audioHandlers: Array<(pcm: Uint8Array) => void> = []

  try {
    bridge = await Promise.race([
      waitForEvenAppBridge(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Bridge timeout')), timeoutMs)
      ),
    ])

    bridge.onEvenHubEvent((event: EvenHubEvent) => {
      // オーディオイベントの処理
      if (event.audioEvent?.audioPcm) {
        const pcm = event.audioEvent.audioPcm
        const data = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm)
        for (const handler of audioHandlers) {
          handler(data)
        }
        return
      }

      // その他のイベント（タッチ、リスト選択等）
      for (const handler of eventHandlers) {
        handler(event)
      }
    })

    log('Even Bridge 接続成功')

    return {
      mode: 'bridge',
      bridge,
      onEvent: (handler) => eventHandlers.push(handler),
      onAudio: (handler) => audioHandlers.push(handler),
      startAudio: async () => {
        await bridge!.audioControl(true)
      },
      stopAudio: async () => {
        await bridge!.audioControl(false)
      },
    }
  } catch {
    log('Even Bridge 未検出 → Mockモードで起動')
    return createMockConnection(eventHandlers, audioHandlers)
  }
}

function createMockConnection(
  eventHandlers: Array<(event: EvenHubEvent) => void>,
  audioHandlers: Array<(pcm: Uint8Array) => void>,
): BridgeConnection {
  let audioInterval: ReturnType<typeof setInterval> | null = null

  return {
    mode: 'mock',
    bridge: null,
    onEvent: (handler) => eventHandlers.push(handler),
    onAudio: (handler) => audioHandlers.push(handler),
    async startAudio() {
      log('[Mock] マイク開始（ダミーPCMデータ生成）')
      // 10msごとに40バイト（16kHz, 16bit, mono, 10msフレーム）のダミーデータを生成
      audioInterval = setInterval(() => {
        const dummy = new Uint8Array(40)
        for (let i = 0; i < dummy.length; i++) {
          dummy[i] = Math.floor(Math.random() * 256)
        }
        for (const handler of audioHandlers) {
          handler(dummy)
        }
      }, 10)
    },
    async stopAudio() {
      log('[Mock] マイク停止')
      if (audioInterval) {
        clearInterval(audioInterval)
        audioInterval = null
      }
    },
  }
}
