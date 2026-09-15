# README visuals

`banner.svg` is an editable vector using the geometric mark from `src/App.tsx`,
project typography, and a decorative Git/radar diagram. It has no external fonts,
scripts, or linked resources.

The PNGs are actual browser captures of the application, using demo/test data.
They are not native-window captures. Git reads and native session/picker calls
are mocked in the collaboration test; the HTTP/WebSocket backend is real.
No real credentials or invitation codes are shown.

Refresh from the repository root after installing the test prerequisites:

```sh
npm run test:e2e
cp artifacts/workspace-desktop.png docs/images/workspace.png
cp artifacts/readme-dashboard.png docs/images/dashboard.png
cp artifacts/readme-radar.png docs/images/conflict-radar.png
cp artifacts/readme-ambient.png docs/images/ambient.png
```

Review the captures before committing. Raw test output stays in ignored
`artifacts/`; these selected copies belong in Git so relative README image links
work on GitHub. UI labels, paths, and names are intentionally left unchanged.
