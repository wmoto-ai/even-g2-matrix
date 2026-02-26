import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerProperty,
  ImageContainerProperty,
  ImageRawDataUpdate,
} from '@evenrealities/even_hub_sdk'
import { initBridge, type BridgeConnection } from './bridge'
import { createMatrixState, nextMatrixFrame, type CellInfo, type MatrixState } from './matrix-rain'
import { log } from './log'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MatrixRuntime = {
  conn: BridgeConnection
  timer: ReturnType<typeof setInterval> | null
  initialized: boolean
  frame: number
  /** Large state for canvas preview */
  previewState: MatrixState
  /** State for G2 glasses (rendered as image) */
  g2State: MatrixState
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FRAME_MS = 80 // preview frame interval

// G2 image: 2 containers stacked vertically (each 200x100, total 200x200)
const G2_IMG_W = 200
const G2_CONTAINER_H = 100 // max per container
const G2_TOTAL_H = G2_CONTAINER_H * 2 // 200px total height

// Grid size for G2 image rendering (based on total 200x200 canvas)
const G2_IMG_CELL_W = 8
const G2_IMG_CELL_H = 10
const G2_IMG_COLS = Math.floor(G2_IMG_W / G2_IMG_CELL_W) // 25
const G2_IMG_ROWS = Math.floor(G2_TOTAL_H / G2_IMG_CELL_H) // 20

// Center the 200x200 image area on 576x288 display
const G2_IMG_X = Math.floor((576 - G2_IMG_W) / 2) // 188
const G2_IMG_Y_TOP = Math.floor((288 - G2_TOTAL_H) / 2) // 44
const G2_IMG_Y_BOTTOM = G2_IMG_Y_TOP + G2_CONTAINER_H // 144

// Canvas preview cell sizing
const CELL_W = 18
const CELL_H = 22

/* ------------------------------------------------------------------ */
/*  DOM setup                                                          */
/* ------------------------------------------------------------------ */

const appRoot = document.querySelector<HTMLDivElement>('#app')!
appRoot.innerHTML = `
  <style>
    :root { color-scheme: dark; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #000;
      color: #7CFC7C;
      overflow: hidden;
    }
    #app {
      height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 0;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      padding: 8px 12px;
      background: rgba(0,0,0,0.85);
      border-bottom: 1px solid #0a3a0a;
      z-index: 10;
    }
    .btn {
      background: #062006;
      color: #9dff9d;
      border: 1px solid #1f7a1f;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-family: inherit;
      font-size: 13px;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn:not(:disabled):hover { background: #0a350a; border-color: #3a3; }
    .status { color: #99ff99; opacity: 0.9; font-size: 13px; }
    #matrix-canvas {
      width: 100%;
      height: 100%;
      display: block;
      background: #000;
    }
    #event-log {
      max-height: 140px;
      overflow: auto;
      border-top: 1px solid #0a3a0a;
      padding: 6px 10px;
      color: #448844;
      background: rgba(0,4,0,0.92);
      font-size: 11px;
      line-height: 1.3;
      z-index: 10;
      white-space: pre-wrap;
    }
  </style>

  <div class="toolbar">
    <button id="connect-btn" class="btn" type="button">Connect Glasses</button>
    <button id="start-btn" class="btn" type="button" disabled>Start Matrix</button>
    <button id="stop-btn" class="btn" type="button" disabled>Stop</button>
    <span id="connection-status" class="status">未接続</span>
  </div>

  <canvas id="matrix-canvas"></canvas>
  <pre id="event-log"></pre>
`

const canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const statusEl = document.getElementById('connection-status') as HTMLSpanElement
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
const startBtn = document.getElementById('start-btn') as HTMLButtonElement
const stopBtn = document.getElementById('stop-btn') as HTMLButtonElement

/* ------------------------------------------------------------------ */
/*  G2 offscreen canvases (image rendering for glasses)                */
/* ------------------------------------------------------------------ */

// Full-size offscreen canvas for rendering the complete Matrix rain
const g2Canvas = document.createElement('canvas')
g2Canvas.width = G2_IMG_W
g2Canvas.height = G2_TOTAL_H
const g2Ctx = g2Canvas.getContext('2d')!

// Two smaller canvases to extract top/bottom halves as separate PNGs
const g2TopCanvas = document.createElement('canvas')
g2TopCanvas.width = G2_IMG_W
g2TopCanvas.height = G2_CONTAINER_H
const g2TopCtx = g2TopCanvas.getContext('2d')!

const g2BottomCanvas = document.createElement('canvas')
g2BottomCanvas.width = G2_IMG_W
g2BottomCanvas.height = G2_CONTAINER_H
const g2BottomCtx = g2BottomCanvas.getContext('2d')!

/** Render Matrix rain to full offscreen canvas, then split into top/bottom PNGs */
async function renderG2Images(grid: CellInfo[][]): Promise<{ top: number[]; bottom: number[] }> {
  // Draw to full 200x200 canvas
  g2Ctx.fillStyle = '#000000'
  g2Ctx.fillRect(0, 0, G2_IMG_W, G2_TOTAL_H)

  const fontSize = Math.floor(G2_IMG_CELL_H * 0.9)
  g2Ctx.font = `bold ${fontSize}px "MS Gothic", "Hiragino Kaku Gothic ProN", monospace`
  g2Ctx.textBaseline = 'top'
  g2Ctx.shadowColor = 'transparent'
  g2Ctx.shadowBlur = 0

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x]
      if (cell.brightness <= 0.03) continue

      const px = x * G2_IMG_CELL_W
      const py = y * G2_IMG_CELL_H

      if (cell.isHead) {
        g2Ctx.fillStyle = '#ffffff'
      } else {
        const g = Math.floor(cell.brightness * 255)
        g2Ctx.fillStyle = `rgb(${Math.floor(g * 0.3)}, ${g}, ${Math.floor(g * 0.2)})`
      }

      g2Ctx.fillText(cell.char, px, py)
    }
  }

  // Split into top half (y=0..99) and bottom half (y=100..199)
  g2TopCtx.drawImage(g2Canvas, 0, 0, G2_IMG_W, G2_CONTAINER_H, 0, 0, G2_IMG_W, G2_CONTAINER_H)
  g2BottomCtx.drawImage(g2Canvas, 0, G2_CONTAINER_H, G2_IMG_W, G2_CONTAINER_H, 0, 0, G2_IMG_W, G2_CONTAINER_H)

  // Convert both to PNG number[]
  const [topBlob, bottomBlob] = await Promise.all([
    new Promise<Blob>((resolve) => g2TopCanvas.toBlob((b) => resolve(b!), 'image/png')),
    new Promise<Blob>((resolve) => g2BottomCanvas.toBlob((b) => resolve(b!), 'image/png')),
  ])

  const [topBuf, bottomBuf] = await Promise.all([topBlob.arrayBuffer(), bottomBlob.arrayBuffer()])

  return {
    top: Array.from(new Uint8Array(topBuf)),
    bottom: Array.from(new Uint8Array(bottomBuf)),
  }
}

