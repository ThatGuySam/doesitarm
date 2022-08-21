

const rootThis = this

;(async function () {
    console.log( 'process.env', process.env )
    console.log( 'global', global )
    console.log( 'globalThis', globalThis )

    console.log( 'rootThis', rootThis )

    process.exit()
})()
