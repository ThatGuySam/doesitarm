# Secondary binary alongside the launcher

Build the app with `fat.macho` at `Contents/MacOS/Launch` and `thin.macho` at `Contents/MacOS/helper tool`. The previous folder scanner skipped all paths under `Contents/MacOS`. The app should have a verified universal launcher and the helper should appear once as a separate Mach-O with the enclosing app as its parent.
