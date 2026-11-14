import { adminManifestResponse } from "../../utils/admin-pwa-handlers";

export default defineEventHandler((event) => adminManifestResponse(event, "fa"));
