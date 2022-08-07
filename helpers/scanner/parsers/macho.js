import { Buffer } from 'buffer/index.js'

import parseMacho from '../../macho/index.js'

import { Parser as MachoNodeParser } from './macho-node/parser.js'

function makeFileBuffer ( buffer ) {
    const fileBuffer = new Buffer.alloc( buffer.byteLength )

    for (var i = 0; i < buffer.length; i++)
        fileBuffer[i] = buffer[i];

    return fileBuffer
}

const machoNodeParser = new MachoNodeParser()

// Tends to not support universal architecture
// but support some MachoManiac doesn't and fails faster
// so we run it first
// https://github.com/indutny/macho
export class MachoNode {
    constructor ({ machoFileInstance, FileApi }) {
        this.machoFileInstance = machoFileInstance
        this.FileApi = FileApi
    }

    // MachNode cpu types mapped to MachoManiac cpu types
    // MachoNode types - https://github.com/indutny/macho/blob/c9d02419b36a468ebb4dcef66d0f9b98b6f22dbd/lib/macho/constants.js#L9
    // MachoManiac types - https://github.com/MTJailed/MachoManiac/blob/98d2d31d38d3ea3c911468181eed6e5f445eb556/macho.cpu.js#L13
    cpuMap = new Map([
        ['vax', 'VAX'],
        ['mc680x0', 'MC680'],
        // https://superuser.com/a/74354/412612
        ['i386', 'X86'],
        ['x86_64', 'X86'],
        ['mc98000', 'MC98000'],
        ['hppa', 'HPPA'],
        ['arm', 'ARM'],
        ['arm64', 'ARM64'],
        // arm64_32 is a variant of arm64 with 32-bit pointer sizes, used on Apple Watch Series 4 and later.
        // https://stackoverflow.com/a/68248923/1397641
        ['arm64_32', 'ARM64'],
        ['mc88000', 'MC88000'],
        ['sparc', 'SPARC'],
        ['i860', 'I860'],
        // ['alpha', '???']
        ['powerpc', 'POWERPC'],
        ['powerpc64', 'POWERPC64']
    ])

    mapNodeMetaTOManiacMeta ( machoNodeMeta ) {

        return {
            // Single entry since MachoNode doesn't support universal architectures
            architectures: [{
                bits: machoNodeMeta.bits,
                fileType: machoNodeMeta.filetype,
                // header: architecture.header,
                // loadCommandsInfo: architecture.loadCommandsInfo,
                magic: machoNodeMeta.magic,
                // offset: architecture.offset,
                processorSubType: machoNodeMeta.subtype,
                processorType: this.cpuMap.get( machoNodeMeta.cpu.type ),
            }]
        }
    }

    async run () {

        // console.log( 'this.machoFileInstance.buffer.readUInt32LE(0)', this.machoFileInstance.buffer.readUInt32LE(0).toString(16), 4277009103 )

        const machoNodeMeta = machoNodeParser.execute( this.machoFileInstance.buffer )

        return this.mapNodeMetaTOManiacMeta( machoNodeMeta )
    }
}


// https://github.com/MTJailed/MachoManiac
export class MachoManiac {
    constructor ({ machoFileInstance, FileApi }) {
        this.machoFileInstance = machoFileInstance
        this.FileApi = FileApi
    }

    async run () {
        // const { default: parseMacho } = await import( '~/helpers/macho/index.js' )

        const contextHasFileGlobal = typeof File === 'function'

        // In the Browser, MachManiac uses the File API to read the file
        // so we check if the global File API is available and convert our machoFileInstance to File API
        //
        // In the NodeJS environment, MachManiac uses the FileApi module to read the file
        // so we pass through the machoFileInstance as is
        const fileInstance = contextHasFileGlobal ? (new File( [this.machoFileInstance.blob], 'App' )) : this.machoFileInstance

        return await parseMacho( fileInstance, this.FileApi )
    }
}




export async function extractMachoMeta ({ machoFileInstance, FileApi = null }) {
    const parsers = [
        MachoNode,
        MachoManiac
    ]

    // Run through each parser
    for ( const Parser of parsers ) {
        console.log( 'Trying parser', Parser.name )

        try {
            const parserTimeout = setTimeout(() => {
                throw new Error( 'Timed out' )
            }, 60 * 1000 )

            // Run the parser
            const parserInstance = new Parser({
                machoFileInstance,
                FileApi
            })
            const meta = await parserInstance.run()

            // Clear the timeout
            clearTimeout( parserTimeout )

            return meta
        } catch ( err ) {
            console.log( 'Macho parser failed', Parser, err.message.substring(0,100) )

            continue

            // throw new Error( 'Macho parser failed' )
        }
    }

    return null
}
