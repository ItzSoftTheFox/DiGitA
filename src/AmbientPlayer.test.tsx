import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AmbientPlayer, ambientPosition } from "./AmbientPlayer";
import type { AmbientClock } from "./useRoom";

const initial: AmbientClock = {
  track: "soft-noise-v1",
  duration_ms: 30000,
  playing: true,
  position_ms: 5000,
  revision: 1,
  receivedAt: 0,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("uses elapsed monotonic time, wraps the loop and freezes on pause", () => {
  expect(ambientPosition(initial, 27000)).toBe(2);
  expect(ambientPosition({ ...initial, playing: false }, 27000)).toBe(5);
});

it("requires opt-in, keeps volume local and pauses offline and on unmount", async () => {
  const control = vi.fn(() => true);
  const view = render(<AmbientPlayer state={initial} onPlaying={control} />);
  const audio = view.container.querySelector("audio")!;
  expect(audio.play).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("slider"), { target: { value: "42" } });
  expect(audio.volume).toBe(0.42);
  expect(control).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByText("Zapnout můj poslech"));
  });
  expect(audio.play).toHaveBeenCalled();
  expect(audio.currentTime).toBe(5);
  fireEvent.click(screen.getByText("Pozastavit pro všechny"));
  expect(control).toHaveBeenCalledWith(false);
  vi.mocked(audio.play).mockClear();
  view.rerender(<AmbientPlayer state={null} onPlaying={control} />);
  act(() => vi.advanceTimersByTime(2000));
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.pause).toHaveBeenCalled();
  view.rerender(
    <AmbientPlayer
      state={{ ...initial, position_ms: 17000, receivedAt: performance.now() }}
      onPlaying={control}
    />,
  );
  expect(audio.currentTime).toBe(17);
  expect(audio.play).toHaveBeenCalled();
  view.unmount();
  const calls = vi.mocked(audio.play).mock.calls.length;
  act(() => vi.advanceTimersByTime(10000));
  expect(audio.play).toHaveBeenCalledTimes(calls);
});

it("corrects drift and respects a shared pause", async () => {
  const view = render(<AmbientPlayer state={initial} onPlaying={() => true} />);
  const audio = view.container.querySelector("audio")!;
  await act(async () => {
    fireEvent.click(screen.getByText("Zapnout můj poslech"));
  });
  audio.currentTime = 20;
  act(() => vi.advanceTimersByTime(1000));
  expect(audio.currentTime).toBe(6);
  view.rerender(
    <AmbientPlayer
      state={{ ...initial, playing: false }}
      onPlaying={() => true}
    />,
  );
  vi.mocked(audio.play).mockClear();
  act(() => vi.advanceTimersByTime(5000));
  expect(audio.play).not.toHaveBeenCalled();
});

it("surfaces playback failure and allows a deliberate retry", async () => {
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
    new Error("blocked"),
  );
  render(<AmbientPlayer state={initial} onPlaying={() => true} />);
  await act(async () => {
    fireEvent.click(screen.getByText("Zapnout můj poslech"));
  });
  expect(screen.getByRole("alert").textContent).toContain("Zvuk nelze spustit");
  expect(screen.getByText("Zapnout můj poslech")).toBeTruthy();
});
