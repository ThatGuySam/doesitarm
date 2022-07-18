

export class MachoManiac {
    constructor ({ machoFileInstance, FileApi }) {
        this.machoFileInstance = machoFileInstance
        this.FileApi = FileApi
    }

    async run () {
        // import parseMacho from '~/helpers/macho/index.js'
        const { default: parseMacho } = await import( '~/helpers/macho/index.js' )

        return await parseMacho( this.machoFileInstance, this.FileApi )
    }
}


export async function extraMachoMeta ({ machoFileInstance, FileApi = null }) {
    const parsers = [
        MachoManiac
    ]

    // Run through each parser
    for ( const Parser of parsers ) {
        try {
            // Run the parser
            const parserInstance = new Parser({
                machoFileInstance,
                FileApi
            })
            const meta = await parserInstance.run()

            return meta
        } catch ( err ) {
            // console.log( 'err', err )
        }
    }

    return null
}
