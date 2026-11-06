/* Public display configuration only. NEVER store credentials or service role secrets here.
   The actual application window and permit gate must also be enforced server-side. */
window.EBIZ_CHALLENGE = Object.freeze({
  title: "EBiZ Back Your Team 2027",
  status: "prelaunch", // prelaunch | open | closed — after DTI approval ONLY
  permitNumber: "",   // Insert the issued DTI permit number before opening
  entryOpens: "2027-01-11T08:00:00+08:00", // PROPOSED; subject to permit approval
  entryCloses: "2027-01-24T23:59:00+08:00",
  votingOpens: "2027-02-01T12:00:00+08:00",
  votingCloses: "2027-02-07T23:59:00+08:00",
  winnerAnnouncement: "2027-02-10T18:00:00+08:00",
  maxKits: 18,
  videoLimitMb: 45,
  maxConsentMb: 20,
  maxEndorsementMb: 10,
  supabaseUrl: "",    // Public project URL only; never service-role credentials
  supabaseAnonKey: "",// Public anon key for signed upload client
  edgeFunction: "submit-team",
  turnstileSiteKey: "" // Public Cloudflare Turnstile site key
});
