import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  demoRepository,
  readRepository,
  type RepositorySnapshot,
} from "./repository";
import { useRepository } from "./useRepository";

vi.mock("./repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./repository")>()),
  readRepository: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.useRealTimers();
});

it("ignores a stale result after switching repositories", async () => {
  let resolveFirst!: (value: RepositorySnapshot) => void;
  vi.mocked(readRepository)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    )
    .mockResolvedValueOnce({
      ...demoRepository,
      name: "second",
      root: "/second",
    });
  const { result, rerender } = renderHook(({ path }) => useRepository(path), {
    initialProps: { path: "/first" },
  });
  rerender({ path: "/second" });
  await act(async () => {});
  expect(result.current.snapshot?.name).toBe("second");
  await act(async () => {
    resolveFirst(demoRepository);
  });
  expect(result.current.snapshot?.name).toBe("second");
});

it("does not overlap requests and ignores results after disconnecting", async () => {
  vi.useFakeTimers();
  let resolveRead!: (value: RepositorySnapshot) => void;
  vi.mocked(readRepository).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  const { result, rerender } = renderHook(
    ({ path }: { path: string | null }) => useRepository(path),
    { initialProps: { path: "/first" as string | null } },
  );
  act(() => result.current.refresh());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(readRepository).toHaveBeenCalledTimes(1);
  rerender({ path: null });
  await act(async () => {
    resolveRead(demoRepository);
  });
  expect(result.current.snapshot).toBeNull();
  expect(result.current.busy).toBe(false);
});
