import { Buffer } from 'buffer'

import { describe, expect, it, vi } from 'vitest'

import {
  parseFileSync,
  parsePlistBuffer,
} from '~/helpers/scanner/parsers/plist-parser'

type ParsedPlist = Record<string, string>

const xmlPlist = Buffer.from(
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '    <key>CFBundleExecutable</key>',
    '    <string>Playwright Native App</string>',
    '    <key>CFBundleIdentifier</key>',
    '    <string>com.doesitarm.playwright-native-app</string>',
    '</dict>',
    '</plist>',
  ].join('\n'),
  'utf8',
)

describe('plist parser', () => {
  it('parses xml plist buffers asynchronously', async () => {
    const callback = vi.fn()
    const plist = (await parsePlistBuffer(
      xmlPlist as any,
      callback,
    )) as ParsedPlist

    expect(plist.CFBundleExecutable).toBe('Playwright Native App')
    expect(plist.CFBundleIdentifier).toBe('com.doesitarm.playwright-native-app')
    expect(callback).toHaveBeenCalledWith(null, plist)
  })

  it('parses xml plist buffers synchronously', () => {
    const plist = parseFileSync(xmlPlist as any) as ParsedPlist

    expect(plist.CFBundleExecutable).toBe('Playwright Native App')
    expect(plist.CFBundleIdentifier).toBe('com.doesitarm.playwright-native-app')
  })

  it('rejects invalid plist data', async () => {
    await expect(
      parsePlistBuffer(Buffer.from('not-a-plist', 'utf8') as any),
    ).rejects.toThrow(/Invalid binary plist/i)
  })
})
