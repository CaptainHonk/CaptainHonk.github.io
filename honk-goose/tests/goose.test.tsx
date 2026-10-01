import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'honk-goose',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
  viewport: { columns: 60, rows: 24 },
} as const

const TURN = { answer: 'done', durationMs: 10, isAborted: false, turnId: 't1' } as const

const goose = (args = '') => ({
  command: 'goose',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
}) as const

// What the band hands the goose: the hooks' latest signal, read off the Client.
const signalOf = async ($: Engine) => {
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const client = await ui.find({ type: 'Client', key: 'goose' })
  await ui.unmount()

  return (client?.props.props as { signal?: unknown } | undefined)?.signal
}

test('a finished turn makes the goose honk', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({ ...TURN, reason: 'answer' })

  expect(await signalOf($)).toMatchObject({ mood: 'honk', bubble: 'HONK!' })
})

test('a subagent finishing leaves the goose alone', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({ ...TURN, reason: 'answer', agentId: 'helper' })

  expect(await signalOf($)).toMatchObject({ mood: 'idle', seq: 0 })
})

test('an interrupted turn makes the goose sulk', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({ ...TURN, isAborted: true, reason: 'aborted' })

  expect(await signalOf($)).toMatchObject({ mood: 'sulk' })
})

test('a tool call puts the goose to work, and a failed one makes it angry', async ($, on) => {
  mock.store(on)
  let seen: unknown
  let read = async (): Promise<unknown> => undefined
  on('tool.call', async () => {
    seen = await read()

    return { result: '', isError: true, text: 'boom' } as never
  })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  read = async () => {
    const client = await ui.find({ type: 'Client', key: 'goose' })

    return (client?.props.props as { signal?: unknown } | undefined)?.signal
  }

  // Typed loosely: the full tool table is too deep to check this call against.
  const engine = $ as unknown as { tool: { call: (input: object) => Promise<unknown> } }
  await engine.tool.call({ tool: 'Bash', command: 'false' })
  await ui.unmount()

  expect(seen).toMatchObject({ mood: 'working', bubble: '*pecks the shell*' })
  expect(await signalOf($)).toMatchObject({ mood: 'angry', bubble: 'HONK!!' })
})

test('/goose hides the goose, and again brings it back', async ($, on) => {
  mock.store(on)

  expect((await $.command.run(goose())).text).toContain('wanders off')
  expect((await $.command.run(goose())).text).toContain('back')
  expect(await signalOf($)).toBeDefined()
})

test('/goose pet counts pets', async ($, on) => {
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))

  await $.command.run(goose('pet'))
  await $.command.run(goose('pet'))

  expect((await $.command.run(goose('pets'))).text).toBe('The goose has been petted 2 times.')
})

test('the goose draws above the prompt and waddles', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Client', key: 'goose' })).toBeDefined()

    const before = JSON.stringify(await ui.drawn({ in: 'goose' }))
    expect(before).toContain('__')

    await ui.advance(140 * 60)
    const after = JSON.stringify(await ui.drawn({ in: 'goose' }))
    expect(after).toContain('__')
    expect(after).not.toBe(before)
    await ui.unmount()
  }
})

test('clicking the goose pets it', async ($, on) => {
  mock.store(on)
  on('ui.toast', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  // The goose hatches in the middle of 60 columns: cells 25 to 34.
  await ui.pointer({ type: 'down', x: 28, y: 3, button: 'left' })
  await ui.advance(140)

  expect(JSON.stringify(await ui.drawn({ in: 'goose' }))).toContain('♥ 1')
  expect((await $.command.run(goose('pets'))).text).toBe('The goose has been petted 1 time.')
  await ui.unmount()
})
