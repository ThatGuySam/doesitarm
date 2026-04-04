import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Zip } from 'zip-lib'

const machoObjectBase64 =
    'z/rt/gwAAAEAAAAAAQAAAAQAAABoAQAAACAAAAAAAAAZAAAA6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAiAEAAAAAAAA4AAAAAAAAAAcAAAAHAAAAAgAAAAAAAABfX3RleHQAAAAAAAAAAAAAX19URVhUAAAAAAAAAAAAAAAAAAAAAAAAFAAAAAAAAACIAQAAAgAAAAAAAAAAAAAAAAQAgAAAAAAAAAAAAAAAAF9fY29tcGFjdF91bndpbmRfX0xEAAAAAAAAAAAAAAAAGAAAAAAAAAAgAAAAAAAAAKABAAADAAAAwAEAAAEAAAAAAAACAAAAAAAAAAAAAAAAMgAAABgAAAABAAAAAAALAAACGgAAAAAAAgAAABgAAADIAQAAAwAAAPgBAAAYAAAACwAAAFAAAAAAAAAAAgAAAAIAAAABAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/QwDRAACAUv8PALn/QwCRwANf1gAAAAAAAAAAAAAAABQAAAAAEAACAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAGDQAAAA4BAAAAAAAAAAAAAAcAAAAOAgAAGAAAAAAAAAABAAAADwEAAAAAAAAAAAAAAF9tYWluAGx0bXAxAGx0bXAwAAAAAAAA'

export interface PlaywrightUploadFile {
    buffer: Buffer
    mimeType: string
    name: string
}

function makeInfoPlist ( appName: string ) {
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        '    <key>CFBundleDisplayName</key>',
        `    <string>${ appName }</string>`,
        '    <key>CFBundleExecutable</key>',
        `    <string>${ appName }</string>`,
        '    <key>CFBundleIdentifier</key>',
        `    <string>com.doesitarm.${ appName.toLowerCase().replaceAll( ' ', '-' ) }</string>`,
        '    <key>CFBundleName</key>',
        `    <string>${ appName }</string>`,
        '    <key>CFBundleShortVersionString</key>',
        '    <string>1.0.0</string>',
        '</dict>',
        '</plist>',
        ''
    ].join( '\n' )
}

export async function createNativeAppArchive ( appName = 'Playwright Native App' ): Promise<PlaywrightUploadFile> {
    const tempRoot = await mkdtemp( join( tmpdir(), 'doesitarm-playwright-' ) )
    const appBundlePath = join( tempRoot, `${ appName }.app` )
    const contentsPath = join( appBundlePath, 'Contents' )
    const executablePath = join( contentsPath, 'MacOS', appName )
    const archivePath = join( tempRoot, `${ appName }.app.zip` )

    try {
        const executableBytes = new Uint8Array( Buffer.from( machoObjectBase64, 'base64' ) )

        await mkdir( join( contentsPath, 'MacOS' ), { recursive: true } )
        await writeFile( join( contentsPath, 'Info.plist' ), makeInfoPlist( appName ) )
        await writeFile( executablePath, executableBytes, { mode: 0o755 } )

        const zip = new Zip()

        zip.addFolder( appBundlePath, `${ appName }.app` )
        await zip.archive( archivePath )

        return {
            buffer: await readFile( archivePath ),
            mimeType: 'application/zip',
            name: `${ appName }.app.zip`
        }
    } finally {
        await rm( tempRoot, {
            force: true,
            recursive: true
        } )
    }
}