/* ------------------------------------------------------------------ */
/*  Preview canvas helpers                                             */
/* ------------------------------------------------------------------ */

function calcPreviewSize(): { cols: number; rows: number } {
  const w = canvas.clientWidth || window.innerWidth
  const h = canvas.clientHeight || window.innerHeight - 100
  return {
    cols: Math.max(20, Math.floor(w / CELL_W)),
    rows: Math.max(10, Math.floor(h / CELL_H)),
  }
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function renderCanvas(grid: CellInfo[][], bgChars: string[][]) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight

  ctx.fillStyle = 'rgba(0, 0, 0, 0.82)'
  ctx.fillRect(0, 0, w, h)

  const fontSize = CELL_H * 0.78
  ctx.font = `${fontSize}px "MS Gothic", "Hiragino Kaku Gothic ProN", monospace`
  ctx.textBaseline = 'top'

  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  for (let y = 0; y < bgChars.length; y++) {
    for (let x = 0; x < bgChars[y].length; x++) {
      if (bgChars[y][x] === ' ') continue
      if (grid[y] && grid[y][x] && grid[y][x].brightness > 0.1) continue
      ctx.fillStyle = 'rgba(0, 180, 40, 0.05)'
      ctx.fillText(bgChars[y][x], x * CELL_W + 2, y * CELL_H + 2)
    }
  }

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const cell = grid[y][x]
      if (cell.brightness <= 0.02) continue

      const px = x * CELL_W + 2
      const py = y * CELL_H + 2
      const b = cell.brightness

      if (cell.isHead) {
        ctx.shadowColor = '#00ff41'
        ctx.shadowBlur = 20
        ctx.fillStyle = `rgba(255, 255, 255, ${0.85 + b * 0.15})`
        ctx.fillText(cell.char, px, py)
        ctx.shadowBlur = 35
        ctx.fillStyle = `rgba(200, 255, 200, 0.4)`
        ctx.fillText(cell.char, px, py)
      } else if (b > 0.75) {
        ctx.shadowColor = '#00ff41'
        ctx.shadowBlur = 10
        ctx.fillStyle = `rgba(0, 255, 65, ${b})`
        ctx.fillText(cell.char, px, py)
      } else if (b > 0.4) {
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = `rgba(0, 200, 50, ${b * 0.9})`
        ctx.fillText(cell.char, px, py)
      } else {
        ctx.shadowBlur = 0
        ctx.shadowColor = 'transparent'
        ctx.fillStyle = `rgba(0, 160, 40, ${b * 0.7})`
        ctx.fillText(cell.char, px, py)
      }
    }
  }

  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
}

