function role(path) {
  const inside = path.replace(/^Contents\//, '');
  const [top] = inside.split('/', 1);
  if (inside.includes('Sparkle.framework/') || ['Updater', 'Sparkle'].includes(top)) return 'updater';
  if (top === 'XPCServices' || inside.includes('.xpc/')) return 'xpc_service';
  if (top === 'LoginItems' || inside.includes('/LoginItems/')) return 'login_item';
  if (/(?:^|\/)(?:LaunchServices|LaunchDaemons|LaunchAgents)\//.test(inside)) return 'launch_helper';
  if (/\.app\//i.test(inside)) return 'nested_app';
  if (top === 'Frameworks') return inside.includes('.framework/') ? 'framework' : 'library';
  if (top === 'PlugIns' || top === 'Plugins') return 'plugin';
  if (top === 'Resources') return 'resource';
  if (top === 'SharedSupport') return 'shared_support';
  if (['runtime', 'Java', 'Home', 'jbr', 'jre', 'jdk'].includes(top) || top.endsWith('.jdk')) return 'runtime';
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
      role: role(path.slice(row.label.length + 1)),
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
