


const statuses = {
    '✅': 'native',
    '✳️': 'rosetta',
    '⏹': 'no-in-progress',
    '🚫': 'no',
    '🔶': 'unreported',
}

export function getStatusName ( status ) {
    for (const key in statuses) {
        if (status.trim().startsWith( key )) return statuses[key]
    }

    throw new Error('Non status matched')
}

export function getStatusOfScan ( appScan, includeVersion = true ) {
    const statusName = getStatusName( appScan['Result'] )

    if (statusName === 'native') {
        return [
            '✅ Yes, Full Native Apple Silicon Support',
            includeVersion ? `reported as of v${appScan['App Version']}` : ''
        ].join('')
    }



    return '🔶 App has not yet been reported to be native to Apple Silicon'
}


export default statuses
