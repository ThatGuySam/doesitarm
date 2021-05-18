// Universal JS imports only
import slugify from 'slugify'

export function makeSlug ( name ) {
    return slugify(name, {
        lower: true,
        strict: true
    })
}
