Local review controls and BGS release metadata.

`viewer-preferences.json` is a merge patch for BGS releases: enable the embedded chat and add/update the sound and colony visibility preferences while preserving all other preferences and viewer fields. Do not PUT this partial file as a full game-info document.

The local viewer has a Playtest tools panel with individual sound buttons and a mute toggle. Chat messages entered in the local preview stay local.

The local playtest tools include a persisted Show colony surface checkbox. Production uses the host preference `showColony`; register the declaration in `viewer-preferences.json` when the colony design is approved for release.
