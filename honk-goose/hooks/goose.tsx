import type { ClientSurface } from 'claude-code'

import type { GooseMood, GooseProps } from '../types'

type Pose = GooseMood | 'sleep'
type Legs = 'stand' | 'left' | 'right' | 'tucked'

// The goose's whole life, advanced one tick at a time.
type Sim = {
  x: number
  dir: -1 | 1
  target: number | null
  rest: number
  step: number
  tick: number
  pose: Pose
  poseUntil: number
  bubble: string
  seq: number
  calm: number
  blink: number
  isMoving: boolean
}

const TICK_MS = 140
const SPRITE_W = 10
const ROWS = 6
const POSE_TICKS = 22
const CHORE_TICKS = 14
const SLEEP_TICKS = 1300

// Facing left; E is the eye. Paint: w body, o orange, g wing, k eye.
const BODY = ['  __      ', '<(E )     ', '  | \\____ ', '  \\ ~~~  )', "   `----' "]
const PAINT = ['  ww      ', 'owkww     ', '  w wwwww ', '  w ggg  w', '   wwwwww ']
const LEGS: Record<Legs, string> = {
  stand: '    |  |  ',
  left: '    /  |  ',
  right: '    |  \\  ',
  tucked: '          ',
}
const LEG_PAINT = '    o  o  '
const WALK: Legs[] = ['left', 'stand', 'right', 'stand']

const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '<': '>',
  '>': '<',
  '/': '\\',
  '\\': '/',
  '`': "'",
  "'": '`',
}

const EYES: Record<Pose, string> = {
  idle: 'o',
  working: 'o',
  alert: 'O',
  honk: 'O',
  angry: '@',
  happy: '^',
  sulk: '-',
  sleep: '-',
}

type Style = { color?: string; bold?: boolean; dimColor?: boolean }

const BUBBLE_STYLE: Record<Pose, Style> = {
  idle: { dimColor: true },
  working: { color: 'cyan' },
  alert: { color: 'yellow', bold: true },
  honk: { color: 'yellow', bold: true },
  angry: { color: 'red', bold: true },
  happy: { color: 'magenta', bold: true },
  sulk: { dimColor: true },
  sleep: { color: 'blue', dimColor: true },
}

const PAINT_STYLE: Record<string, Style> = {
  o: { color: '#ff9f1c' },
  g: { dimColor: true },
  k: { bold: true },
}

const flip = (row: string) => [...row].reverse().map(c => MIRROR[c] ?? c).join('')
const reverse = (row: string) => [...row].reverse().join('')
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const roll = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1))

// The surface module's own memory. One goose per session, so one Sim.
let sim: Sim | undefined
let latest: GooseProps | undefined
let lastFrame = ''

const hatch = (props: GooseProps, width: number): Sim => ({
  x: Math.max(0, Math.floor((width - SPRITE_W) / 2)),
  dir: -1,
  target: null,
  rest: 20,
  step: 0,
  tick: 0,
  pose: props.isWorking ? 'working' : 'idle',
  poseUntil: 0,
  bubble: '',
  // Start caught up, so a remount never replays an old honk.
  seq: props.signal.seq,
  calm: 0,
  blink: 0,
  isMoving: false,
})

const setPose = (s: Sim, pose: Pose, bubble: string, ticks: number) => {
  s.pose = pose
  s.bubble = bubble
  s.poseUntil = s.tick + ticks
  s.calm = 0
}

const walkTo = (s: Sim, x: number) => {
  s.target = x
  s.rest = 0
  if (x !== s.x) {
    s.dir = x < s.x ? -1 : 1
  }
}

// One tick: notice news from the hooks, settle the mood, then move.
export const advance = (s: Sim, props: GooseProps, width: number) => {
  const maxX = Math.max(0, width - SPRITE_W)
  s.tick += 1
  s.x = clamp(s.x, 0, maxX)

  if (props.signal.seq !== s.seq) {
    s.seq = props.signal.seq
    const { mood, bubble } = props.signal
    setPose(s, mood, bubble, mood === 'working' ? CHORE_TICKS : POSE_TICKS)
    if (mood === 'angry') {
      walkTo(s, s.dir < 0 ? 0 : maxX)
    }
  }

  const isPassing = s.pose !== 'working' && s.pose !== 'idle' && s.pose !== 'sleep'
  if (isPassing && s.tick >= s.poseUntil) {
    setPose(s, props.isWorking ? 'working' : 'idle', '', 0)
  }
  if (s.pose === 'working' && s.tick >= s.poseUntil) {
    s.bubble = ''
    if (!props.isWorking) {
      s.pose = 'idle'
    }
  }
  if ((s.pose === 'idle' || s.pose === 'sleep') && props.isWorking) {
    setPose(s, 'working', '', 0)
  }
  if (s.pose === 'idle') {
    s.calm += 1
    if (s.calm > SLEEP_TICKS) {
      s.pose = 'sleep'
      s.target = null
    }
  }
  if (s.pose === 'sleep') {
    s.bubble = ['z', 'z Z', 'z Z z', ''][Math.floor(s.tick / 8) % 4] ?? ''
  }

  s.blink = s.blink > 0 ? s.blink - 1 : Math.random() < 0.02 ? 1 : 0

  // How far this tick: working geese pace, angry ones charge, idle ones dawdle.
  const speed =
    s.pose === 'angry' ? 2 : s.pose === 'working' ? 1 : s.pose === 'idle' && s.tick % 2 === 0 ? 1 : 0

  if (s.pose === 'working' && s.target === null) {
    walkTo(s, s.dir < 0 ? 0 : maxX)
  }
  if (s.pose === 'idle' && s.target === null) {
    if (s.rest > 0) {
      s.rest -= 1
      if (Math.random() < 0.025) {
        s.dir = s.dir < 0 ? 1 : -1
      }
    } else {
      walkTo(s, roll(0, maxX))
    }
  }

  s.isMoving = speed > 0 && s.target !== null && s.target !== s.x
  if (s.isMoving && s.target !== null) {
    s.x = s.target < s.x ? Math.max(s.target, s.x - speed) : Math.min(s.target, s.x + speed)
    s.step += 1
  }
  if (s.target !== null && s.target === s.x) {
    s.target = null
    if (s.pose === 'working') {
      s.dir = s.dir < 0 ? 1 : -1
    } else {
      s.rest = roll(15, 80)
    }
  }
}

