exports.handler = async function(event, context) {
    const {
        //path, // Path parameter
        //httpMethod, // Incoming request’s method name
        // headers, // {Incoming request headers}
        queryStringParameters, // {query string parameters }
        // body, // A JSON string of the request payload
        // isBase64Encoded, // A boolean flag to indicate if the applicable request payload is Base64-encode
    } = event

    // console.log('queryStringParameters', queryStringParameters)

    const {
        width = 200,
        height = 100,
        heading = 'Does It ARM'
    } = queryStringParameters

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'image/svg+xml',
        },
        body: /* html */`
            <svg xmlns='http://www.w3.org/2000/svg' width='100%' height='100%' viewBox='0 0 ${ width } ${ height }'>
                <rect fill='#191a1d' width='${ width }' height='${ height }'/>
                <defs>
                    <linearGradient id='a' gradientUnits='userSpaceOnUse' x1='0' x2='0' y1='0' y2='${ height }'>
                        <stop offset='0' stop-color='#191a1d'/>
                        <stop offset='${ height }' stop-color='#292d31'/>
                    </linearGradient>
                    <linearGradient id='b' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='0' y2='${ height }'>
                        <stop offset='0' stop-color='#34393f' stop-opacity='0'/>
                        <stop offset='${ height }' stop-color='#34393f' stop-opacity='${ height }'/>
                    </linearGradient>
                    <linearGradient id='c' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='${ width }' y2='${ width }'>
                        <stop offset='0' stop-color='#34393f' stop-opacity='0'/>
                        <stop offset='${ height }' stop-color='#34393f' stop-opacity='${ height }'/>
                    </linearGradient>
                </defs>
                <rect x='0' y='0' fill='url(#a)' width='${ width }' height='${ height }'/>
                <g fill-opacity='0.5'>
                    <polygon fill='url(#b)' points='0 ${ height } 0 0 0 ${ width } 0'/>
                    <polygon fill='url(#c)' points='${ width } ${ height } ${ width } 0 0 0'/>
                </g>
                <foreignObject x="${ width * 0.1 }" y="${ height * 0.1 }" width="${ width * 0.8 }" height="${ height * 0.8 }">
                    <div
                        xmlns="http://www.w3.org/1999/xhtml"
                        style="
                            font-size: 1px;
                            color: white;
                            font-family: -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, roboto, noto, arial, sans-serif;
                            margin: 0;
                        "
                    >${ heading }</div>
                </foreignObject>
            </svg>
        `
    }
}
