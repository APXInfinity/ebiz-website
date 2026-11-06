# EBiZ Back Your Team 2027 — Google Drive Archive + Facebook-First Publishing

**Implementation status:** private Google Drive folders CREATED. Website Facebook timeline embed and a separate curated-public-link feed CODED. **Automation is NOT YET AUTHORIZED OR ACTIVATED.** Application remains prelaunch.

## 1. Primary channel and durable storage

**Exposure:** Facebook EBiZ Page `https://www.facebook.com/MadeByEBiz` is the authoritative PUBLIC publishing channel.

**Mirrored on:** `back-your-team.html#facebook-updates` embeds the official Page timeline, which may include non-competition posts, depends on Facebook availability, and sometimes requires visitor login. A campaign-only safe public feed is already implemented through `data/back-your-team-updates.json`; it has no entries yet and must be updated after verified FB publication. Never let a public form directly update this feed.

**Intake:** existing GitHub Pages form → Supabase private temporary stage → submission receipt → secure, authenticated archived copy on the user's EXISTING personal Google Drive via Google Drive API OAuth. The private Google Drive backup is the intended durable master for uploaded files. Supabase tracks status, audit/receipt and archive metadata; archive excludes all file names containing children's/participant names.

**Archive implementation:** `scripts/archive_team_entries_to_drive.py` uses OAuth for the owner's account, downloads private staged files, uploads videos and signed documents separately, compares the Google Drive-reported MD5 checksum and exact file size to the source copy, then marks `drive_archived_at` and `drive_file_ids` in Supabase. If interrupted, it resumes without making duplicate files. Never auto-shares files, never uploads private content to GitHub, never posts anything to Facebook.

**Deployment:** `.github/workflows/ebiz-drive-archive.yml` is an hourly scheduled run but defaults to **OFF** unless the owner enables repository variable `EBIZ_DRIVE_ARCHIVE_ENABLED=true`. It will not run from an unmerged feature branch. Credential setup below is mandatory.

## 2. Private folder structure created on existing Drive

Location: existing `EBiZ Solutions & Supplies / EBIZ Projects` directory (a non-shared, owner-controlled folder).

- `BACK YOUR TEAM 2027 — PRIVATE`
  - `01 — INCOMING VIDEOS — PRIVATE`
  - `02 — SIGNED CONSENTS & AUTHORIZATIONS — RESTRICTED`
  - `03 — APPROVED SOCIAL VIDEOS — PRIVATE`
  - `04 — CAMPAIGN ADMIN & WINNING TEAM — PRIVATE`

**Do not share any of these folders with external creative contractors, contestants, parent associations, or the public.** Access to consent PDFs should be limited to staff actually verifying consent. The current Google Drive metadata was read back; root and its four immediate children were unshared and owner-only when created.

The real Google Drive folder IDs are deliberately **NOT stored in GitHub repository source**. Populate repository variables for the two archive destinations and admin destination after the owner reviews the folder links in Drive.

## 3. One-time Google Drive OAuth setup required

The existing ChatGPT-connected Google Drive account does NOT mean GitHub Pages/Actions/Supabase has credentials to upload from website visitors. The user must separately authorize a trusted Google Cloud OAuth client.

The current archive worker uses a Google user OAuth refresh token with Drive scope (read/write). It is powerful and must be protected; a future production refinement should use scoped `drive.file` plus Google Picker/app-authorized root folder, or a separately managed dedicated automation account with permissions limited to the contest area, but **don't assume `drive.file` can write to an existing folder created by another app**.

- Create a Google Cloud project with Drive API enabled and an OAuth client configured appropriately (prefer "Desktop" for owner-controlled bootstrap).
- User completes one-time explicit Google OAuth authorization on a TRUSTED local machine. Store `GOOGLE_OAUTH_REFRESH_TOKEN` securely in GitHub Actions Secrets; never type tokens into a public issue, form, chat or code file.
- Set GitHub repository secrets: `EBIZ_SUPABASE_URL`, `EBIZ_SUPABASE_SERVICE_ROLE_KEY`, `EBIZ_GOOGLE_OAUTH_CLIENT_ID`, `EBIZ_GOOGLE_OAUTH_CLIENT_SECRET`, `EBIZ_GOOGLE_OAUTH_REFRESH_TOKEN`.
- Set repository **variables**: `EBIZ_GDRIVE_VIDEO_FOLDER_ID`, `EBIZ_GDRIVE_CONSENT_FOLDER_ID`, `EBIZ_GDRIVE_ADMIN_FOLDER_ID`, and finally `EBIZ_DRIVE_ARCHIVE_ENABLED=true` only after tests.
- Apply updated Supabase SQL migration (includes `drive_archived_at`, `drive_file_ids` columns). If migration already applied before those columns were added, apply the additive ALTER statements separately rather than rerun the whole migration blindly.
- Manually dispatch one test workflow using a synthetic video and synthetic signed-form PDF. Verify Drive file hashes, receipt status and permissions. Do not test with real minors' details.

