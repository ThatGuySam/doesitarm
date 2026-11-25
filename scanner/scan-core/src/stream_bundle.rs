use crate::{
    BinaryInventory, ExecutableCandidate, ReadAt, Result, ScanError, ScanResult, Target, Window,
    bundle,
    decode::DecodeBudget,
    inventory::{self, Allowance},
    launcher::{self, Candidate, Standalone},
    macho,
};

/// When the executable precedes its plist, retain observations for plausible
/// main executable paths until CFBundleExecutable confirms which one to use.
#[derive(Default)]
pub(crate) struct StreamBundle<'a> {
    selection: Target<'a>,
    mount: Option<String>,
    target: Option<String>,
    candidates: Vec<Candidate>,
    dropped_candidates: bool,
    primary: Option<Result<()>>,
    alias: Option<String>,
    alias_candidate: Option<Candidate>,
    inventory: Option<BinaryInventory>,
    allowance: Option<Allowance>,
    skipped_prefix: bool,
    standalone: Standalone,
}

impl<'a> StreamBundle<'a> {
    pub(crate) fn new(selection: Target<'a>) -> Self {
        Self {
            selection,
            ..Self::default()
        }
    }

    pub(crate) fn with_mount(mut self, mount: Option<String>) -> Self {
        self.mount = mount;
        self
    }

    pub(crate) fn with_target(mut self, target: String) -> Self {
        self.target = Some(target);
        self
    }

