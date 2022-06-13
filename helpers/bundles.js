export function supportedArchitectures ( appScan ) {
    // if ( Array.isArray(appScan['Macho Meta']) ) {
    //     return appScan['Macho Meta'].map( architecture => architecture.processorType)
    // }

    // console.log('meta', appScan['Macho Meta'])

    if ( appScan['Macho Meta'].architectures === undefined ) return []

    return appScan['Macho Meta'].architectures
        .map( architecture => architecture.processorType)
        .filter(processorType => Number(processorType) !== 0)
}
