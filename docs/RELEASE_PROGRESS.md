# Release v1.8.0 — progress log

Tracking mechanism for the v1.8.0 release pass, opened 2026-11-17. A row is
ticked only when the evidence it names exists in the tree or on the host; the
commit column carries the SHA that made it true. The pass is also carried by
strict incremental commits — one concern per commit — so an interrupted session
loses at most the row in flight.

Scope, in four parts:

1. `README.md` describes the application as it now is.
2. Build both packages and deploy the frontend to IIS.
3. Version bump, release notes, installer bundle, tag, push, CI at the tag.
4. Live verification, with `cmms` left intact.

## Part 1 — README

| # | Item | Done | Evidence |
|---|------|------|----------|
| 1.1 | Ledger opened before any change | [x] | this file |
| 1.2 | Paper & Graphite UI described | [ ] | |
| 1.3 | 3D grid / Three.js removal reflected | [ ] | |
| 1.4 | Self-hosted IBM Plex fonts recorded | [ ] | |
| 1.5 | 8-tone status system documented | [ ] | |
| 1.6 | MTBF math fixes and the UAT recorded | [ ] | |

## Part 2 — Build and deploy

| # | Item | Done | Evidence |
|---|------|------|----------|
| 2.1 | Backend built (`npm run build`) | [ ] | |
| 2.2 | Frontend built (`npm run build`) | [ ] | |
| 2.3 | Frontend mirrored to `C:\inetpub\cmms-site` | [ ] | |
| 2.4 | New `index-*.js` served over HTTPS | [ ] | |
| 2.5 | `CommandPulseCMMSAPI` / `CommandPulseCMMSWorker` restarted | [ ] | |
| 2.6 | `/api/health` 200 after restart | [ ] | |

## Part 3 — Release engineering

| # | Item | Done | Evidence |
|---|------|------|----------|
| 3.1 | Version bump applied (`installer/wizard/CommandPulse.iss`) | [ ] | |
| 3.2 | `RELEASE_NOTES.md` v1.8.0 entry | [ ] | |
| 3.3 | Installer compiled, payload digest recorded | [ ] | |
| 3.4 | `SHA256SUMS.txt` generated for the bundle | [ ] | |
| 3.5 | Tag cut and pushed with the commits | [ ] | |
| 3.6 | CI green at the tag | [ ] | |

## Part 4 — Live verification

| # | Item | Done | Evidence |
|---|------|------|----------|
| 4.1 | Live artifacts verified (asset hashes, health) | [ ] | |
| 4.2 | `cmms` row counts unchanged against the baseline | [ ] | |
| 4.3 | Services running, no crash loop | [ ] | |

## Notes

- The live installation root is `C:\CMMS` (services run
  `C:\CMMS\backend\service\CommandPulseCMMS*.exe` against
  `C:\CMMS\backend\dist`); IIS serves the SPA from `C:\inetpub\cmms-site`.
  Confirmed on the host before any deploy step.
- `cmms` is the Client's live database. Nothing in this pass writes to it; the
  release verification reads counts only.
