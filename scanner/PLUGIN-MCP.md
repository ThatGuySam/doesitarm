# Plug-in limits for MCP connectors

Claude and ChatGPT users link a Does It ARM account. Give each free account **25 single-plug-in lookups or server-side scan requests per UTC day** as a starting quota. Count each plug-in checked, regardless of which connector made the request. Link both connectors to the same account identifier when the user connects both. The browser’s local inventory and CSV/JSON export remain free and require no account.

Return the matched release and format, observed architecture, evidence date and public source for each lookup. A response can include the remaining quota and reset time. Ambiguous queries can return candidates for the user to choose from. Deduplicate retries of the same tool operation so a network retry consumes one credit.

When the quota runs out, return a tool result with a quota-exhausted code, the UTC reset time and a link to higher limits. Suggested wording:

> You’ve used today’s 25 plug-in checks. Your free checks reset at 00:00 UTC. Higher limits are available for larger inventories.

Paid accounts can submit a sanitized CSV or JSON inventory for a **bulk report** against a named macOS and DAW target. The report groups confirmed matches, missing evidence and version or format changes that could affect existing sessions. Make sharing and retention explicit when the inventory is submitted.

Offer a **verified audit** for customers who need a decision about real projects. Use the customer-approved Mac, DAW version, authorized plug-in builds and a test session. Record the host mode, authorization, loading, preset and automation recall, and any fallback. Keep the dated host observations distinct from executable-header evidence.

This is a proposal for the connector and paid workflow. The installed plug-in scanner runs in the browser.
