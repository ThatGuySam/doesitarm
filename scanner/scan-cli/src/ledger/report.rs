use super::{
    Result, classify, import, privacy,
    store::{Record, Store, latest},
};
use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write as _,
    io::Write as _,
    path::Path,
};

fn cell(s: &str) -> String {
    s.replace('|', "\\|")
        .replace(['\n', '\r'], " ")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn counts(doc: &mut String, title: &str, counts: BTreeMap<&str, usize>) {
    writeln!(
        doc,
        "\n## {title}\n\n| Category | Records |\n| --- | ---: |"
    )
    .unwrap();
    for (name, count) in ordered(counts) {
        writeln!(doc, "| {} | {count} |", cell(name)).unwrap();
    }
}

fn ordered<T>(counts: BTreeMap<&str, T>) -> Vec<(&str, T)>
where
    T: Ord,
{
    let mut rows: Vec<_> = counts.into_iter().collect();
    rows.sort_by(|(a, x), (b, y)| y.cmp(x).then_with(|| a.cmp(b)));
    rows
}

fn increments<'a>(counts: &mut BTreeMap<&'a str, usize>, key: &'a str) {
    *counts.entry(key).or_default() += 1;
}

fn describe(record: &Record) -> String {
    format!("`{}` (`{}`)", cell(&record.token), record.ledger_id)
}

pub(super) fn write(store: &Store, scanner: &Path) -> Result<()> {
    let rows = store.records()?;
    let latest = latest(&rows);
    let mut sources = BTreeMap::new();
    let mut statuses = BTreeMap::new();
    let mut classes = BTreeMap::new();
    let mut current_classes = BTreeMap::new();
    let mut all_apps = BTreeSet::new();
    for row in &rows {
        increments(&mut sources, &row.source);
        increments(&mut statuses, &row.status);
        if let Some(class) = &row.failure_class {
            increments(&mut classes, class);
        }
        if !row.token.is_empty() {
            all_apps.insert(row.token.to_ascii_lowercase());
        }
    }
    for r in latest.values() {
        if let Some(class) = &r.failure_class {
            increments(&mut current_classes, class);
        }
    }
    let initial = import::initial_progress(scanner)?;
    let total = import::manifest(scanner)?.len();
    let completed: BTreeSet<_> = rows
        .iter()
        .filter(|r| r.campaign_final)
        .filter_map(|r| r.campaign_entry)
        .collect();
    let mut checked = initial;
    while completed.contains(&(checked + 1)) {
        checked += 1;
    }
    let failures: usize = classes.values().sum();
    let mut doc = format!(
        "# Scan ledger\n\n{} attempt records cover {} distinct app tokens and {} artifact URLs. {} records carry a failure class.\n\n\
        Homebrew catalog progress is **{checked}/{total}** pinned artifacts. This continuation completed {} entries after the original {initial}. The next position is **{}**.\n",
        rows.len(),
        all_apps.len(),
        latest.len(),
        failures,
        checked - initial,
        if checked < total {
            (checked + 1).to_string()
        } else {
            "complete".into()
        }
    );
    counts(&mut doc, "Attempts by source", sources);
    counts(&mut doc, "Attempts by status", statuses);
    counts(&mut doc, "Failure classes across attempts", classes.clone());
    counts(
        &mut doc,
        "Failure classes in the latest URL view",
        current_classes,
    );
    doc.push_str("\n## Most frequent failures\n");
    for (class, _) in ordered(classes).into_iter().take(12) {
        let mut class_rows: Vec<_> = rows
            .iter()
            .filter(|r| r.failure_class.as_deref() == Some(class))
            .collect();
        class_rows.sort_by(|a, b| b.order().cmp(&a.order()));
        let mut seen = BTreeSet::new();
        let examples: Vec<_> = class_rows
            .into_iter()
            .filter(|r| seen.insert(&r.token))
            .take(3)
            .map(describe)
            .collect();
        writeln!(doc, "\n- **{}** — {}", cell(class), examples.join(", ")).unwrap();
    }
    doc.push_str("\n## Changed outcomes\n\n| App and attempt | Previous outcome | New outcome | Change |\n| --- | --- | --- | --- |\n");
    let by_id: BTreeMap<_, _> = rows
        .iter()
        .map(|row| (row.ledger_id.as_str(), row))
        .collect();
    let mut observed = BTreeSet::new();
    let mut grouped = BTreeMap::<_, Vec<&Record>>::new();
    for row in &rows {
        let Some(url) = &row.original_url else {
            continue;
        };
        let Some(date) = &row.scanned_at else {
            continue;
        };
        if row.previous_id.is_none() && row.result.is_some() && row.evidence["stage"].is_null() {
            let target = row
                .settings
                .target
                .as_ref()
                .map(serde_json::Value::to_string)
                .unwrap_or_default();
            grouped.entry((url, target)).or_default().push(row);
        }
        if let Some(before) = row
            .previous_id
            .as_ref()
            .and_then(|id| by_id.get(id.as_str()))
            && let Some(change) = row.change.as_deref().filter(|c| *c != "same")
        {
            observed.insert((
                date,
                before.ledger_id.as_str(),
                row.ledger_id.as_str(),
                change,
            ));
        }
    }
    for attempts in grouped.values_mut() {
        attempts.sort_by(|a, b| a.order().cmp(&b.order()));
        for pair in attempts.windows(2) {
            let (before, after) = (pair[0], pair[1]);
            let same_run = before
                .provenance
                .first()
                .zip(after.provenance.first())
                .is_some_and(|(a, b)| {
                    a.imported_from == b.imported_from && a.original_line == b.original_line
                });
            if !same_run && before.scanner_commit != after.scanner_commit {
                let change = classify::compare(before, after);
                if change != "same" {
                    observed.insert((
                        after.scanned_at.as_ref().unwrap(),
                        before.ledger_id.as_str(),
                        after.ledger_id.as_str(),
                        change,
                    ));
                }
            }
        }
    }
    for (_, before, after, change) in observed.into_iter().rev() {
        let (before, after) = (by_id[before], by_id[after]);
        writeln!(
            doc,
            "| {} | {} | {} | {} |",
            describe(after),
            cell(&before.status),
            cell(&after.status),
            change
        )
        .unwrap();
    }
    let kits = store.root().join("kits");
    if kits.is_dir() {
        let mut verified = Vec::new();
        for entry in kits.read_dir()? {
            let entry = entry?;
            let file = entry.path().join("record.json");
            if file.is_file()
                && let Ok(record) = serde_json::from_slice::<Record>(&std::fs::read(file)?)
            {
                verified.push((
                    record,
                    entry.file_name().to_string_lossy().into_owned(),
                    super::store::used(&entry.path())?,
                ));
            }
        }
        verified.sort_by(|a, b| a.0.token.cmp(&b.0.token));
        doc.push_str("\n## Published replay kits\n\n| App | Failure class | Kit bytes | Folder |\n| --- | --- | ---: | --- |\n");
        for (record, name, size) in verified {
            writeln!(
                doc,
                "| {} | {} | {size} | `kits/{}` |",
                cell(&record.token),
                cell(record.failure_class.as_deref().unwrap_or("unknown")),
                cell(&name)
            )
            .unwrap();
        }
    }
    let safe = privacy::text(&doc);
    store.update_latest(&rows)?;
    store.replace("LEDGER.md", |file| Ok(file.write_all(safe.as_bytes())?))?;
    println!(
        "{checked}/{total} Homebrew artifacts checked. {} attempts, {failures} failures",
        rows.len()
    );
    Ok(())
}
