import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GooseMood, GooseProps } from '../types'

const signal = atom({ plugin: 'honk-goose', key: 'signal' } as const, {
  mood: 'idle',
  bubble: '',
  seq: 0,
})
const isHidden = atom({ plugin: 'honk-goose', key: 'isHidden' } as const, false)
const pets = atom({ plugin: 'honk-goose', key: 'pets' } as const, 0)

// The goose's band: five rows of goose under one row of speech bubble.
const ROWS = 6

// What the goose is up to while each tool runs.
const CHORES: Record<string, string> = {
  Bash: '*pecks the shell*',
  Read: '*reads*',
  Edit: '*scribbles*',
  Write: '*scribbles*',
  NotebookEdit: '*scribbles*',
  Grep: '*sniffs around*',
  Glob: '*sniffs around*',
  WebFetch: '*flies off*',
  WebSearch: '*flies off*',
  Agent: '*calls the flock*',
  Skill: '*remembers*',
}

// Pet counts worth a toast.
const MILESTONES: Record<number, string> = {
  1: 'The goose allows it.',
  10: 'The goose has been petted 10 times. It tolerates you.',
  50: 'The goose has been petted 50 times. It considers you flock.',
  100: 'The goose has been petted 100 times. It would steal a sandwich for you.',
}

const chore = (tool: string) => {
  const name = tool.startsWith('mcp__') ? (tool.split('__').pop() ?? tool) : tool

  return CHORES[name] ?? `*${name.slice(0, 16)}*`
}

const say = ($: EngineInterface, mood: GooseMood, bubble: string) =>
  update($, signal, s => ({ mood, bubble, seq: s.seq + 1 }))

// Played from a timer so the turn never waits on the clip. `afplay` plays it
// on macOS; Linux and Windows terminals have no player and stay quiet.
const honkAloud = ($: EngineInterface) => {
  $.clock.after(0, () => {
    void (async () => {
      if ((await $.store.get('muted')) === true) {
        return
      }
      await $.audio.play({ asset: 'sounds/honk.wav' }).catch(() => undefined)
    })()
  })
}

const pet = async ($: EngineInterface) => {
  const count = await update($, pets, n => n + 1)
  await $.store.set('pets', count)
  const milestone = MILESTONES[count]

  if (milestone !== undefined) {
    $.ui.toast(milestone)
  }

  return count
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'goose',
      description: 'Your pet goose: hide or show it, or honk, pet, mute, unmute, pets',
      argumentHint: '[honk|pet|mute|unmute|pets]',
      immediate: true,
    })
    const wasHidden = (await $.store.get('hidden')) === true
    const petted = Number((await $.store.get('pets')) ?? 0)
    await update($, isHidden, () => wasHidden)
    await update($, pets, () => petted)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await say($, 'alert', '!')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await say($, 'working', chore(String(e.tool)))
    const ran = await next(e)

    if (ran.deny === undefined && ran.isError === true) {
      await say($, 'angry', 'HONK!!')
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId !== undefined) {
      return done
    }
    if (e.reason === 'answer') {
      await say($, 'honk', 'HONK!')
      honkAloud($)
    } else if (e.reason === 'aborted') {
      await say($, 'sulk', 'hmph.')
    } else {
      await say($, 'angry', 'HONK?!')
    }

    return done
  })

  // A click on the goose: the surface module already shows the hearts.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { type?: unknown } | null

    if (data?.type === 'pet') {
      await pet($)
    }

    return next(e)
  })

  on('command.run', { command: 'goose' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'honk') {
      await say($, 'honk', 'HONK!')
      honkAloud($)

      return { text: 'HONK!' }
    }
    if (arg === 'pet') {
      const count = await pet($)
      await say($, 'happy', `♥ ${count}`)

      return { text: 'The goose leans into it.' }
    }
    if (arg === 'mute' || arg === 'unmute') {
      await $.store.set('muted', arg === 'mute')

      return {
        text:
          arg === 'mute'
            ? 'The goose will honk silently.'
            : 'The goose will honk out loud (sound plays on macOS only).',
      }
    }
    if (arg === 'pets') {
      const count = await read($, pets)

      return { text: `The goose has been petted ${count} time${count === 1 ? '' : 's'}.` }
    }
    if (arg !== '') {
      return { text: 'Try /goose, /goose honk, /goose pet, /goose mute, /goose unmute or /goose pets.' }
    }

    const hide = !(await read($, isHidden))
    await update($, isHidden, () => hide)
    await $.store.set('hidden', hide)

    return { text: hide ? 'The goose wanders off. /goose brings it back.' : 'The goose is back.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const goose: GooseProps = {
      signal: await read($, signal),
      isWorking: e.props.isWorking,
      pets: await read($, pets),
    }
    const elements = $.ui.resolve(e)

    if (!('Client' in elements)) {
      const { Text } = elements

      return <Text>{`<(o )  ${goose.signal.bubble}`}</Text>
    }

    const { Client } = elements

    return (
      <Client
        key="goose"
        module="./goose.tsx"
        props={goose}
        width="100%"
        height={Math.max(1, Math.min(ROWS, e.props.maxRows))}
      />
    )
  })
}
