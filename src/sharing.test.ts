import { describe, expect, it } from "vitest";
import { sharedPresence } from "./useRoom";
import { demoRepository } from "./repository";

const hidden = { branch: false, files: false, commit_message: false };
describe("shared metadata", () => {
  it("requires consent and never includes local paths, authors or hidden metadata", () => {
    expect(sharedPresence("room", demoRepository, false, hidden)).toBeNull();
    const data = sharedPresence("room", demoRepository, true, hidden)!;
    expect(data.branch).toBeNull();
    expect(data.files).toBeNull();
    expect(data.commit_message).toBeNull();
    expect(data.changed_count).toBe(demoRepository.files.length);
    expect(JSON.stringify(data)).not.toContain(demoRepository.root);
    expect(JSON.stringify(data)).not.toContain(demoRepository.commit!.author);
  });
  it("shares individually permitted fields and clears disconnected repositories", () => {
    const data = sharedPresence("room", demoRepository, true, {
      ...hidden,
      files: true,
    })!;
    expect(data.files).toEqual(demoRepository.files.map((f) => f.path));
    expect(data.branch).toBeNull();
    expect(sharedPresence("room", null, true, hidden)).toBeNull();
  });
  it("falls back to counts for oversized UTF-8 payloads", () => {
    const repo = {
      ...demoRepository,
      files: Array.from({ length: 400 }, (_, i) => ({
        ...demoRepository.files[0],
        path: `${i}${"ž".repeat(100)}`,
      })),
    };
    const data = sharedPresence("room", repo, true, {
      ...hidden,
      files: true,
    })!;
    expect(data.files).toBeNull();
    expect(data.sharing.files).toBe(false);
    expect(data.changed_count).toBe(400);
  });
});
