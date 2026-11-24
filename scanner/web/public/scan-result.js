export const MIB = 1024 ** 2;
export const DEFAULT_BUDGET = 8 * MIB;
export const URL_BUDGET_TIERS = [DEFAULT_BUDGET, 64 * MIB, 256 * MIB];

export function emptyResult(status, error, totalSize = 0) {
  return {
    format: null,
    status,
    architectures: [],
    bundle_path: null,
    bundle_id: null,
    version: null,
    name: null,
    min_macos: null,
    executable_name: null,
    executable_size: null,
    installer: null,
    bytes_read: 0,
    bytes_requested: 0,
    decoded_bytes: 0,
    reads: 0,
    total_size: totalSize,
    error,
  };
}
