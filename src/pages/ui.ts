import type { APIRoute } from 'astro'

export const prerender = false

const manifests = import.meta.glob<{ entry: string; stylesheet: string }>(
    '../../static/ui-assets/review-manifest.json',
    { eager: true, import: 'default' }
)
const [ assets ] = Object.values( manifests )
const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow',
    // Short edge cache; hashed assets under /ui-assets/assets/ stay immutable via static/_headers.
    'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=600'
}

export const GET: APIRoute = () => {
    if ( !assets ) {
        return new Response( 'UI review assets are not available. Run pnpm build:ui.', { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } } )
    }

    return new Response( `<!doctype html>
<html lang="en" class="shadcn-scope dark" data-theme="dark">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow">
        <meta name="color-scheme" content="dark">
        <title>UI review | Does It ARM</title>
        <link rel="icon" href="/favicon.ico">
        <script>
            try {
                const query = new URLSearchParams(location.search)
                const theme = query.has('preview') ? query.get('theme') : localStorage.getItem('doesitarm.ui.theme')
                if (theme === 'light') {
                    document.documentElement.dataset.theme = 'light'
                    document.documentElement.classList.remove('dark')
                    document.querySelector('meta[name="color-scheme"]').content = 'light'
                }
            } catch {}
        </script>
        <link rel="stylesheet" href="/ui-assets/${ assets.stylesheet }">
        <script type="module" src="/ui-assets/${ assets.entry }"></script>
    </head>
    <body data-pagefind-ignore="all">
        <div id="ui-review">
            <noscript>This review needs JavaScript to display interactive examples.</noscript>
        </div>
    </body>
</html>`, { headers } )
}
