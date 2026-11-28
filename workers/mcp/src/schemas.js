// Output schemas for the Does It ARM MCP tools.
//
// Each schema describes the structuredContent a tool already returns (see
// tools.js and data.js). Objects are loose so clients that validate with the
// published JSON Schema keep working when a field is added later. MCP
// 2025-11-25 needs an object at the root, so tools with two result branches
// (get_app, list_by_category) use one flat object: the shared fields are
// required and the branch-specific fields are optional. Tests check every
// branch against these schemas.

import { z } from 'zod'

const status = z.string().nullable().describe( 'Reported status: native, rosetta, no (unsupported), no-in-progress (support in progress) or unreported (native support not yet reported). Null when the source has none.' )
const kind = z.string().describe( 'Listing kind: app (Mac app), game, homebrew (formula) or device (Mac model).' )
const url = z.string().describe( 'Canonical doesitarm.com page for this listing.' )

export const listingSummary = z.looseObject({
    name: z.string(),
    kind,
    url,
    status: status.optional(),
    statusText: z.string().optional().describe( 'Status headline shown on the listing page.' ),
    category: z.string().optional(),
    lastUpdated: z.string().optional().describe( 'Date of the last listing update, when the source has one.' ),
    description: z.string().optional().describe( 'Device description. Only on device listings.' ),
})

const deviceSummary = listingSummary.extend({
    slug: z.string(),
    chips: z.array( z.string() ),
    availableDate: z.string().nullable(),
})

const listingDetail = z.looseObject({
    name: z.string(),
    kind,
    url,
    status: status.optional(),
    statusText: z.string().optional(),
    category: z.looseObject({ label: z.string(), slug: z.string(), url: z.string() }).nullable().optional(),
    lastUpdated: z.string().nullable().optional(),
    aliases: z.array( z.string() ).optional(),
    links: z.array( z.looseObject({ label: z.string(), url: z.string() }) ).optional(),
    deviceSupport: z.array( z.looseObject({
        device: z.string(),
        result: z.string(),
        summary: z.string(),
        url: z.string(),
    }) ).optional().describe( 'Per-device results shown on the listing page.' ),
    relatedVideos: z.array( z.looseObject({
        title: z.string(),
        channel: z.string(),
        benchmark: z.boolean(),
        published: z.string().nullable(),
        url: z.string(),
        youtubeUrl: z.string().nullable(),
    }) ).optional().describe( 'Up to 10 related videos.' ),
    relatedVideoCount: z.number().optional(),
    bundleIds: z.array( z.string() ).optional(),
    versionHistory: z.array( z.looseObject({
        bundleId: z.string(),
        totalVersions: z.number(),
        versions: z.array( z.looseObject({
            version: z.string(),
            status: z.string(),
            architectures: z.array( z.string() ),
        }) ).describe( 'Up to 10 newest scanned versions.' ),
    }) ).optional().describe( 'Mac app bundle version history. Only on app listings.' ),
    reports: z.array( z.record( z.string(), z.string() ) ).optional().describe( 'Game reports. Only on game listings.' ),
    attribution: z.string().optional(),
    installedVia: z.string().optional(),
    // Device (Mac model) listings
    shortName: z.string().optional(),
    type: z.string().optional(),
    chips: z.array( z.string() ).optional(),
    releaseYear: z.union([ z.number(), z.string() ]).nullable().optional(),
    announcedDate: z.string().nullable().optional(),
    availableDate: z.string().nullable().optional(),
    appleSpecsUrl: z.string().nullable().optional(),
    description: z.string().optional(),
    intro: z.array( z.string() ).optional(),
    facts: z.array( z.looseObject({ label: z.string(), value: z.string() }) ).optional(),
    comparison: z.looseObject({ heading: z.string(), body: z.string(), url: z.string().nullable() }).nullable().optional(),
    decisionGuide: z.looseObject({ heading: z.string(), summary: z.string(), points: z.array( z.string() ) }).nullable().optional(),
    buyerProfile: z.looseObject({
        primaryReason: z.string(),
        evidenceSummary: z.string(),
        useCases: z.array( z.looseObject({ label: z.string(), description: z.string() }) ),
    }).nullable().optional(),
    officialSources: z.array( z.looseObject({ label: z.string(), url: z.string() }) ).optional(),
})

export const OUTPUT_SCHEMAS = {
    search_apps: z.looseObject({
        query: z.string(),
        total: z.number().describe( 'Number of matching listings. Can be larger than the number returned.' ),
        results: z.array( listingSummary ).describe( 'Ranked candidates, best first. Empty when nothing matched.' ),
    }),

    get_app: z.looseObject({
        found: z.boolean().describe( 'True when a listing was found. Then listing is set; otherwise query and suggestions are set.' ),
        listing: listingDetail.optional(),
        query: z.string().optional(),
        suggestions: z.array( listingSummary ).optional().describe( 'Closest listings when nothing matched.' ),
    }),

    check_apps: z.looseObject({
        counts: z.record( z.string(), z.number() ).describe( 'Number of names per reported status, plus not-listed.' ),
        results: z.array( listingSummary.partial().extend({
            query: z.string().describe( 'The name as checked, trimmed.' ),
            found: z.boolean(),
            closest: z.array( z.string() ).optional().describe( 'Up to two closest listing names when found is false.' ),
        }) ),
    }),

    list_categories: z.looseObject({
        summary: z.looseObject({
            total: z.number().optional(),
            nativePercent: z.number().optional(),
            rosettaPercent: z.number().optional(),
            unreportedPercent: z.number().optional(),
            unsupportedPercent: z.number().optional(),
        }).nullable().describe( 'Percentages across Mac apps, games and formulae. Null when unavailable.' ),
        categories: z.array( z.looseObject({
            slug: z.string(),
            label: z.string(),
            count: z.number(),
            url: z.string(),
        }) ),
    }),

    list_by_category: z.looseObject({
        found: z.boolean().describe( 'False when the category is unknown. Then only category is set.' ),
        category: z.string(),
        label: z.string().optional(),
        total: z.number().optional(),
        offset: z.number().optional(),
        nextOffset: z.number().nullable().optional().describe( 'Offset for the next page, or null on the last page.' ),
        results: z.array( listingSummary ).optional(),
    }),

    recent_updates: z.looseObject({
        results: z.array( listingSummary ).describe( 'Mac app listings, newest update first.' ),
    }),

    list_devices: z.looseObject({
        results: z.array( deviceSummary ),
    }),
}
