import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const entries = readme.split('end-of-list')[0].split('\n')
    .filter(line => /^\* \[.+\]\(.+\) - /.test(line))
    .map(line => ({ name: line.slice(3, line.indexOf('](')), text: line.split(' - ')[1].trim(), line }))

test('every README app status fits the 80-character copy budget', () => {
    assert.ok(entries.length > 800, 'Audit must cover the whole app list')
    const tooLong = entries.filter(entry => [...entry.text].length > 80)
    assert.deepEqual(tooLong.map(({ name, text }) => `${name}: ${[...text].length} characters`), [],
        'Shorten the status; preserve qualifications and link extra context in GitHub. See docs/app-flow.md.')
})

test('status detail links resolve to preserved context with sources', () => {
    const notes = readFileSync(new URL('../docs/app-status-details.md', import.meta.url), 'utf8')
    const headings = new Set([...notes.matchAll(/^## (.+)$/gm)].map(([, heading]) =>
        heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').replaceAll(' ', '-')))
    const moved = entries.filter(entry => entry.line.includes('/docs/app-status-details.md#'))
    assert.ok(moved.length >= 12)
    for (const entry of moved) {
        const anchor = entry.line.match(/\/docs\/app-status-details\.md#([^)]*)/)[1]
        assert.ok(headings.has(anchor), `${entry.name}: broken details anchor`)
        const section = notes.split(`## ${entry.name}\n`)[1]?.split('\n## ')[0]
        assert.match(section || '', /\]\(https:\/\//, `${entry.name}: missing source links`)
    }
})
