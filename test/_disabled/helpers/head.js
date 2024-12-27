import {
    isValidHttpUrl,
    isValidImageUrl,
    isNonEmptyString,
    isPositiveNumberString
} from '~/helpers/check-types.js'

export const headPropertyTypes = {
    'meta[charset]': {
        charset: isNonEmptyString
    },

    // <meta name="viewport" content="width=device-width,initial-scale=1">
    'meta[name="viewport"]': {
        content: isNonEmptyString
    },

    // <meta property="og:image" content="https://doesitarm.com/images/og-image.png">
    'meta[property="og:image"]': {
        content: isValidImageUrl
    },

    // <meta property="og:image:width" content="1200">
    'meta[property="og:image:width"]': {
        content: isPositiveNumberString
    },

    // <meta property="og:image:height" content="627">
    'meta[property="og:image:height"]': {
        content: isPositiveNumberString
    },

    // <meta property="og:image:alt" content="Does It ARM Logo">
    'meta[property="og:image:alt"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:card" content="summary">
    'meta[property="twitter:card"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:title" content="Does It ARM">
    'meta[property="twitter:title"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:description" content="Find out the latest app support for Apple Silicon and the Apple M1 Pro and M1 Max Processors">
    'meta[property="twitter:description"]': {
        content: isNonEmptyString
    },

    // <meta property="twitter:url" content="https://doesitarm.com">
    'meta[property="twitter:url"]': {
        content: isValidHttpUrl
    },

    // <meta property="twitter:image" content="https://doesitarm.com/images/mark.png">
    'meta[property="twitter:image"]': {
        content: isValidImageUrl,
    },

    // <meta data-hid="description" name="description" content={ headDescription }>
    'meta[name="description"]': {
        content: isNonEmptyString
    },

    // <meta data-hid="twitter:title" property="twitter:title" content="Apple Silicon and Apple M1 Pro and M1 Max app and game compatibility list">
    'meta[property="twitter:title"]': {
        content: isNonEmptyString
    },

    // <link rel="icon" type="image/x-icon" href="/favicon.ico">
    'link[rel="icon"]': {
        href: isNonEmptyString
    },

    // <!-- Preconnect Assets -->
    // <link rel="preconnect" href="https://www.googletagmanager.com">
    // <link rel="preconnect" href="https://cdn.carbonads.com">
    // <link rel="preconnect" href="https://srv.carbonads.net">
    // <link rel="preconnect" href="https://cdn4.buysellads.net"></link>
    'link[rel="preconnect"]': {
        href: isValidHttpUrl
    },

    // <link rel="preload" as="image" href="large-image.webp" media="(min-width: 768px)" imagesrcset="large-image.webp, large-image-2x.webp 2x" type="image/webp" />
    'link[rel="preload"]': {
        as: isNonEmptyString,
        href: isValidHttpUrl,
        media: isNonEmptyString,
        imagesrcset: isNonEmptyString,
        type: isNonEmptyString,

        count: false
    },
}
