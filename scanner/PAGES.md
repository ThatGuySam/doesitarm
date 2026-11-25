# Download page resolution

The scanner is adding a bounded, static path from a public download page to a Mac artifact. The page resolver proposes links with provenance. The Worker controls which links it follows and tests the file response before passing it to the range scanner.

Both research runs are available under `../doesitarm-data/download-pages` from the checkout's parent directory. The Sol sample contains 100 rows and 73 pages with header-verified candidates. The Astra sample contains 100 rows and 61 pages with one-byte range evidence. These counts use different verification criteria. Replay preserves both criteria and reports results by seat and exposure pattern.

The initial root limit is 2 MiB decoded. The research captures for Elgato and Figma exceeded 1 MiB in their original responses. Follow-up documents are limited to 512 KiB. The Worker budgets three redirects, three candidate actions and a single intermediate document level. All inputs, redirects and candidates are untrusted. Returned source evidence is inert text.
