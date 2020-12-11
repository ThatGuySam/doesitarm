import statuses from '~/helpers/statuses'

export default function ( appList ) {

    const totalApps = appList.length

    // Create a totals object to collect amounts
    const totals = {}

    // Get status slugs from statuses
    Object.entries(statuses).forEach( ([_, statusSlug]) => {
        totals[statusSlug] = 0
    })

    // Count uses of each status
    appList.forEach( app => {
        // console.log('app.status', app.status)

        for (const statusKey in statuses) {
            if (app.status === statuses[statusKey]) {
                totals[app.status]++
                break
            }
        }

    })

    // console.log('totals', totals)

    const nativePercent = Number((( totals['native'] / totalApps ) * 100).toFixed(1))
    const rosettaPercent = Number((( totals['rosetta'] / totalApps ) * 100).toFixed(1))
    const unreportedPercent = Number((( totals['unreported'] / totalApps ) * 100).toFixed(1))

    const unsupportedPercent = Number((100 - (nativePercent + rosettaPercent + unreportedPercent)).toFixed(1))

    return {
        total: totalApps,
        nativePercent,
        rosettaPercent,
        unreportedPercent,
        unsupportedPercent,
    }
}
