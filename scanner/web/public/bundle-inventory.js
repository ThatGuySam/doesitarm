function role(path) {
  if (path.includes('Sparkle.framework/') || path.startsWith('Contents/Updater/')) return 'updater';
  if (path.includes('/LoginItems/')) return 'login_item';
  if (path.startsWith('Contents/XPCServices/') || path.includes('.xpc/')) return 'xpc_service';
  if (path.startsWith('Contents/Frameworks/')) return path.includes('.framework/') ? 'framework' : 'library';
  if (/^Contents\/Plug[Ii]ns\//.test(path)) return 'plugin';
  if (path.startsWith('Contents/Resources/')) return 'resource';
  return 'helper';
}

// Match scanner-edge's inventory schema. The browser sees only the members
// delivered by its picker or drop API and positively identified as binaries.
export function observedInventory(row) {
  const binaries = [];
  const result = row.result;
  if (result.executable_path && result.architectures.length) {
    binaries.push({ path: result.executable_path, role: 'main', architectures: result.architectures });
  }
  for (const child of row.children ?? []) {
    const binary = child.result;
    const path = binary?.executable_path ?? (binary?.format === 'macho' ? child.label : null);
    if (!path || !binary.architectures.length || path === result.executable_path ||
        !(binary.format === 'macho' || child.kind === 'bundle')) continue;
    binaries.push({
      path,
      role: child.kind === 'bundle' ? 'nested_app' : role(child.label.slice(row.label.length + 1)),
      architectures: binary.architectures,
    });
  }
  const verifiedWithoutArm = binaries.filter((binary) => binary.architectures.every(({ name, header_verified }) =>
    header_verified && name !== 'arm64' && name !== 'arm64e'));
  const x86Only = verifiedWithoutArm.filter(({ architectures }) =>
    architectures.every(({ name }) => name === 'x86_64')).map(({ path }) => path);
  return {
    complete: false,
    incomplete_reason: 'Browser folder inventory contains observed binaries only.',
    binaries,
    all_arm64_capable: verifiedWithoutArm.length ? false : null,
    has_x86_64_only: x86Only.length ? true : null,
    x86_64_only: x86Only,
  };
}
