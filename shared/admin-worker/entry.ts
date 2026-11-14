import { registerLifecycle } from "./lifecycle";
import { registerPush } from "./push";
import type { WorkerModule, WorkerScopeLike } from "./scope";

// The worker entry stays thin: each module registers its own listeners. Push display and notification click live in
// `push.ts`. Never add a `fetch` listener or touch Cache Storage (a test on the built file enforces it).
const modules: WorkerModule[] = [registerLifecycle, registerPush];

for (const register of modules) register(self as unknown as WorkerScopeLike);
