# Stare Term Works Matrix

Last updated: 2026-02-26

## Runtime Status

| Area | Status | Evidence | Notes |
|---|---|---|---|
| Claude boot from checkpoint | Working | Existing session validation | Interactive stdin path fixed; runtime errors/exits surfaced in UI. |
| Gemini boot from checkpoint | Working | `preset=gemini-solo` reaches `running (tier2)` and accepts probe input | START/END + `gemini-cli fast-path` observed. |
| Codex boot from checkpoint | Working | `preset=codex-solo` reaches `running (tier2)` and accepts probe input | START/END + `codex fast-path` observed. |
| Gemini perturbation (large input/flood) | Working | 64KB, 256KB, 1MB, 4MB single-command payloads all returned success | Post-flood recovery confirmed after 100-command burst. |
| Codex perturbation (large input/flood) | Working | 64KB, 256KB, 1MB, 4MB single-command payloads all returned success | Post-flood recovery confirmed after 100-command burst. |
| Native image memory pressure (Gemini/Codex) | Working | Node in each image passed constrained-memory stress run | `heap-ok 256` and low-memory alloc logs captured. |
| Native image disk pressure (Gemini/Codex) | Working (Node path) | Node wrote 512MB to `/tmp/fill.bin` and cleanup succeeded in both images | `/dev/zero` path is unavailable; Node-based fill is the valid gate. |
| Gemini full network prompt (`gemini -p`) | Unproven in this loop | Not yet captured to completion in this app harness | Requires dedicated bounded network gate. |
| Codex full network prompt (`codex e`) | Unproven in this loop | Not yet captured to completion in this app harness | Requires dedicated bounded network gate. |
| Pause/resume control | Not wired in UI | Worker has `suspend`/`resume` handlers | No front-end controls sending these messages. |

## Fixed Today

1. Added isolated presets: `gemini-solo` and `codex-solo` in `src/App.tsx`.
2. Fixed terminal crash path: disabled WebGL addon load (canvas fallback) in `src/ui/hooks/useTerminal.ts`.
3. Kept runtime error/exit surfacing active for deterministic failure visibility.

## Known Good Inputs

| Target | Smoke command | Expected output |
|---|---|---|
| Gemini | `__GEMINI_PROBE__` | `gemini-cli fast-path` |
| Codex | `__CODEX_PROBE__` | `codex fast-path` |

## Next (P0)

1. Add bounded network-command gates for `__GEMINI_LIMERICK__` and `__CODEX_LIMERICK__` with explicit pass/fail output in this repo.
2. Flip the two `Unproven` network rows to `Working` with captured transcript evidence.
3. (Queued) ncurses-style app support research and syscall/TTY gap map.
