import { summarizeInventory } from './scan-result.js';

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
  const { result } = row;
  if (result.inventory) return result.inventory;
  const binaries = [];
  const seen = new Set();
  const record = (path, binaryRole, architectures) => {
    if (!path || !architectures.length || seen.has(path)) return;
    seen.add(path);
    binaries.push({ path, role: binaryRole, architectures });
  };
  record(result.executable_path, 'main', result.architectures);
  const pending = [...row.children ?? []];
  while (pending.length) {
    const child = pending.pop();
    const binary = child.result;
    if (child.children) {
      for (const member of child.children) pending.push(member);
    }
    if (!binary || (binary.format !== 'macho' && child.kind !== 'bundle')) continue;
    const path = binary.executable_path ?? (binary.format === 'macho' ? child.label : null);
    if (path) record(path, role(path.slice(row.label.length + 1)), binary.architectures);
  }
  return summarizeInventory(binaries, 'Browser folder inventory contains observed binaries only.');
}