type Cell = { ch: string; code: string }
type Run = { text: string; code: string }

// The band as rows of same-styled runs: the goose, and its bubble on top.
export const frame = (s: Sim, props: GooseProps, width: number): Run[][] => {
  const legs: Legs = s.pose === 'sleep' ? 'tucked' : s.isMoving ? (WALK[s.step % 4] ?? 'stand') : 'stand'
  const isFlapping = (s.pose === 'honk' || s.pose === 'angry') && Math.floor(s.tick / 2) % 2 === 0
  const eye = s.blink > 0 && s.pose === 'idle' ? '-' : EYES[s.pose]
  const body = [...BODY, LEGS[legs]].map((row, i) =>
    i === 3 && isFlapping ? row.replace('~~~', '^v^') : row,
  )
  const paint = [...PAINT, LEG_PAINT]
  const rows = (s.dir < 0 ? body : body.map(flip)).map(row => row.replace('E', eye))
  const paints = s.dir < 0 ? paint : paint.map(reverse)

  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: width }, () => ({ ch: ' ', code: ' ' })),
  )
  const put = (r: number, c: number, ch: string, code: string) => {
    const cell = grid[r]?.[c]
    if (cell !== undefined) {
      cell.ch = ch
      cell.code = code
    }
  }

  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch !== ' ') {
        put(r, s.x + c, ch, paints[r]?.[c] ?? 'w')
      }
    }),
  )

  const bubble = s.pose === 'happy' && s.bubble === '' ? `♥ ${props.pets}` : s.bubble
  if (bubble !== '') {
    const text = [...bubble].slice(0, Math.max(0, width))
    const behind = s.dir < 0 ? s.x + 5 : s.x + 5 - text.length
    const ahead = s.dir < 0 ? s.x - 1 - text.length : s.x + SPRITE_W + 1
    const fits = (at: number) => at >= 0 && at + text.length <= width
    const at = fits(behind) ? behind : fits(ahead) ? ahead : clamp(behind, 0, width - text.length)
    text.forEach((ch, i) => put(0, at + i, ch, 'b'))
  }

  return grid.map(row => {
    const end = row.map(cell => cell.ch).join('').trimEnd().length
    const runs: Run[] = []
    row.slice(0, end).forEach(({ ch, code }) => {
      const style = ch === ' ' && code !== 'b' ? ' ' : code
      const last = runs[runs.length - 1]
      if (last !== undefined && last.code === style) {
        last.text += ch
      } else {
        runs.push({ text: ch, code: style })
      }
    })

    return runs
  })
}

export default function Goose(props: GooseProps, surface: ClientSurface<number>) {
  const { Box, Text } = surface.elements
  const widthNow = () => (surface.columns > 0 ? surface.columns : 60)
  latest = props
  // A new instance (the band shown again) hatches a fresh goose.
  if (surface.state === undefined || sim === undefined) {
    sim = hatch(props, widthNow())
  }
  const s = sim

  if (surface.state === undefined) {
    let drawn = 0
    const redraw = () => {
      drawn += 1
      surface.setState(drawn)
    }
    const petted = () => {
      setPose(s, 'happy', `♥ ${(latest?.pets ?? 0) + 1}`, POSE_TICKS)
      s.target = null
      surface.post({ type: 'pet' })
      redraw()
    }

    lastFrame = ''
    surface.every(TICK_MS, () => {
      if (latest === undefined) {
        return
      }
      advance(s, latest, widthNow())
      const next = JSON.stringify(frame(s, latest, widthNow()))
      if (next !== lastFrame) {
        lastFrame = next
        redraw()
      }
    })

    // A click on the goose pets it; a click beside it calls it over.
    surface.onPointer(event => {
      if (event.type !== 'down') {
        return
      }
      if (event.x >= s.x && event.x < s.x + SPRITE_W) {
        petted()
      } else if (s.pose !== 'working' && s.pose !== 'angry') {
        setPose(s, 'alert', '?', 8)
        walkTo(s, clamp(event.x - 5, 0, Math.max(0, widthNow() - SPRITE_W)))
        redraw()
      }
    })

    // Focused by a click, p or space pets it too.
    surface.onKey(event => {
      if (event.key === 'p' || event.key === ' ') {
        petted()
      }
    })

    redraw()
  }

  // Squeezed below six rows, the goose keeps its feet and loses its bubble.
  const lines = frame(s, props, widthNow()).slice(-Math.max(1, surface.rows || ROWS))

  return (
    <Box flexDirection="column">
      {lines.map(runs => (
        <Text wrap="truncate">
          {runs.length === 0
            ? ' '
            : runs.map(run => (
                <Text {...(run.code === 'b' ? BUBBLE_STYLE[s.pose] : (PAINT_STYLE[run.code] ?? {}))}>
                  {run.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}
