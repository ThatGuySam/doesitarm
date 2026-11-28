const bundleFormats = new Map([
  ['app', 'app'],
  ['component', 'au'],
  ['vst', 'vst2'],
  ['vst3', 'vst3'],
  ['clap', 'clap'],
  ['aaxplugin', 'aax'],
]);

export const pluginFormats = new Map([
  ['au', 'Audio Unit (AU)'],
  ['vst2', 'VST2'],
  ['vst3', 'VST3'],
  ['clap', 'CLAP'],
  ['aax', 'AAX'],
]);

export function bundleKind(path) {
  const leaf = path.slice(path.lastIndexOf('/') + 1);
  const dot = leaf.lastIndexOf('.');
  if (dot < 1 || leaf.startsWith('._')) return null;
  return bundleFormats.get(leaf.slice(dot + 1).toLowerCase()) ?? null;
}
