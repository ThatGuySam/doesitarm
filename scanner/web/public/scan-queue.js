// Min-heap for stable smallest-first scheduling across large streaming batches.
export class ScanQueue {
  #items = [];
  #positions = new Map();
  #order = 0;

  get length() { return this.#items.length; }

  push(task) {
    task.order = this.#order++;
    this.#put(this.#items.length, task);
    this.#rise(this.#items.length - 1);
  }

  shift() { return this.remove(this.#items[0]?.id); }

  clear() {
    const items = this.#items;
    this.#items = [];
    this.#positions.clear();
    return items;
  }

  remove(id) {
    const index = this.#positions.get(id);
    if (index === undefined) return;
    const task = this.#items[index];
    const last = this.#items.pop();
    this.#positions.delete(id);
    if (last !== task) {
      this.#put(index, last);
      this.#sink(this.#rise(index));
    }
    return task;
  }

  #put(index, task) {
    this.#items[index] = task;
    this.#positions.set(task.id, index);
  }

  #less(a, b) {
    return a.size < b.size || (a.size === b.size && a.order < b.order);
  }

  #swap(a, b) {
    const first = this.#items[a];
    this.#put(a, this.#items[b]);
    this.#put(b, first);
  }

  #rise(index) {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.#less(this.#items[index], this.#items[parent])) break;
      this.#swap(index, parent);
      index = parent;
    }
    return index;
  }

  #sink(index) {
    const items = this.#items;
    while (index * 2 + 1 < items.length) {
      let child = index * 2 + 1;
      if (child + 1 < items.length && this.#less(items[child + 1], items[child])) child += 1;
      if (!this.#less(items[child], items[index])) break;
      this.#swap(index, child);
      index = child;
    }
  }
}
