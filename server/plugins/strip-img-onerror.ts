// @nuxt/image's `NuxtImg` and `NuxtPicture` render an inline `onerror="this.setAttribute('data-error', 1)"`
// on the server to flag an image that fails before hydration. ADR-0022 sets `script-src-attr 'none'`, so the
// browser blocks that handler and logs a CSP violation on every page that shows an image. The flag is only a
// styling hook for pre-hydration failures (nothing here reads `data-error`), so the attribute is dropped from
// the HTML before the CSP hashes are computed rather than loosening the policy.
const INLINE_ONERROR = / onerror="this\.setAttribute\((?:&#39;|')data-error(?:&#39;|'), 1\)"/g;

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:html", (html) => {
    for (const key of ["head", "bodyPrepend", "body", "bodyAppend"] as const) {
      html[key] = html[key].map((part) => part.replace(INLINE_ONERROR, ""));
    }
  });
});
