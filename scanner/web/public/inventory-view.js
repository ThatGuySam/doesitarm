import { redactPath } from './path-privacy.js';

const binaryRoles = {
  main: 'Main executable',
  helper: 'Helper',
  framework: 'Framework',
  library: 'Library',
  plugin: 'Plug-in',
  xpc_service: 'XPC service',
  login_item: 'Login item',
  launch_helper: 'Launch helper',
  nested_app: 'Nested app',
  resource: 'Resource executable',
  shared_support: 'Shared support',
  runtime: 'Runtime',
  updater: 'Updater',
};

export function inventoryDetails(inventory, label) {
  if (!inventory) return null;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  const count = inventory.binaries.length;
  summary.textContent = `${count} ${count === 1 ? 'binary' : 'binaries'} · ${inventory.complete ? 'Complete' : 'Partial'}`;
  summary.setAttribute('aria-label', `${redactPath(label)} binary inventory, ${summary.textContent}`);
  details.append(summary);

  function render() {
    if (!details.open) return;
    details.removeEventListener('toggle', render);
    const overview = document.createElement('p');
    const arm = inventory.all_arm64_capable === true ? 'All observed binaries support arm64.' :
      inventory.all_arm64_capable === false ? 'Some binaries lack an arm64 slice.' :
        'App-wide arm64 coverage is unknown.';
    const intel = inventory.x86_64_only.length ? ` ${inventory.x86_64_only.length} x86_64-only.` : '';
    overview.textContent = redactPath([arm + intel, inventory.incomplete_reason].filter(Boolean).join(' '));
    details.append(overview);
    if (!count) return;
    const list = document.createElement('ul');
    for (const binary of inventory.binaries) {
      const item = document.createElement('li');
      const path = document.createElement('code');
      path.textContent = redactPath(binary.path);
      const slices = binary.architectures.map((slice) => {
        const signature = slice.code_signature_present === true ? 'signature present' :
          slice.code_signature_present === false ? 'no signature' : 'signature unknown';
        const macos = slice.min_macos ? `macOS ${slice.min_macos}+` : 'minimum macOS unknown';
        return `${slice.name}${slice.header_verified ? '' : ' (unverified)'} · ${macos} · ${signature}`;
      });
      item.append(path, ` — ${redactPath(binaryRoles[binary.role] ?? binary.role)}. ${redactPath(slices.join(' / '))}`);
      list.append(item);
    }
    details.append(list);
  }
  details.addEventListener('toggle', render);
  return details;
}
