import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  publishZctaGdpModelSpecification,
  specification,
  verifyZctaGdpModelSpecification,
} from "./zcta-gdp-model-specification.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(ROOT, "tmp-gdp-spec-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const rel of [
    "config/datasets/zcta-gdp-allocation-method-evaluation.json",
    "config/source-policies/bea-regional-gdp.json",
  ]) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.copyFile(path.join(ROOT, rel), path.join(root, rel));
  }
  const catalog = JSON.parse(
      await fs.readFile(
        path.join(
          root,
          "config/datasets/zcta-gdp-allocation-method-evaluation.json",
        ),
      ),
    ),
    rel = catalog.retained_release.manifest;
  await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await fs.copyFile(path.join(ROOT, rel), path.join(root, rel));
  return root;
}
test("registered specification independently verifies and stays nonnumeric", async () => {
  const c = JSON.parse(
      await fs.readFile(
        path.join(ROOT, "config/datasets/zcta-gdp-model-specification.json"),
      ),
    ),
    r = await verifyZctaGdpModelSpecification(c.retained_release.manifest);
  assert.equal(r.manifest_sha256, c.retained_release.manifest_sha256);
  assert.equal(r.claims.model_approved, false);
  assert.equal(r.claims.numeric_gdp_emitted, false);
  await assert.rejects(
    fs.stat(path.join(ROOT, "data/zcta-gdp-model-specification/current.json")),
    (e) => e.code === "ENOENT",
  );
});
test("specification encodes required HOLD, methods and withholding semantics", () => {
  const s = specification({});
  assert.equal(s.decision_status, "hold");
  assert.equal(s.methods.primary, "zbp-payroll-area-hybrid");
  assert.deepEqual(s.methods.sensitivity, [
    "polygon-area",
    "zbp-establishment-area-fallback",
  ]);
  assert.equal(s.methods.fallback, null);
  assert.match(
    s.eligibility.suppressed_unpublished_or_not_applicable,
    /never-zero/,
  );
  assert.ok(
    s.eligibility.withhold_zcta_when.includes(
      "any material relationship lacks direct BEA county input",
    ),
  );
  assert.equal(s.conservation.tolerance, 1e-10);
  assert.match(s.uncertainty.kind, /not-statistical/);
  assert.ok(
    s.prohibited_claims.includes(
      "GDP by race, lineage, sex, age or other demographic",
    ),
  );
});
test("publisher refuses caller timestamps and verifier refuses traversal", async () => {
  await assert.rejects(
    publishZctaGdpModelSpecification({ createdAt: "2020-01-01T00:00:00Z" }),
    /override unsupported/,
  );
  await assert.rejects(
    verifyZctaGdpModelSpecification("../manifest.json"),
    /path escape/,
  );
});
test("verifier requires the exact manifest basename", async () => {
  const c = JSON.parse(
    await fs.readFile(
      path.join(ROOT, "config/datasets/zcta-gdp-model-specification.json"),
    ),
  );
  await assert.rejects(
    verifyZctaGdpModelSpecification(
      path.dirname(c.retained_release.manifest) + "/model-specification.json",
    ),
    /manifest basename/,
  );
});
test("cancellation and post-rename cancellation are explicit", async (t) => {
  for (const phase of ["afterLock", "postRename"])
    await t.test(phase, async (t) => {
      const root = await fixture(t),
        controller = new AbortController();
      let error;
      try {
        await publishZctaGdpModelSpecification({
          root,
          signal: controller.signal,
          _testHooks: { [phase]: () => controller.abort() },
        });
      } catch (e) {
        error = e;
      }
      assert.equal(error.name, "AbortError");
      if (phase === "postRename") assert.equal(error.inspection_required, true);
    });
});
test("concurrent lock and foreign stage substitution are rejected safely", async (t) => {
  await t.test("concurrent", async (t) => {
    const root = await fixture(t);
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const first = publishZctaGdpModelSpecification({
      root,
      _testHooks: { afterLock: () => gate },
    });
    const lock = path.join(
      root,
      "data/zcta-gdp-model-specification/.locks/build.lock",
    );
    while (
      !(await fs.stat(lock).then(
        () => true,
        () => false,
      ))
    )
      await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(
      publishZctaGdpModelSpecification({ root, _testHooks: {} }),
      /EEXIST/,
    );
    release();
    await first;
  });
  await t.test("stage replacement", async (t) => {
    const root = await fixture(t);
    let error;
    try {
      await publishZctaGdpModelSpecification({
        root,
        _testHooks: {
          afterStage: async ({ stage }) => {
            await fs.rename(stage, stage + ".owned");
            await fs.mkdir(stage);
            throw Error("primary");
          },
        },
      });
    } catch (e) {
      error = e;
    }
    assert.match(error.message, /primary/);
    assert.equal(error.inspection_required, true);
  });
});
test("unexpected inventory and output hardlinks fail independent verification", async (t) => {
  const root = await fixture(t),
    built = await publishZctaGdpModelSpecification({ root, _testHooks: {} }),
    dir = path.dirname(built.directory + "/manifest.json");
  await fs.writeFile(path.join(dir, "extra"), "x");
  await assert.rejects(
    verifyZctaGdpModelSpecification(path.join(dir, "manifest.json"), { root }),
    /closed inventory/,
  );
  await fs.unlink(path.join(dir, "extra"));
  const artifact = path.join(dir, "model-specification.json"),
    other = artifact + ".link";
  await fs.link(artifact, other);
  await assert.rejects(
    verifyZctaGdpModelSpecification(path.join(dir, "manifest.json"), { root }),
    /unsafe input/,
  );
});
test("cleanup failure preserves primary error and requires inspection", async (t) => {
  const root = await fixture(t);
  let error;
  try {
    await publishZctaGdpModelSpecification({
      root,
      _testHooks: {
        afterStage: () => {
          throw Error("primary failure");
        },
        beforeLockCleanup: () => {
          throw Error("cleanup failure");
        },
      },
    });
  } catch (e) {
    error = e;
  }
  assert.match(error.message, /primary failure/);
  assert.equal(error.inspection_required, true);
});
test("input and staged output mutation cannot publish successfully", async (t) => {
  await t.test("input drift", async (t) => {
    const root = await fixture(t),
      target = path.join(
        root,
        "config/datasets/zcta-gdp-allocation-method-evaluation.json",
      );
    let changed = false;
    await assert.rejects(
      publishZctaGdpModelSpecification({
        root,
        _testHooks: {
          duringInputRead: async ({ file }) => {
            if (!changed && file === target) {
              changed = true;
              await fs.appendFile(file, " ");
            }
          },
        },
      }),
      /input drift/,
    );
  });
  await t.test("output mutation", async (t) => {
    const root = await fixture(t);
    let changed = false,
      error;
    try {
      await publishZctaGdpModelSpecification({
        root,
        _testHooks: {
          afterWrite: async ({ file, name }) => {
            if (!changed && name === "model-specification.json") {
              changed = true;
              await fs.appendFile(file, " ");
            }
          },
        },
      });
    } catch (e) {
      error = e;
    }
    assert.match(error.message, /unsafe input|artifact replay/);
    assert.equal(error.inspection_required, true);
  });
});
test("foreign lock substitution is never removed", async (t) => {
  const root = await fixture(t),
    foreign = path.join(root, "foreign-lock");
  await fs.mkdir(foreign);
  await fs.writeFile(path.join(foreign, "marker"), "keep");
  await assert.rejects(
    publishZctaGdpModelSpecification({
      root,
      _testHooks: {
        beforeLockCleanup: async ({ lock }) => {
          await fs.rename(lock, lock + ".owned");
          await fs.rename(foreign, lock);
        },
      },
    }),
    /lock ownership|ENOENT/,
  );
  assert.equal(
    await fs.readFile(
      path.join(
        root,
        "data/zcta-gdp-model-specification/.locks/build.lock/marker",
      ),
      "utf8",
    ),
    "keep",
  );
});
test("symlinked supplied manifest is rejected where links are supported", async (t) => {
  const root = await fixture(t),
    built = await publishZctaGdpModelSpecification({ root, _testHooks: {} }),
    link = path.join(root, "linked-manifest.json");
  try {
    await fs.symlink(path.join(built.directory, "manifest.json"), link);
  } catch (e) {
    if (["EPERM", "EACCES"].includes(e.code))
      return t.skip("symlinks unavailable");
    throw e;
  }
  await assert.rejects(
    verifyZctaGdpModelSpecification(link, { root }),
    /exact supplied manifest path/,
  );
});
test("forged clock and release identity are rejected", async (t) => {
  const root = await fixture(t),
    built = await publishZctaGdpModelSpecification({ root, _testHooks: {} }),
    manifest = path.join(built.directory, "manifest.json"),
    value = JSON.parse(await fs.readFile(manifest));
  value.created_at = "2099-01-01T00:00:00.000Z";
  await fs.writeFile(manifest, `${JSON.stringify(value)}\n`);
  await assert.rejects(verifyZctaGdpModelSpecification(manifest, { root }), /created_at bounds/);
  value.created_at = new Date().toISOString();
  value.release_id = "zcta-gdp-model-specification-" + "0".repeat(64);
  await fs.writeFile(manifest, `${JSON.stringify(value)}\n`);
  await assert.rejects(verifyZctaGdpModelSpecification(manifest, { root }), /manifest replay|content-derived/);
});
