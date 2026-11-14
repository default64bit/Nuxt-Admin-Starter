import * as Sentry from "@sentry/nuxt";
import { initErrorCapture } from "./shared/utils/error-capture";

// Browser error capture for the GlitchTip Optional piece (ADR-0015). Errors only: no tracing, no replay.
// Without a public DSN nothing is initialised and nothing is sent.
initErrorCapture(Sentry.init, { dsn: useRuntimeConfig().public.glitchtipDsn });
