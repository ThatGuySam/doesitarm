


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

export default statuses
