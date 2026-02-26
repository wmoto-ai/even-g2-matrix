/**
 * Matrix Digital Rain — enhanced algorithm with per-cell brightness tracking.
 *
 * Produces both a rich grid (for canvas preview) and plain-text lines (for G2 glasses).
 *
 * Two character sets / tuning profiles:
 * - 'preview': full-width katakana + ASCII + symbols, large grid, long trails
 * - 'g2': full-width katakana + digits (half-width katakana does NOT render on G2),
 *          aggressive tuning for ~13 cols × 8 rows display
 */

// Canvas preview: full-width katakana + ASCII + symbols
const PREVIEW_CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&*<>{}[]|~^'

// G2 glasses: full-width katakana + digits/ASCII
// Half-width katakana does NOT render on G2 → use full-width (each takes ~2x width ≈ 13 cols)
const G2_CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '0123456789'

export type CellInfo = {
  char: string
  /** 0.0 (invisible) – 1.0 (full brightness) */
  brightness: number
  /** true only for the leading character of a stream */
  isHead: boolean
}

type Column = {
  /** Current head row (can be negative = not yet on screen) */
  y: number
  /** Ticks per step: 1 = fast, 2 = slower */
  speed: number
  /** Number of visible trail characters */
  length: number
  /** Remaining gap ticks before restart */
  gap: number
}

export type MatrixState = {
  cols: number
  rows: number
  columns: Column[]
  grid: CellInfo[][]
  /** Faint background characters (static layer) */
  bgChars: string[][]
  tick: number
  /** Character set to use */
  charSet: string
  /** Decay rate per tick */
  decayRate: number
  /** Mode identifier */
  mode: 'preview' | 'g2'
}

function randomCharFrom(charSet: string): string {
  return charSet[Math.floor(Math.random() * charSet.length)]
}

export type MatrixStateOptions = {
  /** 'preview' for canvas, 'g2' for glasses (aggressive density tuning) */
  mode?: 'preview' | 'g2'
}

export function createMatrixState(
  cols: number,
  rows: number,
  opts?: MatrixStateOptions,
): MatrixState {
  const mode = opts?.mode ?? 'preview'
  const charSet = mode === 'g2' ? G2_CHARS : PREVIEW_CHARS
  const isG2 = mode === 'g2'

  const grid: CellInfo[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ char: ' ', brightness: 0, isHead: false })),
  )

  // Background: sparse dim characters (preview only — G2 can't show dim)
  const bgChars: string[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () =>
      !isG2 && Math.random() < 0.12 ? randomCharFrom(charSet) : ' ',
    ),
  )

  const columns: Column[] = Array.from({ length: cols }, () => {
    if (isG2) {
      // G2: stagger start but keep short gaps, fast speed, short trails
      return {
        y: -Math.floor(Math.random() * rows),
        speed: Math.random() < 0.7 ? 1 : 2,
        length: 2 + Math.floor(Math.random() * Math.min(5, rows - 1)),
        gap: Math.floor(Math.random() * 2),
      }
    }
    // Preview: more variety
    return {
      y: -Math.floor(Math.random() * rows * 1.5),
      speed: 1 + Math.floor(Math.random() * 3),
      length: 4 + Math.floor(Math.random() * Math.max(4, rows - 2)),
      gap: Math.floor(Math.random() * 8),
    }
  })

  return {
    cols,
    rows,
    columns,
    grid,
    bgChars,
    tick: 0,
    charSet,
    decayRate: isG2 ? 0.08 : 0.045,
    mode,
  }
}

export type MatrixFrame = {
  grid: CellInfo[][]
  bgChars: string[][]
  lines: string[]
}

export function nextMatrixFrame(state: MatrixState): MatrixFrame {
  state.tick += 1
  const { charSet, mode } = state
  const isG2 = mode === 'g2'

  // Decay all cells
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      const cell = state.grid[y][x]
      cell.isHead = false
      cell.brightness = Math.max(0, cell.brightness - state.decayRate)

      // Random character mutation in fading trails
      if (cell.brightness > 0.15 && cell.brightness < 0.7 && Math.random() < 0.04) {
        cell.char = randomCharFrom(charSet)
      }

      if (cell.brightness <= 0.01) {
        cell.char = ' '
      }
    }
  }

  // Advance columns
  for (let x = 0; x < state.cols; x++) {
    const col = state.columns[x]

    if (col.gap > 0) {
      col.gap--
      continue
    }

    if (state.tick % col.speed !== 0) continue

    col.y++

    // Place head
    if (col.y >= 0 && col.y < state.rows) {
      const cell = state.grid[col.y][x]
      cell.char = randomCharFrom(charSet)
      cell.brightness = 1.0
      cell.isHead = true
    }

    // Refresh trail brightness
    for (let t = 1; t <= col.length; t++) {
      const ty = col.y - t
      if (ty < 0 || ty >= state.rows) continue
      const cell = state.grid[ty][x]
      if (cell.char === ' ') {
        cell.char = randomCharFrom(charSet)
      }
      const trailBrightness = 1.0 - t / col.length
      cell.brightness = Math.max(cell.brightness, trailBrightness)
    }

    // Reset when column moves fully off-screen
    if (col.y - col.length > state.rows) {
      if (isG2) {
        // G2: restart quickly for maximum density
        col.y = -Math.floor(Math.random() * 2)
        col.speed = Math.random() < 0.7 ? 1 : 2
        col.length = 2 + Math.floor(Math.random() * Math.min(5, state.rows - 1))
        col.gap = Math.floor(Math.random() * 3)
      } else {
        col.y = -Math.floor(Math.random() * Math.max(4, Math.floor(state.rows * 0.6)))
        col.speed = 1 + Math.floor(Math.random() * 3)
        col.length = 4 + Math.floor(Math.random() * Math.max(4, state.rows - 2))
        col.gap = Math.floor(Math.random() * 15)
      }
    }
  }

  // Slowly mutate background characters (preview only)
  if (!isG2 && state.tick % 7 === 0) {
    const rx = Math.floor(Math.random() * state.cols)
    const ry = Math.floor(Math.random() * state.rows)
    state.bgChars[ry][rx] = Math.random() < 0.15 ? randomCharFrom(charSet) : ' '
  }

  // Plain-text lines
  const lines = state.grid.map((row) =>
    row.map((cell) => (cell.brightness > 0.08 ? cell.char : ' ')).join(''),
  )

  return { grid: state.grid, bgChars: state.bgChars, lines }
}
