import { afterEach, describe, expect, it } from "vitest";

import { BawClient } from "../src/baw.js";
import { runTxExecute } from "../src/core/tx-execute.js";
import { previewCallAndRecord } from "../src/preview.js";
import { createRuntime } from "../src/runtime.js";
import { FileStateStore } from "../src/state.js";
import { BSC_ADDRESS, connectedBawHandler, fakeBaw, removeDir, tempDir } from "./helpers/fake-baw.js";
import { fixtureDeployment, fakePublicClient } from "./helpers/fake-client.js";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) removeDir(dirs.pop()!);
});

function testnetRuntime() {
  const dir = tempDir();
  dirs.push(dir);
  const fake = fakeBaw(connectedBawHandler() as never);
  const runtime = createRuntime({
    deployment: fixtureDeployment({ chainId: 97, network: "bsc-testnet" }),
    publicClient: fakePublicClient({ chainId: 97 }).client,
    baw: new BawClient(fake.runner),
    stateStore: new FileStateStore(dir),
    env: { AGENTMARKET_STATE_DIR: dir },
  });
  return { runtime, fake, store: new FileStateStore(dir) };
}

describe("BAW chain guard", () => {
  it("refuses to preview when the address book is not BSC 56", async () => {
    const { runtime, fake } = testnetRuntime();
    await expect(
      previewCallAndRecord(runtime, BSC_ADDRESS, {
        action: "test",
        to: "0x3333333333333333333333333333333333333333",
        value: 0n,
        inputData: "0x",
        functionName: "test()",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses to execute when the address book is not BSC 56", async () => {
    const { runtime, fake, store } = testnetRuntime();
    await expect(
      runTxExecute(runtime, { requestId: "req-x", confirm: true }, { stateStore: store }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CHAIN" });
    expect(fake.calls).toHaveLength(0);
  });
});
