# Portal Project - Codex Notes

## Current State
- Runtime backend is Supabase only.
- Historical backend notes are reference-only and should not be used in runtime code.
- Stack: Vanilla JS (ES modules) + HTML + CSS.
- Main files: `index.html`, `script.js`, `style.css`.
- Full handoff details live in `AGENTS.md`.

## Working Rules
- Keep new feature logic in `modules/`.
- Keep `script.js` as the entry point only.
- Prefer Supabase or front-end solutions before introducing more backend work.
- Stay within GitHub Pages + Supabase Free unless the user explicitly asks otherwise.
- Mention Vercel only as a conditional alternative, not the default plan.
- Do not add old backend SDK imports, listeners, or network requests back into runtime code.

## Design
- For large UI work, start with Stitch.
- Design home, modals, and major panels for PC, mobile, light, and dark together.
- Preserve existing `id` attributes and `data-*` hooks when changing DOM structure.
- If the user is not specific about visuals, let Stitch make the visual call after functional requirements are fixed.

## Supabase
- Runtime persistence goes through `modules/supabase.js`.
- Keep schema changes in `supabase/*.sql` and keep `supabase/config.toml` aligned with them.
- Important user-scoped tables include `user_accounts`, `user_preferences`, `user_lock_pins`, `user_profiles`, `user_section_orders`, `private_sections`, `private_cards`, `user_todos`, `user_email_contacts`, `user_drive_links`, `user_drive_contacts`, `user_notice_reads`, `user_chat_reads`, and `attendance_entries`.
- Shared feature tables include the current public cards, notices, requests, tasks, chat, drive, calendar, order, and suggestion-box tables already in `supabase/`.
- `supabase/seed.sql` is a no-op placeholder for local resets.

## Repo Hygiene
- Keep secrets out of the repository.
- Do not revert user changes unless the task explicitly asks for it.
- Follow the repo workflow when finishing a task: commit and push if requested.

## Note
- Treat old backend-specific notes as historical only.
