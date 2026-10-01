# Documentation

Start with the [project README](../README.md) for setup and the repository layout.

## Development

- [Code map and data flow](codebase.md)
- [Detailed setup, product behavior and troubleshooting](development.md)
- [Backend API, permissions, configuration and migrations](../backend/README.md)
- [Website sources and GitHub Pages publishing](../website/README.md)

## Distribution and operations

- [Arch Linux build and installation](arch-linux.md)
- [Desktop releases and backend deployment](desktop-release.md)
- [Security review and deployment conditions](security-review.md)
- [Screenshot provenance and regeneration](images/README.md)

## Design and validation

These are dated records. Successful checks in an older record do not validate
later source changes.

- [0.2.0 phase 1: pilot baseline and native checklist](history/validation-0.2.0-phase-1.md)
- [0.2.0 phase 2: first launch and error recovery](history/validation-0.2.0-phase-2.md)
- [0.2.0 phase 3: navigation and Settings design](history/design-0.2.0-phase-3.md)
- [0.2.0 phase 3: delivered behavior and validation](history/validation-0.2.0-phase-3.md)

## Website files

`index.html`, `assets/`, `images/`, `downloads/`, and `.nojekyll` are used by the
published GitHub Pages site. The generated HTML/CSS/JavaScript and the Arch package
are intentionally tracked. Edit website sources in `website/`, then rebuild there.

Private working notes are kept in `docs/local/`, which is ignored by Git.