/* ------------------------------------------------------------------ */
/*  G2 Bridge (image-based, 2 containers)                              */
/* ------------------------------------------------------------------ */

let runtime: MatrixRuntime | null = null
let g2InFlight = false

function updateStatus(text: string) {
  statusEl.textContent = text
}

async function initG2ImagePage(conn: BridgeConnection) {
  if (!conn.bridge) return

  // SDK requires exactly one container with isEventCapture=1 per page.
  // ImageContainerProperty does NOT have isEventCapture, so we add
  // a minimal text container alongside the image containers.
  const eventCaptureText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 40,
    height: 20,
    containerID: 10,
    containerName: 'matrix-evt',
    content: ' ',
    isEventCapture: 1,
  })

  const imageTop = new ImageContainerProperty({
    xPosition: G2_IMG_X,
    yPosition: G2_IMG_Y_TOP,
    width: G2_IMG_W,
    height: G2_CONTAINER_H,
    containerID: 1,
    containerName: 'matrix-top',
  })

  const imageBottom = new ImageContainerProperty({
    xPosition: G2_IMG_X,
    yPosition: G2_IMG_Y_BOTTOM,
    width: G2_IMG_W,
    height: G2_CONTAINER_H,
    containerID: 2,
    containerName: 'matrix-btm',
  })

  log(`G2 page作成中 (2 images: ${G2_IMG_W}x${G2_TOTAL_H} at x=${G2_IMG_X})`)

  const startupPayload = new CreateStartUpPageContainer({
    containerTotalNum: 3,
    textObject: [eventCaptureText],
    listObject: [],
    imageObject: [imageTop, imageBottom],
  })

  const startupResult = await conn.bridge.createStartUpPageContainer(startupPayload)
  log(`createStartUpPageContainer result: ${startupResult}`)

  if (startupResult !== 0 && startupResult !== 1) {
    log('startup failed, trying rebuildPageContainer...')
    const rebuildPayload = new RebuildPageContainer({
      containerTotalNum: 3,
      textObject: [eventCaptureText],
      listObject: [],
      imageObject: [imageTop, imageBottom],
    })
    const rebuildResult = await conn.bridge.rebuildPageContainer(rebuildPayload)
    log(`rebuildPageContainer result: ${rebuildResult}`)
  }

  log('G2 page 作成完了')
}

/** Send top and bottom images sequentially (SDK requires sequential updates) */
async function pushG2ImageFrames(
  conn: BridgeConnection,
  images: { top: number[]; bottom: number[] },
) {
  if (!conn.bridge) return

  // Top container
  const topResult = await conn.bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: 1,
      containerName: 'matrix-top',
      imageData: images.top,
    }),
  )
  if (topResult !== 'success' && topResult !== undefined) {
    log(`G2 image top: ${topResult}`)
  }

  // Bottom container (must wait for top to complete)
  const bottomResult = await conn.bridge.updateImageRawData(
    new ImageRawDataUpdate({
      containerID: 2,
      containerName: 'matrix-btm',
      imageData: images.bottom,
    }),
  )
  if (bottomResult !== 'success' && bottomResult !== undefined) {
    log(`G2 image bottom: ${bottomResult}`)
  }
}

