# Run Queue (50/50 Split)

Updated: 2026-02-25

## Polish (50%) — In Your Priority Order

1. Text handling first (`./external/lexical`)
- Keep xterm for terminal rendering.
- Integrate lexical where host-side text editing/formatting helps.
- Improve transcript fidelity + selection/copy reliability.

2. Rich highlighting/colors (+ sixel direction)
- Better ANSI palette/contrast.
- Capability-gated rich color path and sixel roadmap with fallback.

3. Host app sugar
- Session caching UX.
- OPFS sync to guest FS via Web API patterns (reference: `../stare-network`).

## Protocol (50%) — In Your Priority Order

1. Finish working limerick checkpoints first
- Codex ladder to limerick checkpoint.
- Gemini ladder to limerick checkpoint.

2. Start overlayfs spec implementation
- Apply spec corrections and begin parser/validator stubs.

3. Flesh out multi-cursor mode
- Port/define protocol model from `../stare-network/MULTIPLICITY_MODE.md` for xterm flow.

4. Optimization #1-#5 work (last in this bucket)
- Execute only after items 1-3 are progressing.
- Current status from `../friscy-standalone`:
  - #1 DONE
  - #2 PARTIAL
  - #3 NOT DONE
  - #4 NOT DONE
  - #5 PARTIAL

5. If capacity remains
- Make "Claude in web" more durable, faster, and less complex.

## Current Critical Blocker

- Node/Claude tty-style stdin path is not fully reliable in this app flow.
- Symptom: prompt appears, but injected input may not be consumed in Node-style REPL paths.
- This is protocol-critical because it can block CLI ladders.

