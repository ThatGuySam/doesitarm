const REDIRECTS = new Map([
    [ '/categories',                { to: '/categories/',                         status: 301 } ],
    [ '/games',                     { to: '/games/',                              status: 301 } ],
    [ '/app/node',                  { to: '/app/nodejs',                          status: 301 } ],
    [ '/app/git',                   { to: '/app/git-version-control',             status: 301 } ],
    [ '/app/electron',              { to: '/app/electron-framework',              status: 301 } ],
    [ '/app/vectornator',           { to: '/app/linearity-curve',                 status: 301 } ],
    [ '/device/apple-silicon-imac', { to: '/device/m1-imac/',                     status: 307 } ],
    [ '/kind/entertainment',        { to: '/kind/entertainment-and-media-apps/',   status: 301 } ],
    [ '/kind/photo-tools',          { to: '/kind/photo-and-graphic-tools/',        status: 301 } ],
    [ '/%E3%80%82',                 { to: '/',                                    status: 301 } ],
    [ '/\u3002',                    { to: '/',                                    status: 301 } ],
])

export function getRedirectRule ( pathname ) {
    return REDIRECTS.get( pathname ) || null
}

export function isProductionHostname ( hostname ) {
    return [
        'doesitarm.com',
        'www.doesitarm.com'
    ].includes( hostname )
}