/* ------------------------------------------------------------------ */
/*  Frame loop                                                         */
/* ------------------------------------------------------------------ */

// G2 is low FPS due to BLE transfer (now 2 images per frame),
// so advance multiple simulation ticks per frame to compensate
const G2_TICKS_PER_FRAME = 4

async function runFrame() {
  if (!runtime) return

  // Always update & render preview (fast)
  const preview = nextMatrixFrame(runtime.previewState)
  renderCanvas(preview.grid, preview.bgChars)

  // Update G2 glasses (image-based, decoupled from preview)
  if (runtime.conn.mode === 'bridge' && !g2InFlight) {
    g2InFlight = true
      ; (async () => {
        try {
          let g2Frame!: ReturnType<typeof nextMatrixFrame>
          for (let i = 0; i < G2_TICKS_PER_FRAME; i++) {
            g2Frame = nextMatrixFrame(runtime!.g2State)
          }
          const images = await renderG2Images(g2Frame.grid)
          await pushG2ImageFrames(runtime!.conn, images)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          log(`G2 frame error: ${msg}`)
        } finally {
          g2InFlight = false
        }
      })()
  }

  runtime.frame += 1
}

async function startMatrix() {
  if (!runtime || runtime.timer) return

  resizeCanvas()
  const { cols, rows } = calcPreviewSize()
  runtime.previewState = createMatrixState(cols, rows, { mode: 'preview' })

  if (runtime.conn.mode === 'bridge') {
    if (!runtime.initialized) {
      await initG2ImagePage(runtime.conn)
      // Send first frame
      const g2 = nextMatrixFrame(runtime.g2State)
      const images = await renderG2Images(g2.grid)
      await pushG2ImageFrames(runtime.conn, images)
      runtime.initialized = true
    }
  }

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)

  runtime.timer = setInterval(() => {
    void runFrame()
  }, FRAME_MS)

  startBtn.disabled = true
  stopBtn.disabled = false
  updateStatus(
    runtime.conn.mode === 'bridge'
      ? '接続済み (Bridge) / Matrix再生中 [Image Mode]'
      : '接続済み (Mock) / ローカル再生中',
  )
  log(`Matrix rain 開始 (G2: ${G2_IMG_COLS}x${G2_IMG_ROWS} image @ ${G2_IMG_W}x${G2_TOTAL_H}px, 2 containers)`)
}

function stopMatrix() {
  if (!runtime?.timer) return
  clearInterval(runtime.timer)
  runtime.timer = null
  g2InFlight = false
  startBtn.disabled = false
  stopBtn.disabled = true
  updateStatus(
    runtime.conn.mode === 'bridge'
      ? '接続済み (Bridge) / 停止中'
      : '接続済み (Mock) / 停止中',
  )
  log('Matrix rain 停止')
}

/* ------------------------------------------------------------------ */
/*  Event handlers                                                     */
/* ------------------------------------------------------------------ */

connectBtn.addEventListener('click', async () => {
  connectBtn.disabled = true
  updateStatus('接続中...')

  try {
    const conn = await initBridge(5000)
    const { cols, rows } = calcPreviewSize()
    runtime = {
      conn,
      timer: null,
      initialized: false,
      frame: 0,
      previewState: createMatrixState(cols, rows, { mode: 'preview' }),
      g2State: createMatrixState(G2_IMG_COLS, G2_IMG_ROWS, { mode: 'g2' }),
    }

    updateStatus(conn.mode === 'bridge' ? '接続済み (Bridge)' : '接続済み (Mock)')
    startBtn.disabled = false
    log(`Matrix simulator 接続: mode=${conn.mode}`)
  } catch (err) {
    connectBtn.disabled = false
    const message = err instanceof Error ? err.message : String(err)
    updateStatus(`接続失敗: ${message}`)
    log(`Matrix simulator 接続失敗: ${message}`)
  }
})

startBtn.addEventListener('click', () => {
  void startMatrix()
})

stopBtn.addEventListener('click', () => {
  stopMatrix()
})

window.addEventListener('resize', () => {
  if (!runtime) return
  resizeCanvas()
  const { cols, rows } = calcPreviewSize()
  if (cols !== runtime.previewState.cols || rows !== runtime.previewState.rows) {
    runtime.previewState = createMatrixState(cols, rows, { mode: 'preview' })
  }
})

resizeCanvas()
