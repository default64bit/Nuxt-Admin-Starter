import workerSource from "#admin-worker-source";
import { adminWorkerResponse } from "../../../utils/admin-pwa-handlers";

export default defineEventHandler((event) => adminWorkerResponse(event, "en", workerSource));
