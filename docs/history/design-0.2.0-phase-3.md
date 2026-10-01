# Phase 3 — navigation and Settings design

2026-09-25. Implementation authorized by the user. Reviewed DesktopApp,
App, LanguageSettings, AmbientPlayer and ConflictRadar against source and the
local code index. Existing square dialogs and dark surfaces remain the visual basis.

## Screen sketches

```text
Dashboard                         Room
[Settings] DiGitA / account        [Settings] DiGitA / account
Your team spaces                  All rooms / room name / connection
Create room / Join / Create team   Sharing status / explicit consent / stop sharing
Team name / role / Team menu       Playback / personal listening
  Room cards → Enter room          Radar / people / timeline / local Git

Settings (dedicated full-window dialog; workspace remains mounted)
Close settings / return to work
Account and profile | account initials, display name, private email
Projects            | active local repository and session-only behavior
Privacy             | active sharing status, metadata choices, stop sharing
Audio and notifications | personal volume, explicit OS notification opt-in
Language            | English / Czech; immediate change and storage feedback
About               | pilot version, quick start, current limitations
```

## Main journeys and state ownership

- Dashboard → room → Settings → volume/privacy → Close/Escape → same room,
  repository, WebSocket, listening state and filters. Settings never remounts work.
- Login/local mode → Settings → language → return: drafts and local work survive.
- Team menu → administration panel → create invitation, subject to current role.
  Member/role editing and invitation listing remain phase 5. Personal Settings
  contains no team administration.
- Settings changes apply immediately; language reports persistence failures.
  Volume, notifications and sharing remain session-only. There is no pending
  Settings draft to discard. Creation forms retain drafts on failures and while
  Settings is open; switching/cancelling a filled form asks before discarding.
- Sharing consent stays explicit in the room. Metadata toggles live in Privacy;
  withdrawing sharing is available both there and in the room. No new persistence.

## Profile editor design for phase 5

Account and profile shows the current account card now. The future editor will
place bundled avatar/initials and allowed background colors beside a live preview,
then display name (80 characters) and custom status (120 characters). Label the
status as custom text, separately from online presence. Include reset avatar and
clear status. Explain team visibility before Save. Keep edits on failed saves;
show success only after the validated account API responds. Dirty navigation
will offer Keep editing / Discard. Do not ship inactive editing controls before
that API and authorization exist.

## Verification goals

Keyboard focus enters Settings and returns to its trigger; Escape closes it.
At 800×600 the navigation wraps and content scrolls without horizontal overflow.
Exercise volume, metadata withdrawal, team menus, language, failed requests and
returning to an active room. Browser mocks do not validate OS audio/keyring or
notifications. Native two-client checks remain explicitly deferred.
