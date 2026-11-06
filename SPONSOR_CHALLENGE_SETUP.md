# EBiZ — Back Your Team 2027 | PRIVATE BUILD / LAUNCH CHECKLIST

**Architecture update (November 6, 2026):** EBiZ's existing private Google Drive has been prepared as the durable storage location for approved and unapproved video submissions and consent documents, with checksum-verified archival from temporary Supabase intake. Facebook is the primary publication channel, and its public Page feed is embedded on the sponsor website. Read [DRIVE_AND_FACEBOOK_WORKFLOW.md](DRIVE_AND_FACEBOOK_WORKFLOW.md) for the new Google OAuth, Drive folder permission, archiver activation and mirroring steps. **Neither Google Drive synchronization nor the contest application is live until credentials, permit and end-to-end tests are complete.**

Status: **NOT LIVE.** The website route, consent pack, database schema and Edge Function are implemented in the feature branch. The current public EBiZ site is unchanged until this PR is merged.

## Architecture
- Static front-end: `back-your-team.html`, `assets/team-challenge.js`, and `sponsor-config.js`.
- Printable school/coach/participant/guardian signing pack: `forms/sponsorship-consents.html`.
- Supabase PostgreSQL: private `team_sponsor_submissions` table, hashed 24-hour throttle, no anon select access.
- Supabase Storage: private `team-entry-private` bucket. File uploads use signed two-hour, single-path URLs created by the server; no file is public.
- Edge Function: `supabase/functions/submit-team/index.ts`, for Turnstile verification, server-enforced deadlines, cap checks, duplicate prevention, signed upload tickets and final receipt.
- The team uploads one MP4, one combined signed-participant PDF, one signed-institution PDF.
- **All submissions are PENDING MANUAL REVIEW, never auto-posted.** The project does NOT yet implement public voting, automated email notification, content scanning, authentication of signers, or retention deletion jobs.

## Deployment prerequisites — all mandatory

1. **Legal + scope:** Ask DTI Region VIII to classify the proposed public, brand-building video contest and issue the appropriate permit BEFORE promoting/opening. Get legal review on: exact competition rules, 70/30 scoring and voting controls, province scope, eligibility, prize market value, number of pieces in each uniform set, tax burden (DTI application asks who shoulders 20% tax when prize > ₱10,000), claim period (at least 60 days), disqualification, appeal, and permitted schedule. Include screenshots of the entry portal, consent forms, upload program description and anti-fraud controls. Use current DTI-accepted text, then version-lock it. Schools may require their OWN official DepEd media release in addition to this template.
2. **Storage / budget:** Create a separate Supabase project in a region approved for your lawful processing. **Free plan has 50MB max per-file and only 1GB storage total**, so 25–30 applications could exhaust it (video <=45MB + PDFs). Before advertising, either pay for enough private storage or reduce file caps and cap registrations explicitly in DTI mechanics; no silent first-come truncation. Confirm vendor data-processing contract / cross-border data handling and data retention.
3. **SQL migration:** Apply `supabase/migrations/20261106_team_sponsor.sql` in the Supabase SQL editor. Confirm RLS and private bucket. NEVER add policies permitting anonymous list/read/download or insert into the submission table.
4. **Bot protection:** Create a Cloudflare Turnstile widget restricted to the official host `apxinfinity.github.io`; obtain site key (public) and secret key (server only). Test from real device.
5. **Edge Function:** Install Supabase CLI. Deploy via `supabase functions deploy submit-team --no-verify-jwt` AFTER reviewing deployment config and secrets. This is a public function deliberately protected by Turnstile, signed claim tokens, origin filtering, and throttling — never expose the service key to the browser.
6. **Set secrets** with `supabase secrets set` or dashboard:
   - `TURNSTILE_SECRET_KEY`: secret from Cloudflare.
   - `ABUSE_HASH_SALT`: random 32+ byte value; do NOT use a predictable value.
   - `ALLOWED_ORIGIN=https://apxinfinity.github.io`
   - `PROMO_STATUS=prelaunch` (keep closed until permit and live tests)
   - `PROMO_PERMIT_NUMBER=<actual-issuance-number>`
   - `PROMO_ENTRY_OPENS=2027-01-11T08:00:00+08:00` **tentative**
   - `PROMO_ENTRY_CLOSES=2027-01-24T23:59:00+08:00` **tentative**
   - `SUPABASE_URL` and a server-only `SUPABASE_SECRET_KEY` or legacy `SUPABASE_SERVICE_ROLE_KEY`. These are usually provided securely by Supabase; verify configuration.