    fn member_path<'b>(&self, path: &'b str) -> Option<std::borrow::Cow<'b, str>> {
        let path = bundle::archive_path(path)?;
        Some(match &self.mount {
            Some(root) => std::borrow::Cow::Owned(format!("{root}/{path}")),
            None => std::borrow::Cow::Borrowed(path),
        })
    }

    pub(crate) async fn file(
        &mut self,
        source: &mut impl ReadAt,
        work: &DecodeBudget<'_>,
        path: &str,
        offset: u64,
        size: u64,
        out: &mut ScanResult,
    ) -> Result<bool> {
        let Some(path) = self.member_path(path) else {
            return Ok(false);
        };
        let path = path.as_ref();
        if let Some(runtime) = out.script_runtime.as_mut()
            && runtime.path == path
            && runtime.architectures.is_empty()
        {
            macho::scan(
                &mut Window::new(source, offset, size)?,
                &mut runtime.architectures,
                None,
            )
            .await?;
            if let Some(relative) = out
                .bundle_path
                .as_deref()
                .and_then(|root| inventory::relative(path, root))
            {
                self.inventory
                    .get_or_insert_with(BinaryInventory::default)
                    .push(
                        path.to_owned(),
                        inventory::role(relative).unwrap_or("runtime"),
                        runtime.architectures.clone(),
                    );
            }
            return Ok(matches!(self.selection, Target::Executable(_)));
        }
        if let Target::Executable(requested) = self.selection {
            if self.primary.is_some() || !bundle::matches_path(path, requested) {
                return Ok(false);
            }
            let candidate =
                read_candidate(source, path, offset, size, out.diagnostic.is_some()).await?;
            out.executable_path = Some(candidate.path.clone());
            let primary = candidate.apply(out);
            if out.script_runtime.is_some() {
                self.primary = Some(primary);
                return Ok(false);
            }
            primary?;
            return Ok(true);
        }

        if self.target.as_deref() == Some(path) && self.primary.is_none() {
            let candidate =
                read_candidate(source, path, offset, size, out.diagnostic.is_some()).await?;
            self.primary = Some(candidate.apply(out));
            return Ok(false);
        }

        if self.target.is_none()
            && let Some(root) = bundle::selected_plist(path, self.selection)
        {
            out.bundle_path = Some(root.to_owned());
            self.standalone = Standalone::default();
            if size > bundle::MAX_PLIST {
                return Err(ScanError::Limit("bundle Info.plist exceeds 2 MiB"));
            }
            let plist = source.read_at(offset, size as usize).await?;
            let target = bundle::apply_plist(&plist, root, out, true)?;
            out.candidate_executables.clear();
            self.alias = bundle::contents_relative_alias(&target, root);
            for candidate in std::mem::take(&mut self.candidates) {
                if candidate.path == target && self.primary.is_none() {
                    self.primary = Some(candidate.apply(out));
                } else if self.alias.as_deref() == Some(candidate.path.as_str()) {
                    self.alias_candidate = Some(candidate);
                } else if let Some(relative) = inventory::relative(&candidate.path, root) {
                    self.inventory
                        .get_or_insert_with(BinaryInventory::default)
                        .push(
                            candidate.path.clone(),
                            inventory::role(relative).unwrap_or("helper"),
                            candidate.architectures,
                        );
                }
            }
            self.target = Some(target);
            return Ok(false);
        }

        if self.alias.as_deref() == Some(path) && self.primary.is_none() {
            self.alias_candidate =
                Some(read_candidate(source, path, offset, size, out.diagnostic.is_some()).await?);
            return Ok(false);
        }

        let root = out.bundle_path.as_deref().or_else(|| {
            let (root, _) = path.split_once("/Contents/")?;
            match self.selection {
                Target::Auto => (root.ends_with(".app") && bundle::outer_app(root)).then_some(root),
                Target::Bundle(asked) => bundle::matches_path(root, asked).then_some(root),
                Target::Executable(_) => None,
            }
        });
        let Some(relative) = root.and_then(|root| inventory::relative(path, root)) else {
            return Ok(false);
        };
        let Some(role) = inventory::role(relative) else {
            return Ok(false);
        };
        if size < 8 || self.target.as_deref() == Some(path) {
            return Ok(false);
        }

        // A sequential format can place the executable before its plist.
        // Keep primary candidates even on the network profiles.
        let early_main = self.target.is_none()
            && relative
                .strip_prefix("Contents/MacOS/")
                .is_some_and(|leaf| !leaf.contains('/'));
        if early_main {
            if !work.local() && self.candidates.len() == 64 {
                self.dropped_candidates = true;
                self.skipped_prefix = true;
                return Ok(false);
            }
            let candidate =
                read_candidate(source, path, offset, size, out.diagnostic.is_some()).await?;
            if !candidate.architectures.is_empty() && out.candidate_executables.len() < 64 {
                out.candidate_executables.push(ExecutableCandidate {
                    path: path.to_owned(),
                    size,
                    architectures: candidate.architectures.clone(),
                });
            }
            self.candidates.push(candidate);
            return Ok(false);
        }
        if self.primary.is_none() && !work.local() {
            self.skipped_prefix = true;
            return Ok(false);
        }

        let allowance = self
            .allowance
            .get_or_insert_with(|| Allowance::new(source, work));
        let full = self.inventory.get_or_insert_with(BinaryInventory::default);
        allowance.step(source, work)?;
        if let Err(error) =
            inventory::read(&mut Window::new(source, offset, size)?, path, role, full).await
        {
            if inventory::stop(&error) {
                return Err(error);
            }
            full.partial(error.to_string());
        }
        Ok(false)
    }

    pub(crate) async fn standalone_file(
        &mut self,
        source: &mut impl ReadAt,
        work: &DecodeBudget<'_>,
        path: &str,
        offset: u64,
        size: u64,
        diagnostic: bool,
    ) -> Result<()> {
        if self.target.is_none()
            && matches!(self.selection, Target::Auto)
            && size >= 8
            && let Some(path) = launcher::standalone_path(path)
            && self.standalone.allow(work)
        {
            let data = &mut Window::new(source, offset, size)?;
            self.standalone.inspect(data, path, diagnostic).await?;
        }
        Ok(())
    }

    /// Enforce a limit on post-primary traversal even when it only skips
    /// non-bundle members in a sequential stream.
    pub(crate) fn check_traversal(
        &mut self,
        source: &impl ReadAt,
        work: &DecodeBudget<'_>,
    ) -> Result<()> {
        if self.primary.is_some() && !work.local() {
            self.allowance
                .get_or_insert_with(|| Allowance::new(source, work))
                .step(source, work)?;
        }
        Ok(())
    }

    pub(crate) fn finish(mut self, traversal: Result<()>, out: &mut ScanResult) -> Result<()> {
        if self.target.is_none() && matches!(self.selection, Target::Auto) && traversal.is_ok() {
            let missing = self.missing();
            return self.standalone.finish(out, missing);
        }
        if self.primary.is_none()
            && traversal.is_ok()
            && let Some(candidate) = self.alias_candidate.take()
        {
            out.executable_path = Some(candidate.path.clone());
            out.executable_resolution = Some("contents_relative");
            self.primary = Some(candidate.apply(out));
        }
        if out.bundle_path.is_some() {
            let mut inventory = self.inventory.take().unwrap_or_default();
            let root = out.bundle_path.as_deref().unwrap();
            inventory.binaries.retain_mut(|binary| {
                let Some(relative) = inventory::relative(&binary.path, root) else {
                    return false;
                };
                binary.path = relative.to_owned();
                true
            });
            if let Err(error) = &traversal {
                inventory.partial(error.to_string());
            }
            if self.skipped_prefix {
                inventory.partial("bundle entries before the primary executable were skipped");
            }
            if self.primary.is_none() {
                inventory.partial("primary executable was unavailable");
            }
            out.inventory = Some(inventory);
        }
        let primary = match self.primary {
            Some(primary) => primary,
            None => traversal.and_then(|()| {
                if matches!(self.selection, Target::Executable(_)) && out.executable_path.is_some()
                {
                    Ok(())
                } else {
                    Err(self.missing())
                }
            }),
        };
        bundle::confirm_executable(out, primary)
    }

    fn missing(&self) -> ScanError {
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
        let Some(path) = self.member_path(path) else {
            return false;
        };
        let path = path.as_ref();
        match self.selection {
            Target::Executable(asked) => bundle::matches_path(path, asked),
            _ => self.target.as_deref() == Some(path),
        }
    }
}

async fn read_candidate(
    source: &mut impl ReadAt,
    path: &str,
    offset: u64,
    size: u64,
    diagnostic: bool,
) -> Result<Candidate> {
    launcher::observe(&mut Window::new(source, offset, size)?, path, diagnostic).await
}
