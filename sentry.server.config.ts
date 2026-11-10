import * as Sentry from "@sentry/nuxt";
import { initErrorCapture } from "./shared/utils/error-capture";

// Server error capture for the GlitchTip Optional piece (ADR-0015). Bundled into the server build by
// `@sentry/nuxt`, so no `--import` flag is needed. Without a DSN nothing is initialised and nothing is sent.
// The server DSN may point at the internal `glitchtip` host; it falls back to the public DSN.
const config = useRuntimeConfig();

initErrorCapture(Sentry.init, {
  dsn: config.glitchtipServerDsn || config.public.glitchtipDsn,
  environment: config.appEnv,
});