7. **Public config:** Set Supabase URL, public anon/publishable key, Turnstile public site key, exact *approved* dates, permit number in `sponsor-config.js`. The branch's `status` defaults to `prelaunch`; change to `open` ONLY after DTI approval and an end-to-end secure upload test. The server must also be explicitly changed to `PROMO_STATUS=open`.
8. **Data subject rights and retention:** Set up a private privacy inbox or named staff channel via the EBiZ website; document withdrawal/deletion response SLA. Implement/commission server-side scheduled deletion from **both** storage AND database for 2-hour abandoned drafts, 30-day abuse fingerprints, and 180-day nonwinning material. Maintain preservation holds for disputes. The draft privacy notice proposes 24 months for winning team claims records and 12 months public content use — obtain counsel's review.
9. **Manual review / safeguarding:** Assign at least TWO reviewers; use a private checklist to review each file: signer identities/authority, principal authorization for school entries, official DepEd school forms where necessary, original adult signatures, guardian permissions and child assent, actual video scene identities, real H.264 portrait 30–60 secs min 720×1280, copyrighted sounds, safe filming, no bullying/learner IDs, location/brands, 6–18 kits. Never send a raw signed PDF through Messenger or post one to Facebook.
10. **Receipt + recovery:** A submission is only official after a server-generated `EBT27-...` receipt. Implement admin-assisted recovery for interrupted signed uploads (currently 2-hour token; avoid asking applicant to re-enter as a second official submission). Email confirmation is NOT currently configured; dashboard receipts must be monitored manually.
11. **Voting:** Build a separate verified public voter endpoint BEFORE public voting and present its mechanics to DTI. The current registration site describes 30% verified public vote but DOES NOT operate a vote service. Facebook hearts/shares do not count. Minimum anti-fraud: one verified vote/person, identity-proportionate validation, rate limiting, conflict screening, receipt audit trail, vote-freeze timestamp, manual anomaly audit, and an appeals process. Avoid publicly exposing voter PII.
12. **Ads:** Only advertise when permit obtained and compliance clearance given. FB/Meta must not be represented as contest sponsor. Never require people to share, tag friends, buy, or like EBiZ as a condition of eligibility.

## Editorial/legal decisions to lock before application
| Item | Proposed rule |
| --- | --- |
| Coverage | Eastern Visayas / Region VIII, 6 provinces |
| Eligible | Authorized teams, 6–18 rostered kit recipients, 18+ representative |
| Application | Jan 11 8 AM–Jan 24 11:59 PM 2027 (Asia/Manila), tentative |
| Voting | Feb 1 noon–Feb 7 11:59 PM 2027 (Asia/Manila), tentative |
| Announcement | Feb 10 6 PM 2027 (Asia/Manila), tentative |
| Prize | One winning team, up to 18 two-piece playing kits, 1 design, 1 delivery in Region VIII; actual monetary value to be calculated |
| Scoring | 30% story, 25% genuine need/community, 15% authenticity, 30% verified public vote |
| Entry restrictions | One entry per distinct team and one per adult representative; up to 8 finalists |
| Upload limits | MP4 <=45MB, original 30–60s, portrait >=720×1280; two signed PDF packets <=20MB and <=10MB |
| Claim | At least 60 days from announcement/notice, whichever is later |
| Media | Specific non-exclusive time-limited promotion license, no synthetic use / resale |
| Marketing | Optional and independent |

## Important security warnings
- GitHub Pages is a **PUBLIC STATIC HOST**. Never put Supabase secret/service role credentials, signatures, guardians' contact details, raw videos, private file URLs, or attendee rosters in the repository.
- The browser's PDF and metadata checks are convenience checks only; a malicious client can bypass them. Private reviewer must verify signature authenticity and video quality.
- The Edge Function verifies **storage metadata**, not malware or the actual MP4 encoding/scene. Treat all uploads as untrusted; use antivirus/content screening before viewing and before sharing.
- The direct upload URL is valid ~2 hours and cannot be revoked individually; don't allow automated publishing.
- The project is intentionally blocked closed until you deploy credentials, storage protection, review processes, DTI permit and voter service.
- Do not describe this as an 'official EVRAA' or DepEd partnership.

## Minimum tests before production
- Prelaunch blocks form (browser and server).
- Open/close boundary timestamps evaluated in Philippine Standard Time.
- Reject missing guardian consent PDF, missing principal/coach authorization PDF, wrong mime, oversized upload, short video, landscape/low-resolution video, incomplete checkbox, invalid phone, forged rep signature mismatch.
- Replayed duplicate entry, duplicate representative email, expired signed URL, upload interruption, 6th attempt/IP/day, bot token invalid/replayed.
- Confirm private PDF/video 403 for anonymous requests; verify admin-only download, logging and actual deletion.
- Confirm submitted entries remain unpublished until reviewers mark them approved.
- Conduct a 20–30-team simulated storage load test prior to advertising.

## Official research sources
- DTI permit, geography and minimum 60-day prize claim: https://fairtrade.dti.gov.ph/services/sales-promotion-permits/
- Current DTI checklist including online process/screenshots and prize tax: https://dtiwebfiles.s3.ap-southeast-1.amazonaws.com/Downloadable%2BFiles/Sales%2BPromotion/Sales-Promotion-Permit-Application-Form.pdf
- NPC photos/videos and Data Privacy Act: https://privacy.gov.ph/reminder-on-sharing-photos-and-videos-containing-personal-data/ ; https://privacy.gov.ph/data-privacy-act/
- DepEd media release form example: https://www.deped.gov.ph/wp-content/uploads/DM_s2025_016.pdf
- Supabase free file/storage limits: https://supabase.com/docs/guides/storage/uploads/file-limits ; https://supabase.com/pricing
