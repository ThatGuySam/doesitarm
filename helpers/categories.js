
// Contains all types of properies to keep data consistent
export const categoryTemplate = {
    label: null,
    pluralLabel: null,
    itemSuffixLabel: null,
    icon: null,
    requestLinks: null
}

export const categories = {

    // App lists
    'developer-tools': {
        ...categoryTemplate,
        label: 'Developer Tools',
        pluralLabel: 'Developer Tools',
        slug: 'developer-tools',
    },
    'productivity-tools': {
        ...categoryTemplate,
        label: 'Productivity Tools',
        pluralLabel: 'Productivity Tools',
        slug: 'developer-tools',
    },
    'video-and-motion-tools': {
        ...categoryTemplate,
        label: 'Video and Motion Tools',
        pluralLabel: 'Video and Motion Tools',
        slug: 'video-and-motion-tools',
    },
    'social-and-communication': {
        ...categoryTemplate,
        label: 'Social and Communication',
        pluralLabel: 'Social and Communication Apps',
        slug: 'social-and-communication',
    },
    'entertainment-and-media-apps': {
        ...categoryTemplate,
        label: 'Entertainment and Media Apps',
        pluralLabel: 'Entertainment and Media Apps',
        slug: 'entertainment-and-media-apps',
    },
    'music-and-audio-tools': {
        ...categoryTemplate,
        label: 'Music and Audio Tools',
        pluralLabel: 'Music and Audio Tools',
        slug: 'music-and-audio-tools',
    },
    'photo-and-graphic-tools': {
        ...categoryTemplate,
        label: 'Photo and Graphic Tools',
        pluralLabel: 'Photo and Graphic Tools',
        slug: 'photo-and-graphic-tools',
    },
    'science-and-research-software': {
        ...categoryTemplate,
        label: 'Science and Research Software',
        pluralLabel: 'Science and Research Software',
        slug: 'science-and-research-software',
    },
    '3d-and-architecture': {
        ...categoryTemplate,
        label: '3D and Architecture',
        pluralLabel: '3D and Architecture Applications',
        slug: '3d-and-architecture',
    },

    // Special Lists
    'games': {
        ...categoryTemplate,
        label: 'Games',
        pluralLabel: 'Games',
        slug: 'games',
        icon: '🎮',
        requestLinks: [
            {
                href: 'https://forms.gle/29GWt85i1G1L7Ttj8',
                label: 'Request a Game'
            }
        ]
    },
    'homebrew': {
        ...categoryTemplate,
        label: 'Homebrew',
        pluralLabel: 'Homebrew Formulae',
        itemSuffixLabel: 'via Homebrew',
        slug: 'homebrew',
        icon: '🍺'
    },
}


export function getAppCategory (app) {
    if (typeof app.category === 'undefined') {
        console.log('app', app)
    }
    return categories[app.category.slug]
}
