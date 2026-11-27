// Some snapshot playlists are broad (phones, PC and AI hardware),
// so the benchmarks page only uses videos whose title is about Macs or Apple Silicon.
const macTitlePattern = /\b(mac|macs|macbooks?|imac|macos|apple silicon|m[1-9]( pro| max| ultra)?|logic pro|final cut)\b/i

export function isMacVideo ( video ) {
    return macTitlePattern.test( video?.name ?? '' )
}

// Expects videos newest first. Returns the Mac videos and the hero:
// the newest Mac benchmark, else the newest Mac video, else the newest video.
export function selectBenchmarkVideos ( videos ) {
    const macVideos = videos.filter( isMacVideo )

    const heroVideo = macVideos.find( video => video.tags.includes( 'benchmark' ) )
        ?? macVideos[0]
        ?? videos[0]

    return {
        macVideos,
        heroVideo
    }
}
