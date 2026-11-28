# Plugin packages

- `chatgpt/` is the source for the ChatGPT and Codex plugin directory package (Agent Plugins format). Build the upload ZIP from inside that folder: `zip -r ../doesitarm-chatgpt-plugin.zip plugin.json mcp.json assets skills`. The ZIP itself is not committed.
- The MCP server it points to is `workers/mcp`, live at https://mcp.doesitarm.com/mcp.

- `claude-code/` is the Claude plugin (MCP connector plus the inventory skill), pointing at the same URL as the Claude directory connector. Submit it at https://claude.ai/directory/manage with repository `ThatGuySam/doesitarm` and plugin path `plugins/claude-code`, then pair it with the Does It ARM connector.
