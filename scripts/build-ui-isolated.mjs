// Builds the /ui review assets without ever putting the site build at risk.
// The build writes to a scratch directory and replaces static/ui-assets only
// when it succeeds, so a failed build leaves the last good assets (for
// example, those restored from the CI cache) untouched. The script exits with
// a non-zero code on failure so a CI step can report it, but the workflow
// marks that step continue-on-error: the site deploy never depends on it.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath( new URL( '..', import.meta.url ) )
const scratch = fileURLToPath( new URL( '../.ui-build-tmp/', import.meta.url ) )
const target = fileURLToPath( new URL( '../static/ui-assets/', import.meta.url ) )
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

function run ( args ) {
    const result = spawnSync( pnpm, args, { cwd: root, stdio: 'inherit' } )
    return result.status === 0
}

await rm( scratch, { recursive: true, force: true } )

const built = run([ '--dir', 'ui-review', 'install', '--frozen-lockfile' ])
    && run([ '--dir', 'ui-review', 'exec', 'vite', 'build', '--outDir', scratch, '--emptyOutDir' ])
    && existsSync( `${ scratch }review-manifest.json` )

if ( !built ) {
    await rm( scratch, { recursive: true, force: true } )
    const kept = existsSync( `${ target }review-manifest.json` ) ? 'The previous /ui assets stay in place.' : '/ui will answer 503 until a build succeeds.'
    console.log( `::warning title=/ui build failed::${ kept } The site deploy is not affected.` )
    process.exit( 1 )
}

await rm( target, { recursive: true, force: true } )
await mkdir( target, { recursive: true } )
await cp( scratch, target, { recursive: true } )
await rm( scratch, { recursive: true, force: true } )
console.log( 'Built /ui assets.' )
