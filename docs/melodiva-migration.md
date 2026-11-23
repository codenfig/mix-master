# Melodiva AI cutover: source cleanup safeguards

The source music-generation code is staged for removal **only on** `migration/remove-music-generation`. The default branch has not been cleaned up. This branch is based on MixMaster's `feature/energy-music-mix` integration snapshot `2db2f54aa99eca5d95f406404c6421d8611aa59b`; its PR should target that feature branch rather than inadvertently integrating other pending work into `main`.

The new implementation lives in [Melodiva AI PR #3](https://github.com/codenfig/Melodiva-AI/pull/3), a standalone app with migrated APIs, jobs, generation UI, adapters, and an isolated library.

## Removed from the MixMaster migration branch

- Full-song, lyrics generation/review, text-to-song, extension and commercial licensing backend routers
- Local ACE-Step/MusicGen wrappers and model-launching scripts
- Generation-only tests, technical documentation, and frontend pages/styles
- Generated-song artwork and commercial-license API endpoints
- Generated music categories from the **active MixMaster processing library**

## Retained

- MixMaster Music Mix, Audio Mastering, Stem Splitter, Vocal Remover and Voice Studio
- Existing DSP code and output-library storage used by those tools
- Existing files, metadata records, historical Git commits and databases; **no stored user data is deleted by this cleanup**
- Read-only historical generations in source backups for audit/recovery

## Do not merge until

1. Melodiva web build and backend tests pass.
2. Real configured models generate valid audio in a deployment environment.
3. Existing project drafts, audio objects, song library metadata, artwork and license transactions are migrated and verified in Melodiva.
4. Stripe/customer permissions, model licenses and authentication are reviewed.
5. MixMaster's music mixing, mastering, vocal processing and stored files pass CI and manual smoke tests.
6. Existing users are notified about Melodiva's new URL and any browser-local data export steps.

To transfer local data without deleting source copies, run `tools/migrate_music_data.py` in the Melodiva repository **after taking backups and verifying snapshot consistency**. Its dry-run identifies source music files and related metadata, while `--execute` copies and verifies them. It cannot access locally stored user data from GitHub alone.

The previous MixMaster `~/MixMasterAI/Storage` path is preserved for non-generation processed outputs.
