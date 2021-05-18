

export default function ( video ) {
    const webpSource = {
        ...video.thumbnail,
        srcset: video.thumbnail.srcset.replaceAll('ytimg.com/vi/', 'ytimg.com/vi_webp/').replace(/.png|.jpg|.jpeg/g, '.webp')
    }

    const mergedSources = {
        webp: webpSource,
        jpeg: video.thumbnail
    }

    return /* html */`
<picture>

    ${ Object.entries( mergedSources ).map( ([ key, source ]) => (/* html */`
        <source
            sizes="${ source.sizes }"
            data-srcset="${ source.srcset }"
            type="image/${ key }"
        >
    `) ).join('') }

    <img
        :data-src="${ video.thumbnail.src }"
        alt="${ video.name }"
        class="absolute inset-0  h-full w-full object-cover lazyload"
    >
</picture>
    `
}
