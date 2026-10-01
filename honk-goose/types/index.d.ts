/** What the goose is doing, as the hooks tell it. */
export type GooseMood = 'idle' | 'working' | 'alert' | 'honk' | 'angry' | 'happy' | 'sulk'

/** One thing that happened: `seq` goes up each time so the goose notices. */
export type GooseSignal = { mood: GooseMood; bubble: string; seq: number }

/** What the band hands the goose's surface module. */
export type GooseProps = { signal: GooseSignal; isWorking: boolean; pets: number }

declare module 'claude-code' {
  interface PluginState {
    'honk-goose': { signal: GooseSignal; isHidden: boolean; pets: number }
  }
}
