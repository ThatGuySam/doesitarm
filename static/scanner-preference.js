(() => {
    const scannerUrl = new URL( window.location.href )
    const preference = scannerUrl.searchParams.get( 'scanner' )
    const storageKey = 'doesitarm.scanner.preview'

    try {
        if ( preference === 'next' ) {
            localStorage.setItem( storageKey, 'next' )
        } else if ( preference === 'stable' ) {
            localStorage.removeItem( storageKey )
        } else if ( localStorage.getItem( storageKey ) === 'next' ) {
            scannerUrl.searchParams.set( 'scanner', 'next' )
            window.location.replace( scannerUrl )
        }
    } catch {
        // Query switches still work when storage is blocked.
    }
})()
