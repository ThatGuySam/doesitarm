# Homebrew scanner climb

Started November 24, 2026 at 00:57 Central. Deadline 02:47 Central. The worktree is on `scanner-climb`.

## Scoreboard

| Run | ZIP | DMG | tar.gz | PKG | Total complete |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original 8 MiB run | 6/9 | 10/11 | 4/5 | 1/5 | 21/30 |

The original run recorded seven budget hits, one HTTP 404 (Warp), and one HTTP 200 to Range (Kunkun). The catalog snapshot in the build A worktree matches the SHA-256 in the original report.

## In progress

- Pin the original 30 and 70 additional regression casks and draw a disjoint 100-cask held-out set from the same catalog snapshot.
- Measure both with the unchanged scanner. Use the regression taxonomy to choose parser changes.
- Record checkpoints as each artifact finishes so an interrupted run can resume.
