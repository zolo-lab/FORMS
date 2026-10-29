/** Remembers when the e2e run started, so the teardown removes only what this run created. */
export default function globalSetup() {
  process.env.E2E_STARTED_AT = new Date(Date.now() - 60_000).toISOString();
}
