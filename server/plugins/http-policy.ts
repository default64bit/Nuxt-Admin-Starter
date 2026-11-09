import { apiCacheControlFor, isPrivatePagePath, isSharedCachedPagePath } from "../../shared/utils/route-rules";
import { applyHttpPolicy } from "../utils/http-policy";

// Applies the cache-header invariants of ADR-0013 to every outgoing response.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("beforeResponse", (event) => {
    applyHttpPolicy(event, { apiCacheControlFor, isPrivatePagePath, isSharedCachedPagePath });
  });
});
