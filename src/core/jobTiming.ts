export interface JobTiming {
    activeMs: number; pausedMs: number; lastAt: number;
    phase: 'active'|'paused'|'terminal'|'unknown'; uncertain: boolean;
}
/** Checkpoint-bounded operational time, not a microbenchmark or per-item latency. */
export function transitionTiming(old: JobTiming | undefined, phase: JobTiming['phase'], now: number): JobTiming {
    const t: JobTiming = old ? {...old} : {activeMs:0,pausedMs:0,lastAt:now,phase,uncertain:false};
    const elapsed = Math.max(0,now-t.lastAt);
    if (phase==='unknown') t.uncertain=true;
    else if(t.phase==='active')t.activeMs+=elapsed;
    else if(t.phase==='paused')t.pausedMs+=elapsed;
    t.lastAt=now;t.phase=phase;
    return t;
}
export function timingMetrics(t: JobTiming | undefined, startedAt: number, endAt: number) {
    return {
        activeDurationMs:t?.activeMs ?? 0,
        pausedDurationMs:(t?.pausedMs ?? 0)+(t?.phase==='paused'?Math.max(0,endAt-t.lastAt):0),
        wallDurationMs:Math.max(0,endAt-startedAt),
        timingUncertain:t?.uncertain ?? true
    };
}
