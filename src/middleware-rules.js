const REDIRECTS = new Map([
    [ '/categories',                { to: '/categories/',                         status: 301 } ],
    [ '/games',                     { to: '/games/',                              status: 301 } ],
    [ '/app/node',                  { to: '/app/nodejs',                          status: 301 } ],
    [ '/app/git',                   { to: '/app/git-version-control',             status: 301 } ],
    [ '/app/electron',              { to: '/app/electron-framework',              status: 301 } ],
    [ '/app/vectornator',           { to: '/app/linearity-curve',                 status: 301 } ],
    // Listings renamed from their scan names in the unreported scan audit (PR #1163)
    [ '/app/115',                               { to: '/app/115-desktop',                                status: 301 } ],
    [ '/app/apachedirectorystudio',             { to: '/app/apache-directory-studio',                    status: 301 } ],
    [ '/app/avidemux28app',                     { to: '/app/avidemux',                                   status: 301 } ],
    [ '/app/browserstacklocal',                 { to: '/app/browserstack-local',                         status: 301 } ],
    [ '/app/camera-settings',                   { to: '/app/logitech-camera-settings',                   status: 301 } ],
    [ '/app/cheat-engine-73',                   { to: '/app/cheat-engine',                               status: 301 } ],
    [ '/app/corel-font-manager-2021',           { to: '/app/corel-font-manager',                         status: 301 } ],
    [ '/app/corel-photo-paint-2021',            { to: '/app/corel-photo-paint',                          status: 301 } ],
    [ '/app/covenant-eyes',                     { to: '/app/victory-shield-covenant-eyes',               status: 301 } ],
    [ '/app/cradlehub',                         { to: '/app/cradle-hub',                                 status: 301 } ],
    [ '/app/crealityprint',                     { to: '/app/creality-print',                             status: 301 } ],
    [ '/app/democracy3',                        { to: '/app/democracy-3',                                status: 301 } ],
    [ '/app/deskcover-pro',                     { to: '/app/deskcover',                                  status: 301 } ],
    [ '/app/eclipse-inst',                      { to: '/app/eclipse-installer',                          status: 301 } ],
    [ '/app/eso',                               { to: '/app/the-elder-scrolls-online-eso',               status: 301 } ],
    [ '/app/icons8',                            { to: '/app/pichon-icons8',                              status: 301 } ],
    [ '/app/jetdrivetoolbox',                   { to: '/app/jetdrive-toolbox',                           status: 301 } ],
    [ '/app/kingsoft-kdocs-mac',                { to: '/app/kingsoft-kdocs',                             status: 301 } ],
    [ '/app/libreelec',                         { to: '/app/libreelec-usb-sd-creator',                   status: 301 } ],
    [ '/app/loupe-browser-6',                   { to: '/app/loupe-browser',                              status: 301 } ],
    [ '/app/maltego-4121',                      { to: '/app/maltego',                                    status: 301 } ],
    [ '/app/mixed-in-key-10',                   { to: '/app/mixed-in-key',                               status: 301 } ],
    [ '/app/mocha-pro-20205',                   { to: '/app/mocha-pro',                                  status: 301 } ],
    [ '/app/movavi-video-converter-22-premium', { to: '/app/movavi-video-converter',                     status: 301 } ],
    [ '/app/movavi-video-converter-21-premium', { to: '/app/movavi-video-converter',                     status: 301 } ],
    [ '/app/outline',                           { to: '/app/outline-client',                             status: 301 } ],
    [ '/app/philharmonik-2',                    { to: '/app/miroslav-philharmonik-2',                    status: 301 } ],
    [ '/app/photoscapex',                       { to: '/app/photoscape-x',                               status: 301 } ],
    [ '/app/pico8',                             { to: '/app/pico-8',                                     status: 301 } ],
    [ '/app/retroactive-right-click-to-open',   { to: '/app/retroactive',                                status: 301 } ],
    [ '/app/secondlife',                        { to: '/app/second-life-viewer',                         status: 301 } ],
    [ '/app/slicer-41120210226',                { to: '/app/3d-slicer-slicer',                           status: 301 } ],
    [ '/app/smartreporter-demo',                { to: '/app/smartreporter',                              status: 301 } ],
    [ '/app/soapui-572',                        { to: '/app/soapui',                                     status: 301 } ],
    [ '/app/sqlitestudio',                      { to: '/app/letos-sqlitestudio',                         status: 301 } ],
    [ '/app/stonesoft-vpn-client',              { to: '/app/forcepoint-vpn-client-stonesoft-vpn-client', status: 301 } ],
    [ '/app/timeular',                          { to: '/app/early-timeular',                             status: 301 } ],
    [ '/app/touchbarnyancat',                   { to: '/app/touchbar-nyancat',                           status: 301 } ],
    [ '/app/tutanota-desktop',                  { to: '/app/tuta-mail-tutanota-desktop',                 status: 301 } ],
    [ '/app/vcv-rack-2-free',                   { to: '/app/vcv-rack',                                   status: 301 } ],
    [ '/app/welinkmeeting',                     { to: '/app/huawei-cloud-meeting-welinkmeeting',         status: 301 } ],
    [ '/app/ytd',                               { to: '/app/ytd-video-downloader',                       status: 301 } ],
    // Listings renamed or merged in the GitHub notification backlog update
    [ '/app/imazing-2',                         { to: '/app/digidna-imazing',                            status: 301 } ],
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
