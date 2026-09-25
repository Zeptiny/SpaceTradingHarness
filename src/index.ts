import { checkUniverse } from "./state/universe.js";

// A server reset or a new agent makes the data directory describe a world that
// no longer exists; archive it before any store loads its file (see state/universe.ts).
await checkUniverse();
await import("./main.js");