**Important:** Google's current documentation states standalone service accounts cannot own files in personal My Drive. They normally must use a shared drive or OAuth authorization on behalf of the human user. This design correctly uses owner OAuth.

**Do not enable deletion of staged files yet.** Once archive and admin review are tested, implement controlled scheduled cleanup: delete staging after a verified archive, a safe operational interval and retention rules; preserve dispute evidence under legal hold. A GitHub runner keeps temporary downloaded data only in its ephemeral job workspace.

## 4. Publication safety gate: Facebook FIRST

Process:

1. Representative files entry online; private video + signed guardian/participant and coach/school PDFs are received and archived.
2. EBiZ reviewer checks each **identifiable person** against forms and other school/venue approval requirements; reject missing consent and unsafe/unclear footage. A school principal alone cannot consent for a child, and a guardian alone cannot authorize filming on school property.
3. EBiZ obtains final *approved-for-publication* version, identifies any necessary blurs/edits, records editor/approval timestamps and approves release.
4. EBiZ posts the video/Reel on its OWN official Facebook Page (no participant is required to upload, tag friends, or share).
5. Official Page timeline displays recently published EBiZ posts in the website's Facebook embed when Facebook permits it. That is a live embed, NOT a separately hosted copy.
6. A curator/automation adds only public approved post metadata (title, abstract, publishedAt, public Facebook permalink) into `data/back-your-team-updates.json` so visitors can see a **campaign-specific**, native website list. This curation is NOT automatically connected yet.
7. Any withdrawal/takedown is handled on BOTH Facebook and the campaign-specific JSON mirror, with a written audit record and attention to copies that outsiders reposted.

### Facebook updates payload format (public only)

```json
{
  "schema": 1,
  "description": "Public approved Facebook post links only",
  "updatedAt": "2027-02-01T11:00:00+08:00",
  "items": [
    {
      "title": "Finalist team announcement",
      "publishedAt": "2027-02-01T11:00:00+08:00",
      "summary": "Meet one of the approved finalists.",
      "url": "https://www.facebook.com/MadeByEBiz/posts/VALID_PUBLIC_POST_ID"
    }
  ]
}
```
(The illustrative post ID is a PLACEHOLDER, never publish this fictional example.)

Do not add Facebook access tokens, private Drive links, participants' personal details, unsigned consent PDFs or original submissions to this public file.

**Make integration**: existing EBiZ Telegram → Make → FB pipeline has two active free scenarios; avoid assuming a third free scenario can be added. A future extension of the *existing publishing scenario*, once its actual module output has been inspected, can capture the successfully posted Facebook permalink and update the safe JSON feed using a securely stored GitHub credential. Do not expose private raw entry files to the social automation. Do not write website mirror until FB publish reports success.

## 5. Risks / gaps / operational decisions

- **No backend Google OAuth credentials configured yet.** Folder exists; no automatic transfers have happened.
- **No operational upload system** until original Supabase/Turnstile setup and DTI permit are completed.
- **No automatic Facebook challenge-only post synchronization** yet. The page timeline embed is implemented and will refresh from the public Facebook Page, while the curated challenge list requires a publisher sync.
- **No automatic voting** yet; no fabricated engagement counts.
- Google Drive private archive does not remove the need for compliant retention/deletion, consent and documented reviewer access.
- Facebook iframe visibility can be blocked by consent settings, ad blockers, mobile browser rules or Facebook itself; direct EBiZ Page link remains visible.
- OAuth full-Drive scope is sensitive; review credential risk before putting a refresh token in GitHub. A private server/n8n deployment can hold the same automation credential if preferable.
- Keep personal data offline and separate from the public Github repo; do not share an entire campaign folder as a shortcut to showcase entries.

## 6. Success acceptance criteria

- App can accept one complete test entry with synthetic data, and receipt is server-issued.
- Files are private in Supabase, copied to intended Drive subfolders and checksums match.
- Private Drive folders never have `anyone` permission and are excluded from creative-team access.
- EBiZ FB Page receives ONLY manually approved video; Facebook is canonical link.
- A new public FB Page post appears in website's embedded timeline where Facebook allows.
- One approved campaign-specific permalink is mirrored separately after it is actually published.
- A withdrawn entry is unpublished/taken down in the controlled locations and logged.
