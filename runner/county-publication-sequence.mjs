/** Sequencing only: owns no paths, policy authority, or filesystem operations.
 * Production supplies closed-over fixed-input actions, never caller hooks.
 */
export async function countyPublicationSequence({ revalidate, publish, inspect, recovery, signal }) {
  await revalidate();
  signal?.throwIfAborted();
  await publish();
  try {
    signal?.throwIfAborted();
    return await inspect();
  } catch {
    const error = Error('Published county derivative requires inspection; preserve its manifest.');
    error.recovery = Object.freeze({ ...recovery, status: 'published-inspection-required', retry_authorized: false });
    throw error;
  }
}
