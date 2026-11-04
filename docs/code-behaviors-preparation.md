# Code Behaviors preparation

This is a technical preparation note, not a task description or submission form.
The participant must write the task description, flags, comparisons and finish note personally,
as required by the supplied Code Behaviors instructions.

## Repository split

`family-frame` contains the portable app and local API. `../family-frame-device` is a separate local
Git repository with the Linux deployment. The latter injects system actions into the app launcher;
the portable server never invokes systemctl, xrandr, driver installers or Git updates.
Use the device repository's migration guide before deploying this split to the existing laptop.
The active configuration was saved to ignored `data/frame.config.device.json` and is automatically
used by the device launcher when present. Shared defaults use a generic city and synthetic calendar.

Both repositories have an MIT license. On 2026-11-04, the GitHub API reported
`ale-fra/family-frame` as **private**. The supplied project document requires a public, permissively
licensed repository; the local preparation does not change GitHub visibility or publish any code.
The app's existing Git history has not been rewritten or audited for public release.

## Create a source archive

```bash
npm test
npm run build
npm run export:code-behaviors
```

The command prints a fresh directory and `family-frame.tar.gz` under ignored `exports/`.
It reads the current working tree, so uncommitted source changes are included. It does not use
`git archive`, initialize Git in the upload, or copy `.git`.

Included: app/server TypeScript and JavaScript source, CSS, tests, build/test configuration,
package/lock files, README, MIT license, `.gitignore`, a placeholder-only `.env.example`, and curated
synthetic examples. The exported package exposes only dev/server/build/test/preview commands.
Public photos, manifests, calendars and config are replaced with curated examples.

Excluded: runtime `data/`, photos, SQLite files, real calendar feeds, `.env`, hardware tools,
operational history, AGENTS.md, skills, workflow files, node_modules, dist and caches.
Symlinks inside source trees are rejected rather than followed.
The exporter is not a general secret or PII detector: review source changes and the final archive.

Extract into a fresh temporary directory, enter its `family-frame` folder, and run:

```bash
npm ci
npm test
npm run build
npm run server
```

Check `/` and `/admin` at `http://127.0.0.1:8787`. The demo uses one synthetic SVG landscape and a
synthetic recurring calendar event; real uploads begin as pending. Weather calls Open-Meteo.
Without the Linux adapter, admin hides monitor controls and device API actions return HTTP 501.

Before uploading, inspect `tar -tzf PATH_TO_ARCHIVE` and review every included file for personal data
or credentials. Archive exclusion does not make the existing Git history safe to publish.
The public-repository prerequisite and other eligibility checks must also be satisfied.
