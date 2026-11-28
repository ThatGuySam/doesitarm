import { diagnosticControls } from './diagnostics.js';
import { discardFolder, savedFolderRows, savedFolders } from './folder-journal.js';
import { notify } from './notifications.js';

export async function showSavedFolders(section) {
  let available = await savedFolders();
  if (!available.length) return;
  const label = document.createElement('label');
  const choice = document.createElement('select');
  label.append('Saved folder scan ', choice);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const discard = document.createElement('button');
  discard.type = 'button';
  discard.className = 'quiet-button';
  discard.textContent = 'Discard saved scan';
  const selected = () => available.find(({ id }) => id === choice.value);
  const actions = diagnosticControls(() => {
    const { id, header, state, count } = selected();
    return {
      header: { ...header, recovery_state: state, saved_rows: count },
      rows: savedFolderRows(id), count,
    };
  }, { idPrefix: 'saved-' });

  function update() {
    actions.reset();
    const run = selected();
    section.hidden = !run;
    if (!run) return;
    const state = { in_progress: 'Incomplete', canceled: 'Canceled', complete: 'Finished' }[run.state];
    status.textContent = `${state} · ${run.count.toLocaleString()} ${run.count === 1 ? 'result' : 'results'} saved on this device`;
    actions.element.hidden = !run.count;
    actions.update(run.count);
  }

  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  for (const { id, header } of available) {
    const name = header.folder_name || 'Folder scan';
    choice.add(new Option(`${name} · ${date.format(new Date(header.started_at))}`, id));
  }
  discard.addEventListener('click', async () => {
    const { id } = selected();
    discard.disabled = choice.disabled = true;
    try {
      await discardFolder(id);
      available = available.filter((run) => run.id !== id);
      choice.selectedOptions[0].remove();
      update();
    } catch {
      notify.error('The browser could not discard this saved scan.');
    } finally {
      discard.disabled = choice.disabled = false;
    }
  });
  choice.addEventListener('change', update);
  section.append(label, status, actions.element, discard);
  update();
}
