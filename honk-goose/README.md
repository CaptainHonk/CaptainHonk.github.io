# Honk Goose

A pet goose for Claude Code. It waddles in a strip above the prompt box and reacts to what Claude is doing:

- wanders, blinks and naps when nothing is happening
- paces with a bubble for each tool Claude runs (`*pecks the shell*`, `*scribbles*`, `*sniffs around*`)
- flaps and yells **HONK!** when Claude finishes, and plays `sounds/honk.wav` (macOS only)
- charges across the strip yelling `HONK!!` when a tool fails, and says `hmph.` if you interrupt
- click it to pet it (hearts, and a count kept between sessions); click beside it to call it over

The strip shows in the terminal and in the desktop app's Code tab, not on mobile.

## Commands

| Command | Does |
| --- | --- |
| `/goose` | hide or show the goose |
| `/goose honk` | honk now |
| `/goose pet` | pet it without a mouse |
| `/goose pets` | how many times it has been petted |
| `/goose mute` / `/goose unmute` | turn the honk sound off or on |

## Running it

For one terminal session, from wherever this folder is:

```sh
claude --plugin-dir ./honk-goose
```

To have it every time (the desktop app included), copy this folder somewhere permanent, such as
`~/.claude/mods/honk-goose`, and name it in the `env` block of `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/honk-goose"
  }
}
```

## Checking it

```sh
claude plugin validate ./honk-goose
claude plugin test ./honk-goose
```

Built against Claude Code 2.1.287. The mod API is early access, so a later release may need small fixes.
