import { renderHook } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const setup = (initial: number | null, delayMs?: number) => {
  const save = jest.fn().mockResolvedValue(undefined);
  const hook = renderHook(({ v }: { v: number | null }) => useAutoSave(v, save, delayMs), { initialProps: { v: initial } });
  return { save, ...hook };
};

describe("useAutoSave", () => {
  it("does not save the first value it sees", () => {
    const { save } = setup(1);
    jest.advanceTimersByTime(5000);
    expect(save).not.toHaveBeenCalled();
  });

  it("saves a change after the default 800 ms delay", () => {
    const { save, rerender } = setup(1);
    rerender({ v: 2 });
    jest.advanceTimersByTime(799);
    expect(save).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledWith(2);
  });

  it("debounces rapid changes into one save of the last value", () => {
    const { save, rerender } = setup(1, 100);
    rerender({ v: 2 });
    jest.advanceTimersByTime(50);
    rerender({ v: 3 });
    jest.advanceTimersByTime(50);
    rerender({ v: 4 });
    jest.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(4);
  });

  it("ignores null and treats the first non-null value as the initial one", () => {
    const { save, rerender } = setup(null, 100);
    jest.advanceTimersByTime(200);
    rerender({ v: 5 });
    jest.advanceTimersByTime(200);
    expect(save).not.toHaveBeenCalled();
    rerender({ v: 6 });
    jest.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledWith(6);
  });

  it("cancels a pending save on unmount", () => {
    const { save, rerender, unmount } = setup(1, 100);
    rerender({ v: 2 });
    unmount();
    jest.advanceTimersByTime(200);
    expect(save).not.toHaveBeenCalled();
  });

  it("uses the latest save function", () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const later = jest.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(({ v, fn }: { v: number; fn: typeof save }) => useAutoSave(v, fn, 100), {
      initialProps: { v: 1, fn: save },
    });
    rerender({ v: 2, fn: save });
    rerender({ v: 2, fn: later });
    jest.advanceTimersByTime(100);
    expect(save).not.toHaveBeenCalled();
    expect(later).toHaveBeenCalledWith(2);
  });
});
