/** Read when needed rather than watched: the motion is played once, at the moment a number first shows. */
const prefersReducedMotion = () => import.meta.client && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts up from 0 once, when it first appears (the Dashboard's count-up motion). Later changes
 * (a refetch) apply at once, and under `prefers-reduced-motion` the final value shows from the start.
 */
export function useCountUp(target: Ref<number>, duration = 700) {
  const shown = ref(import.meta.client && !prefersReducedMotion() && target.value > 0 ? 0 : target.value);
  let played = false;
  let frame = 0;
  const play = () => {
    cancelAnimationFrame(frame);
    const goal = target.value;
    if (played || prefersReducedMotion() || goal <= 0) {
      shown.value = goal;
      played ||= goal > 0;
      return;
    }
    played = true;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      shown.value = Math.round(goal * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  onMounted(play);
  watch(target, play);
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return shown;
}
