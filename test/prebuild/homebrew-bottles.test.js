import { describe, it, expect } from 'vitest'
import { MakeHomebrewList } from '../../helpers/build-homebrew-list.js'

describe('Homebrew Apple Silicon bottle status', () => {
    const maker = new MakeHomebrewList()
    const formula = files => ({ bottle: { stable: { files } } })

    it('recognizes old and current macOS ARM bottles', () => {
        for (const tag of ['arm64_big_sur', 'arm64_sonoma', 'arm64_sequoia', 'arm64_tahoe']) {
            expect(maker.hasArm64Formula(formula({ [tag]: {} }))).toBe(true)
        }
    })

    it('does not treat Linux, Intel or all-platform bottles as native Mac evidence', () => {
        for (const files of [{ arm64_linux: {} }, { x86_64_linux: {} }, { sonoma: {} }, { all: {} }, {}]) {
            expect(maker.hasArm64Formula(formula(files))).toBe(false)
        }
    })

    it('handles missing stable bottle metadata', () => {
        for (const data of [null, {}, { bottle: {} }, { bottle: { stable: {} } }]) {
            expect(maker.hasArm64Formula(data)).toBe(false)
        }
    })

    it('uses current formula data when a historical status is unknown', () => {
        maker.allFormulae = { deno: formula({ arm64_tahoe: {} }) }
        maker.allFormulaeArray = [{ name: 'ffmpeg', aliases: ['ffmpeg-alias'], ...formula({ arm64_sequoia: {} }) }]
        expect(maker.formulaIsNative({ fullName: 'deno', name: 'deno', status: '' })).toBe(true)
        expect(maker.formulaIsNative({ fullName: 'ffmpeg-alias', name: 'ffmpeg-alias', status: '' })).toBe(true)
        expect(maker.formulaIsNative({ fullName: 'missing', name: 'missing', status: '' })).toBe(false)
    })
})
