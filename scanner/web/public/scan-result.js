export const MIB = 1024 ** 2;
export const DEFAULT_BUDGET = 8 * MIB;
export const MAX_BUDGET = 64 * MIB;

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
    reads: 0,
    total_size: totalSize,
    error,
  };
}
