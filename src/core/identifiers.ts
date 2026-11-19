/** Reject, never truncate/normalize: lock keys must name the same physical objects. */
export function isCanonicalIdentifier(value: unknown): value is string {
    return typeof value === 'string' && /^[a-z_][a-z0-9_]*$/.test(value) && Buffer.byteLength(value, 'utf8') <= 63;
}
