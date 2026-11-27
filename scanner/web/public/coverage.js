// Unique source bytes read from one file. A scan may read the same range many
// times; the count shown to people is how much of the file was touched, so it
// cannot exceed the file size. `requested` keeps the physical total.
export class Coverage {
  constructor(size = Infinity) {
    this.size = size;
    this.ranges = [];
    this.bytes = 0;
    this.requested = 0;
  }

  add(start, end) {
    end = Math.min(end, this.size);
    this.requested += Math.max(0, end - start);
    if (end <= start) return;
    const ranges = this.ranges;
    let low = 0;
    let high = ranges.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (ranges[mid][1] < start) low = mid + 1;
      else high = mid;
    }
    let first = low;
    let last = low;
    let from = start;
    let to = end;
    while (last < ranges.length && ranges[last][0] <= end) {
      from = Math.min(from, ranges[last][0]);
      to = Math.max(to, ranges[last][1]);
      this.bytes -= ranges[last][1] - ranges[last][0];
      last++;
    }
    ranges.splice(first, last - first, [from, to]);
    this.bytes += to - from;
  }
}
