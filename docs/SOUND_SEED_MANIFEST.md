# 🔊 Seeded Sound Effects Manifest — أصوات Mixkit المنزَّلة

**Seeded on prod: 2026-07-03** — 24 records / 27 files covering 30+ event keys, inserted directly into
`sound_effects` (uploaded_by = `seed-mixkit`) with files in the `uploads_data` volume at
`/app/uploads/sounds/seed_*.mp3`. Managed like any upload: replace/deactivate from **لوحة التحكم ← المؤثرات الصوتية**.
Keys already actively assigned by admin uploads were **skipped** (the seed SQL guards with
`WHERE NOT EXISTS (... event_keys ?| ...)`) — at seed time those were: `win_mafia`, `win_citizen`,
`win_assassin`, `ambient_lobby`, `ambient_night`, `ambient_voting`, `ambient_night_*`.

**License:** [Mixkit Free Sound Effects License](https://mixkit.co/license/#sfxFree) — free for
commercial/non-commercial use, no attribution required. Source pattern:
`https://assets.mixkit.co/active_storage/sfx/{ID}/{ID}-preview.mp3`

The Web-Audio synth in `frontend/src/lib/soundManager.ts` remains **only as a last-resort fallback**
if a record is deleted/deactivated — with these files present it never fires.

| File (`seed_*.mp3`) | Mixkit ID | Original title | Event keys |
|---|---|---|---|
| timer_tick | 1061 | Clock ticker single | timer_tick |
| timer_heartbeat_slow | 490 | Human single heart beat | timer_heartbeat_slow |
| timer_heartbeat_fast | 2294 | Drum bass hit | timer_heartbeat_fast |
| timer_buzzer | 1007 | Emergency alert alarm | timer_buzzer |
| leader_gallery_alert | 1004 | Critical alarm | leader_gallery_alert |
| vote_cast | 2568 | Cool interface click tone | vote_cast |
| vote_shift | 1490 | Fast whoosh transition | vote_shift |
| voting_complete | 951 | Positive notification | voting_complete |
| day_tie | 227 | Ominous drums | day_tie |
| silence_ghost | 2623 | Ghostly whoosh passing | day_show_silenced, night_silence, morning_silenced |
| bomb_explosion | 2800 | Bomb explosion in battle | bomb_explosion |
| kill_gunshot | 1662 | Game gun shot | night_assassination, morning_assassination_success |
| assassin_knife | 2184 | Knife fast hit | night_assassin, morning_assassin_kill |
| snipe_echo | 1700 | Gun explosion with long echo | night_snipe, morning_snipe_mafia, morning_snipe_citizen |
| protection_ring | 2344 | Magic notification ring | night_protection, morning_protection_success |
| investigation_scan | 2847 | Data scaner | night_investigation |
| policewoman_whistle | 614 | Police whistle | morning_policewoman |
| cardflip_light | 960 | Tile game reveal | card_flip_citizen, card_flip_sheriff |
| cardflip_dark | 557 | Deep dark horror drum | card_flip_mafia, card_flip_godfather |
| elimination_mafia | 563 | Drum deep impact | elimination_mafia |
| elimination_citizen | 2024 | Losing piano | elimination_citizen |
| win_jester | 2984 | Funny melody audio logo | win_jester |
| drumroll | 566 | Drum Roll | drumroll |
| impact_boom | 549 | Deep cinematic subtle drum impact | impact_boom |

**Re-seed / restore:** re-download any file from the URL pattern above, `docker cp` it to
`mafia-prod-backend-1:/app/uploads/sounds/`, and insert a `sound_effects` row (jsonb `event_keys`,
`is_active=true`). DB backup taken before seeding: `~/backup_before_sound_seed_20260703.sql.gz`.
