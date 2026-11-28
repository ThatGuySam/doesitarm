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

const inventoryStatus = z.enum([ 'native', 'rosetta', 'unsupported', 'unknown' ])

const inventoryFinding = z.looseObject({
    row: z.number().describe( 'One-based input row (CSV data row, excluding the header) of the first row with this identity, version and build.' ),
    duplicate_rows: z.number().describe( 'Additional input rows collapsed into this one.' ),
    match: z.enum([ 'bundle_id', 'name', 'alias', 'ambiguous', 'none' ]).describe( 'How the row was matched to the catalog. Only bundle_id establishes identity for a status.' ),
    status: inventoryStatus,
    unknown_reason: z.enum([ 'unlisted', 'ambiguous_identity', 'bundle_id_conflict', 'version_missing', 'version_unverified', 'conflicting_variants', 'stale_evidence', 'insufficient_evidence' ]).nullable().describe( 'Why status is unknown. Null otherwise.' ),
    target_assessment: z.enum([ 'rosetta_available_if_installed', 'rosetta_unavailable', 'explicitly_unsupported', 'needs_validation', 'unknown' ]).nullable().describe( 'Assessment for target_macos. Null when no target was given.' ),
    requested_version: z.string().nullable(),
    requested_build: z.string().nullable(),
    evidence: z.looseObject({
        basis: z.enum([ 'catalog_statement', 'binary_architecture', 'vendor_statement', 'runtime_test' ]).describe( 'catalog_statement: the listing reports native support as of observed_version. binary_architecture: a catalog scan of exactly observed_version found these Mach-O architectures.' ),
        observed_version: z.string().nullable(),
        observed_build: z.string().nullable(),
        observed_at: z.string().nullable(),
        architectures: z.array( z.string() ),
        source_url: z.string(),
    }).nullable(),
    catalog_hint: z.looseObject({
        title: z.string(),
        url: z.string(),
        reported_status: status,
    }).nullable().describe( 'Latest catalog listing and status for triage. It does not describe the installed version.' ),
    candidates: z.array( z.looseObject({ title: z.string(), url: z.string() }) ).describe( 'Up to three catalog listings for an ambiguous or conflicting row.' ),
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

    check_inventory: z.looseObject({
        catalog_revision: z.string().describe( 'Catalog revision these results come from. Pass it back with later pages.' ),
        target_macos: z.number().nullable(),
        counts: z.looseObject({
            received: z.number(),
            accepted: z.number(),
            invalid: z.number(),
            duplicates: z.number(),
            unique: z.number(),
            native: z.number(),
            rosetta: z.number(),
            unsupported: z.number(),
            unknown: z.number(),
        }).describe( 'Whole-batch counts: received = accepted + invalid, unique = accepted - duplicates, and the four statuses sum to unique.' ),
        invalid_rows: z.array( z.looseObject({ row: z.number(), code: z.enum([ 'missing_identity', 'invalid_field' ]) }) ).describe( 'Up to 10 invalid row numbers with reason codes.' ),
        filtered_count: z.number().describe( 'Unique rows matching filter.' ),
        results: z.array( inventoryFinding ).describe( 'One page of unique rows in input order.' ),
        next_offset: z.number().nullable().describe( 'Offset of the next page, or null on the last page.' ),
        scanner_reference: z.looseObject({
            title: z.string(),
            url: z.string(),
            scope: z.string(),
            catalog_submission: z.string(),
            unknown_rows: z.number(),
        }).nullable().describe( 'Fixed Does It ARM App Scanner v3 (preview) reference, present when the batch has unknown rows. Scanner results stay on the local Mac; catalog_submission is unavailable.' ),
    }),
}
