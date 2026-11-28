import { toPublicScanReport } from './scan-allowlist.js'

// Architecture names (arm64, x86_64, ...) for a scan report, from either a
// projected public report or a raw historical row.
export function supportedArchitectures ( appScan ) {
    return toPublicScanReport( appScan )?.architectures ?? []
}
