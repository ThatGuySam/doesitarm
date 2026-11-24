# Homebrew range scan 1

Started 2026-11-24T00:14:46-06:00. The sample contains 9 zip, 11 dmg, 5 tar.gz, 5 pkg across 28 download hosts. 21 complete, 7 budget exhausted, 2 source error.

The catalog used 19,541,738 bytes. The CLI accepted 90,273,187 artifact bytes across 365 reported range requests, including discovery probes. The per-artifact budget was 8,388,608 bytes and the combined catalog plus artifact body budget was 271,199,978 bytes.

Only absolute HTTP ranges were requested. The observed architectures describe the named main executable. Candidate labels mark a binary observed before its plist was read. An asterisk marks fat-table entries whose thin headers were still unverified. Homebrew architecture dependencies and architecture words in the cask URL supply comparison hints. A cask URL accepted on Arm can contain a universal main executable.

The sample keeps the deprecated `codex-app` cask to cover the requested Codex desktop download. Gifski had no cask entry in this snapshot. The ZIP and DMG labels for redirect endpoints come from their expected download types.

| Cask | Detected format (or expected) | Result | Main architecture | Bytes read / size | Cask comparison | Error |
| --- | --- | --- | --- | ---: | --- | --- |
| claude | zip | complete | x86_64, arm64 | 122,570 / 404,693,227 (0.030287%) | cask URL arm64,x86_64 (consistent) | — |
| codex-app | zip | complete | arm64 | 1,933,201 / 534,731,967 (0.361527%) | cask URL arm64 (consistent) | — |
| telegram | zip | budget exhausted | x86_64, arm64* | 8,388,608 / 169,551,059 (4.947541%) | No explicit hint | byte budget reached |
| cursor | zip | complete | arm64 | 2,236,728 / 313,833,006 (0.712713%) | cask URL arm64 (consistent) | — |
| macwhisper | zip | budget exhausted | x86_64, arm64* | 8,388,608 / 169,400,912 (4.951926%) | No explicit hint | byte budget reached |
| visual-studio-code | zip | complete | arm64 | 723,062 / 393,619,875 (0.183696%) | cask URL arm64 (consistent) | — |
| appcleaner | zip | complete | x86_64, arm64 | 332,755 / 4,148,798 (8.020516%) | No explicit hint | — |
| iterm2 | zip | budget exhausted | x86_64, arm64* | 8,388,608 / 78,118,306 (10.738338%) | No explicit hint | byte budget reached |
| signal | zip | complete | arm64 | 84,504 / 145,574,721 (0.058049%) | cask URL arm64 (consistent) | — |
| zed | dmg | complete | arm64 | 905,357 / 88,779,557 (1.019781%) | cask URL arm64 (consistent) | — |
| raycast | dmg | complete | arm64 | 853,572 / 158,040,066 (0.540098%) | depends_on.arch arm64 (consistent); cask URL arm64 (consistent) | — |
| warp | (dmg) | source error | — | 0 / unknown | No explicit hint | source: range 0-0: HTTP 404 Not Found (expected 206) |
| timing | dmg | complete | x86_64, arm64 | 1,481,791 / 43,927,236 (3.373285%) | No explicit hint | — |
| little-snitch | dmg | complete | x86_64, arm64 | 1,001,246 / 38,377,961 (2.608909%) | No explicit hint | — |
| google-chrome | dmg | complete | x86_64, arm64 | 2,118,484 / 289,260,301 (0.732380%) | cask URL arm64,x86_64 (consistent) | — |
| firefox | dmg | complete | x86_64, arm64 | 770,031 / 165,761,466 (0.464542%) | No explicit hint | — |
| rider | dmg | complete | arm64 | 1,229,298 / 2,286,054,263 (0.053774%) | cask URL arm64 (consistent) | — |
| vlc | dmg | complete | arm64 | 728,379 / 56,960,605 (1.278742%) | cask URL arm64 (consistent) | — |
| gimp | dmg | complete | arm64 | 1,893,085 / 185,827,254 (1.018734%) | cask URL arm64 (consistent) | — |
| slack | dmg | complete | arm64 | 712,749 / 116,783,604 (0.610316%) | cask URL arm64 (consistent) | — |
| alfred@5 | tar.gz | complete | x86_64, arm64 | 5,308,421 / 5,620,946 (94.439993%) | No explicit hint | — |
| gitbutler | tar.gz | complete | arm64 | 327,685 / 49,036,839 (0.668243%) | cask URL arm64 (consistent) | — |
| kunkun | (tar.gz) | source error | — | 0 / unknown | cask URL arm64 (unavailable) | source: range 0-0: HTTP 200 OK (expected 206) |
| phoenix | tar.gz | complete | x86_64, arm64 | 3,997,848 / 3,997,849 (99.999975%) | No explicit hint | — |
| openpencil | tar.gz | complete | arm64 | 327,685 / 19,700,167 (1.663362%) | cask URL arm64 (consistent) | — |
| zoom | pkg | budget exhausted | arm64 (candidates) | 8,388,608 / 217,246,784 (3.861327%) | cask URL arm64 (unavailable) | byte budget reached |
| microsoft-teams | pkg | budget exhausted | arm64, x86_64 (candidates) | 8,388,608 / 375,145,288 (2.236096%) | No explicit hint | byte budget reached |
| teamviewer | pkg | budget exhausted | arm64, x86_64 (candidates) | 8,388,608 / 134,650,593 (6.229908%) | No explicit hint | byte budget reached |
| mullvad-vpn | pkg | budget exhausted | arm64, x86_64 (candidates) | 8,388,608 / 254,034,014 (3.302159%) | No explicit hint | byte budget reached |
| microsoft-auto-update | pkg | complete | x86_64, arm64 | 4,464,480 / 4,521,461 (98.739766%) | No explicit hint | — |
