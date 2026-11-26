use super::{Result, trace::Trace};
use std::{
    collections::VecDeque,
    ops::Range,
    time::{Duration, Instant},
};

pub(super) fn run(trace: &mut Trace, max_attempts: usize) -> Result<usize> {
    trace.verify()?;
    let mut trials = Trials {
        left: max_attempts,
        until: Instant::now() + Duration::from_secs(30),
    };

    for index in 0..trace.header.phases.len() {
        let reads = trace.header.phases[index].read_log.len();
        trials.partition(reads, |range, _| {
            let spans = &mut trace.header.phases[index].read_log[range.clone()];
            let mut saved = Vec::new();
            for (i, span) in spans.iter_mut().enumerate() {
                if let Some(offset) = span.payload_offset.take() {
                    saved.push((i, offset));
                }
            }
            if saved.is_empty() {
                return Trial::Skip;
            }
            if trace.verify().is_ok() {
                return Trial::Accepted;
            }
            let spans = &mut trace.header.phases[index].read_log[range];
            for (i, offset) in saved {
                spans[i].payload_offset = Some(offset);
            }
            Trial::Rejected
        });
        // Remove masked rows if replay does not need their position to
        // associate a later matching read with its recorded source error.
        let log = &mut trace.header.phases[index].read_log;
        if log
            .iter()
            .any(|span| span.payload_offset.is_none() && span.error.is_none())
        {
            let previous = std::mem::take(log);
            *log = previous
                .iter()
                .filter(|span| span.payload_offset.is_some() || span.error.is_some())
                .cloned()
                .collect();
            if trace.verify().is_err() {
                trace.header.phases[index].read_log = previous;
            }
        }
    }
    compact(trace)?;

    for index in 0..trace.header.phases.len() {
        let phase = &trace.header.phases[index];
        let end = phase
            .read_log
            .iter()
            .filter(|span| span.payload_offset.is_some() || span.error.is_some())
            .map(|span| span.offset.saturating_add(span.length as u64))
            .max()
            .unwrap_or(0);
        if phase.run_core && end < phase.size && trials.available() {
            let original = phase.size;
            trace.header.phases[index].size = end;
            if trace.verify().is_err() {
                trace.header.phases[index].size = original;
            }
            trials.left -= 1;
        }
    }

    // Zeroing changes bytes without granting access to any previously absent
    // range. Try both halves of a rejected group at the next granularity.
    let mut saved = Vec::new();
    trials.partition(trace.payload.len(), |range, trials| {
        let bytes = &mut trace.payload[range.clone()];
        if bytes.iter().all(|&value| value == 0) {
            return Trial::Skip;
        }
        saved.clear();
        saved.extend_from_slice(bytes);
        bytes.fill(0);
        if trace.verify().is_ok() {
            return Trial::Accepted;
        }

        // Some parsers need nonzero padding or a nonzero marker. A repeating
        // tile generated from a fixed seed compresses well and is reproducible.
        if trials.available()
            && (256..=16_384).contains(&range.len())
            && sufficiently_varied(&saved)
        {
            trials.left -= 1;
            seed_fill(&mut trace.payload[range.clone()], 0x6d2b_79f5);
            if trace.verify().is_ok() {
                return Trial::Accepted;
            }
        }
        trace.payload[range].copy_from_slice(&saved);
        Trial::Rejected
    });

    trace.verify()?;
    Ok(max_attempts - trials.left)
}

fn sufficiently_varied(bytes: &[u8]) -> bool {
    // A high proportion of different neighboring values gives this candidate
    // a chance of saving space over an already low-entropy block.
    bytes.windows(2).filter(|pair| pair[0] != pair[1]).count() > bytes.len() / 2
}

fn seed_fill(bytes: &mut [u8], mut state: u32) {
    let tile: [u8; 32] = std::array::from_fn(|_| {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        (state >> 24) as u8
    });
    for group in bytes.chunks_mut(tile.len()) {
        group.copy_from_slice(&tile[..group.len()]);
    }
}

struct Trials {
    left: usize,
    until: Instant,
}

enum Trial {
    Accepted,
    Rejected,
    Skip,
}

impl Trials {
    fn available(&self) -> bool {
        self.left > 0 && Instant::now() < self.until
    }

    fn partition(&mut self, len: usize, mut test: impl FnMut(Range<usize>, &mut Self) -> Trial) {
        let mut work = VecDeque::from([0..len]);
        while let Some(range) = work.pop_front() {
            if !self.available() {
                break;
            }
            let middle = range.start + range.len() / 2;
            self.left -= 1;
            match test(range.clone(), self) {
                Trial::Skip => self.left += 1,
                Trial::Rejected if range.len() > 1 => {
                    work.push_back(range.start..middle);
                    work.push_back(middle..range.end);
                }
                _ => {}
            }
        }
    }
}

fn compact(trace: &mut Trace) -> Result<()> {
    let mut windows = trace
        .header
        .phases
        .iter()
        .flat_map(|phase| &phase.read_log)
        .filter_map(|span| Some((span.payload_offset?, span.length)))
        .collect::<Vec<_>>();
    windows.sort_unstable();

    let mut blocks: Vec<(Range<usize>, usize)> = Vec::new();
    for (start, len) in windows {
        let end = start + len;
        if let Some((previous, _)) = blocks.last_mut()
            && start <= previous.end
        {
            previous.end = previous.end.max(end);
        } else {
            let next = blocks
                .last()
                .map_or(0, |(range, offset)| offset + range.len());
            blocks.push((start..end, next));
        }
    }

    for span in trace
        .header
        .phases
        .iter_mut()
        .flat_map(|phase| &mut phase.read_log)
    {
        if let Some(old) = &mut span.payload_offset {
            let i = blocks.partition_point(|(window, _)| window.start <= *old) - 1;
            let (window, new) = &blocks[i];
            *old = new + *old - window.start;
        }
    }
    for (window, offset) in &blocks {
        trace.payload.copy_within(window.clone(), *offset);
    }
    trace.payload.truncate(
        blocks
            .last()
            .map_or(0, |(range, offset)| offset + range.len()),
    );
    trace.verify()
}
