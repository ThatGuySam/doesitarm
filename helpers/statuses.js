import { filterSeparator } from '~/helpers/constants.js'


const statuses = {
    'native': {
        icon: '✅',
        filterLabel: 'Native Support',
        snakeSlug: 'native',
    },
    'rosetta': {
        icon: '✳️',
        filterLabel: 'Rosetta',
        snakeSlug: 'rosetta',
    },
    'no-in-progress': {
        icon: '⏹',
        filterLabel: 'In Progress',
        snakeSlug: 'no_in_progress',
    },
    'no': {
        icon: '🚫',
        filterLabel: 'Unsupported',
        snakeSlug: 'no',
    },
    'unreported': {
        icon: '🔶',
        filterLabel: 'Unreported',
        snakeSlug: 'unreported',
    }
}

const statusesByIcon = Object.keys( statuses ).reduce( ( acc, key ) => {
    const status = statuses[ key ]
    acc[ status.icon ] = key
    return acc
}, {} )


export const statusFilterPrefix = 'status'


// Example:
// {
//     label: '✅ Native Support',
//     query: 'status_native'
// },
export const defaultStatusFilters = Object.keys( statuses ).reduce( ( acc, key ) => {
    const status = statuses[ key ]
    acc[ statusFilterPrefix + filterSeparator + key ] = status.filterLabel

    acc = [...acc, {
        label: `${ status.icon } ${ status.filterLabel }`,
        query: statusFilterPrefix + filterSeparator + status.snakeSlug
    }]
    return acc
}, [] )



export function getStatusName ( status ) {
    for (const key in statusesByIcon) {
        if (status.trim().startsWith( key )) return statusesByIcon[key]
    }

    throw new Error('Non status matched')
}

export function getStatusOfScan ( appScan, includeVersion = true ) {
    const statusName = getStatusName( appScan['Result'] )

    if (statusName === 'native') {
        return [
            '✅ Yes, Native Apple Silicon Support',
            includeVersion ? `reported as of v${appScan['App Version']}` : ''
        ].join('')
    }



    return '🔶 App has not yet been reported to be native to Apple Silicon'
}


export default statusesByIcon
