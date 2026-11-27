import fs from 'fs-extra'

import { getJson } from '~/helpers/http.js'


export const youtubeVideoPath = './static/api/youtube-videos.json'


// The YouTube Data API reader (and its googleapis dependency) was removed:
// YouTube API access is off, and the build only republishes a saved
// snapshot of the video list from VIDEO_SOURCE. If playlist reading comes
// back, add it as a separate step that writes this same JSON shape.
export async function saveYouTubeVideos () {
    const youtubeVideos = await getJson( process.env.VIDEO_SOURCE )

    await fs.outputJson( youtubeVideoPath, youtubeVideos )
}
