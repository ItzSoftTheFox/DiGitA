import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  demoRepository,
  readRepository,
  type RepositorySnapshot,
} from "../lib/repository";
import { useRepository } from "./useRepository";

vi.mock("../lib/repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/repository")>()),
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
  expect(result.current.snapshot).toBeNull();
  expect(readRepository).toHaveBeenCalledTimes(1);
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

it("skips superseded queued projects and never polls an old project again", async () => {
  let finish!: (value: RepositorySnapshot) => void;
  vi.mocked(readRepository).mockImplementation((path) =>
    path === "/first"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ ...demoRepository, root: path, name: path }),
  );
  const { result, rerender } = renderHook(({ path }) => useRepository(path), {
    initialProps: { path: "/first" },
  });
  rerender({ path: "/second" });
  rerender({ path: "/third" });
  expect(result.current.snapshot).toBeNull();
  expect(readRepository).toHaveBeenCalledTimes(1);
  await act(async () => finish(demoRepository));
  expect(result.current.snapshot?.root).toBe("/third");
  expect(vi.mocked(readRepository).mock.calls.map(([path]) => path)).toEqual([
    "/first",
    "/third",
  ]);
});

it("serializes reads across workspace unmounts", async () => {
  let finish!: (value: RepositorySnapshot) => void;
  vi.mocked(readRepository)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue(demoRepository);
  const first = renderHook(() => useRepository("/first"));
  first.unmount();
  const next = renderHook(() => useRepository("/second"));
  expect(readRepository).toHaveBeenCalledTimes(1);
  await act(async () => finish(demoRepository));
  expect(readRepository).toHaveBeenCalledTimes(2);
  expect(next.result.current.snapshot).toBe(demoRepository);
});

it("rejects incomplete results and retains only the last complete snapshot", async () => {
  vi.mocked(readRepository)
    .mockResolvedValueOnce(demoRepository)
    .mockResolvedValueOnce({
      ...demoRepository,
      files: [],
      statusComplete: false,
    });
  const { result } = renderHook(() => useRepository("/project"));
  await act(async () => {});
  await act(async () => result.current.refresh());
  expect(result.current.snapshot).toBe(demoRepository);
  expect(result.current.stale).toBe(true);
  expect(result.current.error).toContain("incomplete");
});

it("expires a successful snapshot while a native read stalls and recovers only on success", async () => {
  vi.useFakeTimers();
  let finish!: (value: RepositorySnapshot) => void;
  vi.mocked(readRepository)
    .mockResolvedValueOnce(demoRepository)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
  const { result } = renderHook(() => useRepository("/project"));
  await act(async () => {});
  expect(result.current.stale).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(readRepository).toHaveBeenCalledTimes(2);
  expect(result.current.stale).toBe(true);
  expect(result.current.busy).toBe(true);
  await act(async () => finish(demoRepository));
  expect(result.current.stale).toBe(false);
});
