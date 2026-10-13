/** Run `fn` after the response is sent (Next `after`); outside a request (scripts, tests) just run it now. */
export async function afterResponse(fn: () => Promise<void>): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(fn);
  } catch {
    await fn();
  }
}
