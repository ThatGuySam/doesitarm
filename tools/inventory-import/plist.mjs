import { SaxesParser } from 'saxes';

const appleDoctype = /^\s*plist\s+PUBLIC\s+(?:"-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN"|'-\/\/Apple\/\/DTD PLIST 1\.0\/\/EN')\s+(?:"http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd"|'http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd')\s*$/;
const containers = new Set(['plist', 'array', 'dict']);
const scalars = new Set(['key', 'string', 'true', 'false', 'integer', 'real', 'date', 'data']);

export function parsePlist(text) {
  const parser = new SaxesParser();
  const stack = [];
  let root;
  const malformed = () => { throw new Error('Malformed XML property list.'); };

  parser.on('error', malformed);
  parser.on('doctype', declaration => {
    // Saxes never resolves DTDs. Accept only Apple's standard declaration.
    if (!appleDoctype.test(declaration)) throw new Error('Unsupported XML plist declaration.');
  });
  parser.on('opentag', ({ name, attributes }) => {
    if (stack.length === 64) throw new Error('XML plist nesting exceeds 64 elements.');
    const parent = stack.at(-1);
    if (!parent && name !== 'plist') malformed();
    if (parent && (!containers.has(parent.name) || name === 'plist')) malformed();
    if (name === 'key' && parent?.name !== 'dict') malformed();
    if (!containers.has(name) && !scalars.has(name)) malformed();
    const keys = Object.keys(attributes);
    if (keys.length && (name !== 'plist' || keys.length !== 1 || attributes.version !== '1.0')) malformed();
    stack.push({ name, children: [], text: '' });
  });

  const addText = value => {
    const frame = stack.at(-1);
    if (!frame || containers.has(frame.name)) {
      if (value.trim()) malformed();
    } else {
      frame.text += value;
    }
  };
  parser.on('text', addText);
  parser.on('cdata', addText);
  parser.on('closetag', () => {
    const { name, children, text: value } = stack.pop();
    let parsed = value;
    if (name === 'plist') {
      if (children.length !== 1) malformed();
      root = children[0].value;
      return;
    }
    if (name === 'array') parsed = children.map(child => child.value);
    if (name === 'dict') {
      parsed = Object.create(null);
      for (let index = 0; index < children.length; index += 2) {
        const key = children[index];
        const entry = children[index + 1];
        if (key.name !== 'key' || !entry || entry.name === 'key' || Object.hasOwn(parsed, key.value)) malformed();
        parsed[key.value] = entry.value;
      }
    }
    if (name === 'true' || name === 'false') {
      if (value.trim()) malformed();
      parsed = name === 'true';
    }
    stack.at(-1).children.push({ name, value: parsed });
  });

  parser.write(text).close();
  return root;
}
