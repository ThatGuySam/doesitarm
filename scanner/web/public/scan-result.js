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

export function summarizeInventory(binaries, incompleteReason) {
  const verified = ({ architectures }) => architectures.every((slice) => slice.header_verified);
  const arm = ({ name }) => name === 'arm64' || name === 'arm64e';
  const withoutArm = binaries.filter((binary) => verified(binary) && !binary.architectures.some(arm));
  const intel = withoutArm.filter(({ architectures }) => architectures.every(({ name }) => name === 'x86_64'));
  const reason = incompleteReason ||
    (binaries.some((binary) => !verified(binary)) ? 'A Mach-O slice header could not be verified.' : null);
  return {
    complete: !reason,
    incomplete_reason: reason,
    binaries: binaries.sort((a, b) => a.path < b.path ? -1 : Number(a.path > b.path)),
    all_arm64_capable: withoutArm.length ? false : !reason && binaries.length ? true : null,
    has_x86_64_only: intel.length ? true : reason ? null : false,
    x86_64_only: intel.map(({ path }) => path).sort(),
  };
}
