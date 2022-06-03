// Universal JS imports only
import { makeSlug } from './slug.js'

export function makeCategorySlug ( categoryName ) {
    return makeSlug( categoryName )
}

const categoryMap = new Map([
    [ 'Business', 2 ],
    [ 'Entertainment', 5 ],
    [ 'Finance', 2 ],
    [ 'Music', 6 ],
    [ 'Photo & Video', 7 ],
    [ 'Productivity', 2 ],
    [ 'Utilities', 12 ],
    [ 'Graphics & Design', 7 ],
    [ 'Developer Tools', 1 ],
    // [ 'Name', 1 ],

    // Needs work before apps can be assigned games category
    // so for now 'Games' genre is Entertainment
    // [ 'Games', 100 ],
    [ 'Games', 5 ],
])



// Maps App Store Genre to categort IDS
export function getCategoryIdForGenre ( genreName ) {

    // If we don't have this genre mapped
    // then return nothing
    if ( !categoryMap.has(genreName) ) return null

    // return this category id mapped to this genre
    return categoryMap.get( genreName )
}

// Contains all types of properies to keep data consistent
export const categoryTemplate = {
    label: null,
    pluralLabel: null,
    itemSuffixLabel: null,
    icon: null,
    requestLinks: null,
    icon: '💻',
}

export const categories = {

    'no-category': {
        id: 0,
        label: ''
    },

    // App lists
    'developer-tools': {
        id: 1,
        ...categoryTemplate,
        label: 'Developer Tools',
        pluralLabel: 'Developer Tools',
        slug: 'developer-tools',
        snakeSlug: 'developer_tools',
    },

    'productivity-tools': {
        id: 2,
        ...categoryTemplate,
        label: 'Productivity Tools',
        pluralLabel: 'Productivity Tools',
        slug: 'productivity-tools',
        snakeSlug: 'productivity_tools',
    },

    'video-and-motion-tools': {
        id: 3,
        ...categoryTemplate,
        label: 'Video and Motion Tools',
        pluralLabel: 'Video and Motion Tools',
        slug: 'video-and-motion-tools',
        snakeSlug: 'video_and_motion_tools',
    },

    'social-and-communication': {
        id: 4,
        ...categoryTemplate,
        label: 'Social and Communication',
        pluralLabel: 'Social and Communication Apps',
        slug: 'social-and-communication',
        snakeSlug: 'social_and_communication',
    },

    'entertainment-and-media-apps': {
        id: 5,
        ...categoryTemplate,
        label: 'Entertainment and Media Apps',
        pluralLabel: 'Entertainment and Media Apps',
        slug: 'entertainment-and-media-apps',
        snakeSlug: 'entertainment_and_media_apps',
    },

    'music-and-audio-tools': {
        id: 6,
        ...categoryTemplate,
        label: 'Music and Audio Tools',
        pluralLabel: 'Music and Audio Tools',
        slug: 'music-and-audio-tools',
        snakeSlug: 'music_and_audio_tools',
    },

    'photo-and-graphic-tools': {
        id: 7,
        ...categoryTemplate,
        label: 'Photo and Graphic Tools',
        pluralLabel: 'Photo and Graphic Tools',
        slug: 'photo-and-graphic-tools',
        snakeSlug: 'photo_and_graphic_tools',
    },

    'science-and-research-software': {
        id: 8,
        ...categoryTemplate,
        label: 'Science and Research Software',
        pluralLabel: 'Science and Research Software',
        slug: 'science-and-research-software',
        snakeSlug: 'science_and_research_software',
    },

    '3d-and-architecture': {
        id: 9,
        ...categoryTemplate,
        label: '3D and Architecture',
        pluralLabel: '3D and Architecture Applications',
        slug: '3d-and-architecture',
        snakeSlug: '3d_and_architecture',
    },

    'vpns-security-and-privacy': {
        id: 10,
        ...categoryTemplate,
        label: 'VPNs, Security, and Privacy',
        pluralLabel: 'VPN, Security, and Privacy Applications',
        slug: 'vpns-security-and-privacy',
        snakeSlug: 'vpns_security_and_privacy',
    },

    'live-production-and-performance': {
        id: 11,
        ...categoryTemplate,
        label: 'Live Production and Performance',
        pluralLabel: 'Live Production and Performance Software',
        slug: 'live-production-and-performance',
        snakeSlug: 'live_production_and_performance',
    },

    'system-tools': {
        id: 12,
        ...categoryTemplate,
        label: 'System Tools',
        pluralLabel: 'System Tools',
        slug: 'system-tools',
        snakeSlug: 'system_tools',
    },

    // Special Lists
    'games': {
        id: 100,
        ...categoryTemplate,
        label: 'Games',
        pluralLabel: 'Games',
        slug: 'games',
        snakeSlug: 'games',
        icon: '🎮',
        requestLinks: [
            {
                href: 'https://forms.gle/29GWt85i1G1L7Ttj8',
                label: 'Request a Game'
            }
        ]
    },
    'homebrew': {
        id: 101,
        ...categoryTemplate,
        label: 'Homebrew',
        pluralLabel: 'Homebrew Formulae',
        itemSuffixLabel: 'via Homebrew',
        slug: 'homebrew',
        snakeSlug: 'homebrew',
        icon: '🍺'
    },


    // Uncategorized
    'uncategorized': {
        id: 1000,
        ...categoryTemplate,
        label: 'Uncategorized',
        pluralLabel: 'Uncategorized Software',
        slug: 'uncategorized',
        snakeSlug: 'uncategorized',
    },
}

// Maps categories to kinds and vice versa
const categoryToKind = {
    ...Object.fromEntries( Object.keys( categories ).map( key => [ key, key ] ) ),
    'homebrew': 'formula',
    'games': 'game',
}

// Respective directory for each category
export function getCategoryKindName ( categorySlug ) {
    return categoryToKind[ categorySlug ]
}

export function getKindToCategory ( kindSlug ) {
    return Object.keys( categories ).find( key => categoryToKind[ key ] === kind )
}

export const categoriesById = Object.fromEntries( Object.entries( categories ).map( ([ key, category ]) => [category.id, { ...category, key } ] ) )

export function getAppCategory (app) {
    if (typeof app.category === 'undefined') {
        console.log('app', app)
    }

    // If this category is not defined yet
    // then add it
    if ( !categories.hasOwnProperty( app.category.slug ) ) {
        // console.log('app', app)

        const customCategory = {
            id: null,
            ...app.category,
        }

        categories[app.category.slug] = customCategory

        console.log('Added new category', app.category.slug)
    }

    return categories[app.category.slug]
}


export function findCategoryForTagsSet ( tags ) {

    for ( const tag of tags ) {
        const categoryIdForGenre = getCategoryIdForGenre( tag )

        // Skip non-mapped genres
        if ( categoryIdForGenre === null ) continue

        // const foundCategory = categoriesById[ categoryIdForGenre ]

        // category.label = foundCategory.label
        // category.slug = foundCategory.slug

        return categoriesById[ categoryIdForGenre ]
    }

    return null
}

export function makeSummaryOfListings ({ list, length = 25 } = {}) {
    return list
        .slice(0, length)
        .map( listing => listing.name )
        .join(', ') + ', etc...'
}
