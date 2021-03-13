
// Match whole word
export function matchesWholeWord (needle, haystack) {
    return new RegExp('\\b' + needle + '\\b').test(haystack)
}


export function eitherMatches (stringARaw, stringBRaw) {
    // Make strings lowercase for more generous comparison
    const stringA = stringARaw.toLowerCase()
    const stringB = stringBRaw.toLowerCase()

    const stringALength = stringA.length
    const stringBLength = stringB.length

    // If string lengths are equal
    // then just compare the equality of the strings
    if (stringALength === stringBLength) {
        // console.log('Strings are equal length', stringA, stringB)
        return (stringA === stringB)
    }

    // If string A is larger
    // then find string B within it
    if (stringALength > stringBLength) {
        // console.log('String A is bigger', stringA, stringB)
        return matchesWholeWord( stringB, stringA )
    }

    // If string B is larger
    // then find string A within it
    // console.log('String B is bigger', stringA, stringB)
    return matchesWholeWord( stringA, stringB )
}
