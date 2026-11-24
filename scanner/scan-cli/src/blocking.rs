use crate::ready;
use scan_core::{
    ReadAt, Result, ScanLimits, ScanResult, Target, scan_target_with_deadline,
    scan_target_with_fingerprints,
};

trait BlockingSource {
    fn source_size(&self) -> u64;
    fn source_budget(&self) -> u64;
    fn read(&mut self, offset: u64, len: usize, purpose: &'static str) -> Result<Vec<u8>>;
}

impl<S: ReadAt> BlockingSource for S {
    fn source_size(&self) -> u64 {
        self.size()
    }

    fn source_budget(&self) -> u64 {
        self.remaining_budget()
    }

    fn read(&mut self, offset: u64, len: usize, purpose: &'static str) -> Result<Vec<u8>> {
        ready(self.read_at_for(offset, len, purpose))
    }
}

struct Source<'a>(&'a mut dyn BlockingSource);

impl ReadAt for Source<'_> {
    fn size(&self) -> u64 {
        self.0.source_size()
    }

    fn remaining_budget(&self) -> u64 {
        self.0.source_budget()
    }

    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        self.0.read(offset, len, "container_data")
    }

    async fn read_at_for(
        &mut self,
        offset: u64,
        len: usize,
        purpose: &'static str,
    ) -> Result<Vec<u8>> {
        self.0.read(offset, len, purpose)
    }
}

pub(crate) fn scan(
    source: &mut impl ReadAt,
    limits: ScanLimits,
    target: Target<'_>,
    expired: Option<&dyn Fn() -> bool>,
    fingerprints: bool,
) -> ScanResult {
    // Erase the native source type so HTTP, file, and replay hosts share the
    // same scanner implementation. Each underlying source completes
    // synchronously and preserves its original offset and budget behavior.
    let mut source = Source(source);
    if fingerprints {
        ready(scan_target_with_fingerprints(
            &mut source,
            limits,
            target,
            expired,
        ))
    } else {
        ready(scan_target_with_deadline(
            &mut source,
            limits,
            target,
            expired,
        ))
    }
}
