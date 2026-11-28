//! Report read accounting of a local diagnostic scan: `cargo run --release -p scan-core --example diag -- FILE [--plain]`.
use scan_core::{Profile, ReadAt, Result, ScanLimits, Target, scan_target_with_diagnostics, scan_with_limits};
use std::{
    cell::RefCell,
    fs::File,
    future::Future,
    io::{Read, Seek, SeekFrom},
    pin::pin,
    task::{Context, Poll, Waker},
};

struct Disk {
    file: File,
    size: u64,
    log: RefCell<Vec<(u64, usize)>>,
}

impl ReadAt for Disk {
    fn size(&self) -> u64 {
        self.size
    }
    async fn read_at(&mut self, offset: u64, len: usize) -> Result<Vec<u8>> {
        self.log.borrow_mut().push((offset, len));
        let mut bytes = vec![0; len];
        self.file.seek(SeekFrom::Start(offset)).unwrap();
        self.file.read_exact(&mut bytes).unwrap();
        Ok(bytes)
    }
}

fn ready<T>(f: impl Future<Output = T>) -> T {
    match pin!(f).poll(&mut Context::from_waker(Waker::noop())) {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("pending"),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let file = File::open(&args[1]).unwrap();
    let size = file.metadata().unwrap().len();
    let mut disk = Disk { file, size, log: RefCell::new(Vec::new()) };
    let limits = ScanLimits::for_profile(Profile::Local);
    let start = std::time::Instant::now();
    let result = if args.iter().any(|a| a == "--plain") {
        ready(scan_with_limits(&mut disk, limits))
    } else {
        ready(scan_target_with_diagnostics(&mut disk, limits, Target::Auto, None))
    };
    let log = disk.log.borrow();
    let requested: u64 = log.iter().map(|r| r.1 as u64).sum();
    println!(
        "status={:?} format={:?} size={} bytes_read={} requested={} reads={} decoded={} secs={:.2} err={:?}",
        result.status, result.format, size, result.bytes_read, requested, log.len(), result.decoded_bytes,
        start.elapsed().as_secs_f64(), result.error
    );
    if args.iter().any(|a| a == "--log") {
        for (o, l) in log.iter() {
            println!("{o} {l}");
        }
    }
}
