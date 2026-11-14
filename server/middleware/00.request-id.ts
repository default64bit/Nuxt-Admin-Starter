import { attachRequestId } from "../utils/request-id";

// Runs first for every request: accept a well-formed inbound id, otherwise mint one, and echo it
// on the response so a caller can quote it when reporting a problem.
export default defineEventHandler((event) => {
  attachRequestId(event);
});
