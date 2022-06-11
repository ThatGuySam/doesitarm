export function getSymmetricDifference (a, b) {
    return [
        a.filter(x => !b.includes(x)),
        b.filter(x => !a.includes(x))
    ]
}

export function logArraysDifference (a, b) {
    const [ aOnly, bOnly ] = getSymmetricDifference(a, b)


    console.log( 'Missing from first list:', aOnly )
    console.log( 'Missing from second list:', bOnly )

    console.log( `List difference Count ${ aOnly.length } / ${ bOnly.length }`,  )

    return {
        aOnly,
        bOnly,
    }
}
