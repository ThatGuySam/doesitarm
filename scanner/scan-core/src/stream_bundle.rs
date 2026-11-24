use crate::{
    Architecture, ExecutableCandidate, ReadAt, Result, ScanError, ScanResult, Target, Window,
    bundle, macho,
};

struct Candidate {
    path: String,
    size: u64,
    architectures: Vec<Architecture>,
    outcome: Result<()>,
}

impl Candidate {
    fn apply(self, out: &mut ScanResult) -> Result<bool> {
        out.executable_size = Some(self.size);
        out.architectures = self.architectures;
        self.outcome.map(|()| true)
    }
}

/// When the executable precedes its plist, retain observations for plausible
/// main executable paths until CFBundleExecutable confirms which one to use.
#[derive(Default)]
pub(crate) struct StreamBundle<'a> {
    selection: Target<'a>,
    target: Option<String>,
    candidates: Vec<Candidate>,
    dropped_candidates: bool,
}

impl<'a> StreamBundle<'a> {
    pub(crate) fn new(selection: Target<'a>) -> Self {
        Self {
            selection,
            ..Self::default()
        }
    }

    pub(crate) fn with_target(target: String) -> Self {
        Self {
            target: Some(target),
            ..Self::default()
        }
    }

    pub(crate) async fn file(
        &mut self,
        source: &mut impl ReadAt,
        path: &str,
        offset: u64,
        size: u64,
        out: &mut ScanResult,
    ) -> Result<bool> {
        let Some(path) = bundle::archive_path(path) else {
            return Ok(false);
        };
        if let Target::Executable(requested) = self.selection {
            if !bundle::matches_path(path, requested) {
                return Ok(false);
            }
            out.executable_path = Some(path.to_owned());
            out.executable_size = Some(size);
            macho::scan(
                &mut Window::new(source, offset, size)?,
                &mut out.architectures,
            )
            .await?;
            return Ok(true);
        }
        if let Some(target) = &self.target {
            if target == path {
                out.executable_size = Some(size);
                macho::scan(
                    &mut Window::new(source, offset, size)?,
                    &mut out.architectures,
                )
                .await?;
                return Ok(true);
            }
        } else if let Some(root) = bundle::selected_plist(path, self.selection) {
            out.bundle_path = Some(root.to_owned());
            if size > bundle::MAX_PLIST {
                return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
            }
            let plist = source.read_at(offset, size as usize).await?;
            let target = bundle::apply_plist(&plist, root, out)?;
            out.candidate_executables.clear();
            if let Some(index) = self
                .candidates
                .iter()
                .position(|entry| entry.path == target)
            {
                return self.candidates.swap_remove(index).apply(out);
            }
            self.candidates.clear();
            self.target = Some(target);
        } else if path
            .rsplit_once("/Contents/MacOS/")
            .is_some_and(|(root, leaf)| {
                !leaf.contains('/')
                    && match self.selection {
                        Target::Auto => root.ends_with(".app") && bundle::outer_app(root),
                        Target::Bundle(asked) => bundle::matches_path(root, asked),
                        Target::Executable(_) => false,
                    }
            })
        {
            if self.candidates.len() == 64 {
                self.dropped_candidates = true;
                return Ok(false);
            }
            if size < 8 {
                return Ok(false);
            }
            let mut architectures = Vec::new();
            let outcome =
                macho::scan(&mut Window::new(source, offset, size)?, &mut architectures).await;
            if !architectures.is_empty() {
                out.candidate_executables.push(ExecutableCandidate {
                    path: path.to_owned(),
                    size,
                    architectures: architectures.clone(),
                });
            }
            if let Err(error @ (ScanError::Budget | ScanError::Source(_))) = outcome {
                return Err(error);
            }
            self.candidates.push(Candidate {
                path: path.to_owned(),
                size,
                architectures,
                outcome,
            });
        }
        Ok(false)
    }

    pub(crate) fn missing(&self) -> ScanError {
        if matches!(self.selection, Target::Executable(_)) {
            ScanError::NotFound("declared standalone executable in sequential archive")
        } else if self.target.is_none() {
            ScanError::NotFound("app Info.plist in sequential archive")
        } else if self.dropped_candidates {
            ScanError::Limit("too many executable candidates before Info.plist")
        } else {
            ScanError::NotFound("declared executable in sequential archive")
        }
    }

    pub(crate) fn is_executable_path(&self, path: &str) -> bool {
        let Some(path) = bundle::archive_path(path) else {
            return false;
        };
        match self.selection {
            Target::Executable(asked) => bundle::matches_path(path, asked),
            _ => self.target.as_deref() == Some(path),
        }
    }
}
