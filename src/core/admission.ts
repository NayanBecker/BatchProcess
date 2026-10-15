/** Command-scoped cancellation is sticky even after a manager finishes stop(). */
export function assertAdmissionAllowed(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('Execução interrompida antes da admissão');
}
