import type { Deployment } from "../../src/deployment.js";
import { BawClient } from "../../src/baw.js";
import { createRuntime, type Runtime } from "../../src/runtime.js";
import { FileStateStore } from "../../src/state.js";
import { connectedBawHandler, fakeBaw, tempDir } from "./fake-baw.js";
import { fixtureDeployment, type FakePublicClient } from "./fake-client.js";

export interface TestHarness {
  runtime: Runtime;
  fake: ReturnType<typeof fakeBaw>;
  journal: FileStateStore;
  dir: string;
}

/** Build a runtime backed by a fake BAW and a fake viem public client. */
export function harness(
  publicClient: FakePublicClient,
  options: {
    deployment?: Deployment;
    handler?: (args: string[]) => unknown;
  } = {},
): TestHarness {
  const dir = tempDir();
  const fake = fakeBaw((options.handler ?? connectedBawHandler()) as never);
  const journal = new FileStateStore(dir);
  const runtime = createRuntime({
    deployment: options.deployment ?? fixtureDeployment(),
    publicClient: publicClient.client,
    baw: new BawClient(fake.runner),
    stateStore: journal,
    env: { AGENTMARKET_STATE_DIR: dir },
  });
  return { runtime, fake, journal, dir };
}
