function escapeRegex ( string ) {
    // No `-` here: the pattern uses the `u` flag, where `\-` outside a class is invalid.
    return string.replace(/[\/\\^$*+?.()|[\]{}]/g, '\\$&')
}

const wordCharacter = /[\p{L}\p{N}_]/u

// Match whole word.
// The needle must not be glued to a letter or digit in front of it, so `.NET`
// does not match inside `Battle.net`. A needle ending in a letter or digit must
// not be glued to one after it either. Trailing punctuation such as `++` stays
// free, so `Xournal++` still matches in `Xournal++Portable`.
export function matchesWholeWord (needle, haystack) {
    if ( needle.length === 0 ) return false

    const endsInWordCharacter = wordCharacter.test( needle.at( -1 ) )
    const pattern = '(?<![\\p{L}\\p{N}_])' + escapeRegex( needle ) + ( endsInWordCharacter ? '(?![\\p{L}\\p{N}_])' : '' )

    return new RegExp( pattern, 'u' ).test( haystack )
}

export function fuzzyMatchesWholeWord (needle, haystack) {
    return matchesWholeWord ( needle.toLowerCase() , haystack.toLowerCase() )
}

export function eitherMatches (stringARaw, stringBRaw) {
    // Make strings lowercase for more generous comparison
    const stringA = stringARaw.toLowerCase()
    const stringB = stringBRaw.toLowerCase()

    // A blank alias would otherwise match every name
    if ( stringA.trim().length === 0 || stringB.trim().length === 0 ) return false

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
