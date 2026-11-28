const account = '8d4ef8fe891f53e5658d3fdd5a4c7630'
const dataset = 'doesitarm_mcp_usage'
const windows = [ 7, 30 ]

export async function usageReport ( query ) {
    const counts = `sum(_sample_interval) AS calls,
        sumIf(_sample_interval, blob3 = 'error') AS errors,
        sumIf(_sample_interval, blob3 = 'invalid') AS invalid`

    return Promise.all( windows.map( async days => {
        const from = `FROM ${ dataset } WHERE timestamp >= now() - INTERVAL '${ days }' DAY`
        const [ [ totals ], byTool, byClient, byDay ] = await Promise.all([
            query( `SELECT ${ counts } ${ from } FORMAT JSON` ),
            query( `SELECT blob1 AS tool_or_route, ${ counts } ${ from } GROUP BY blob1 ORDER BY calls DESC FORMAT JSON` ),
            query( `SELECT blob2 AS client, ${ counts } ${ from } GROUP BY blob2 ORDER BY calls DESC FORMAT JSON` ),
            query( `SELECT formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC') AS day_utc, ${ counts } ${ from } GROUP BY day_utc ORDER BY day_utc FORMAT JSON` ),
        ])
        const calls = Number( totals?.calls ?? 0 )
        const errors = Number( totals?.errors ?? 0 )
        const invalid = Number( totals?.invalid ?? 0 )
        const errorRate = calls ? `${ (100 * errors / calls).toFixed( 1 ) }%` : 'n/a'
        return { days, calls, errors, invalid, errorRate, byTool, byClient, byDay }
    }))
}

async function main () {
    const token = process.env.CLOUDFLARE_API_TOKEN
    if ( !token ) throw new Error( 'Set CLOUDFLARE_API_TOKEN with Account > Account Analytics > Read for the Does It ARM Cloudflare account.' )

    const report = await usageReport( async sql => {
        const response = await fetch( `https://api.cloudflare.com/client/v4/accounts/${ account }/analytics_engine/sql`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${ token }`, 'Content-Type': 'text/plain' },
            body: sql,
            signal: AbortSignal.timeout( 15_000 ),
        })
        if ( !response.ok ) throw new Error( `Analytics Engine SQL returned HTTP ${ response.status }.` )
        const payload = await response.json()
        if ( !Array.isArray( payload.data ) ) throw new Error( 'Analytics Engine SQL returned an unexpected result.' )
        return payload.data
    })
    for ( const { days, calls, errors, invalid, errorRate, byTool, byClient, byDay } of report ) {
        console.log( `Last ${ days } days | ${ calls } calls | ${ errors } errors (${ errorRate }) | ${ invalid } invalid` )
        console.table( byTool )
        console.table( byClient )
        console.table( byDay )
    }
}

if ( import.meta.main ) {
    try {
        await main()
    } catch ( error ) {
        console.error( error.message )
        process.exitCode = 1
    }
}
