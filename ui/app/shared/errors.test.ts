import { isPermissionError, errorMessage } from "./errors";

describe("isPermissionError", () => {
  it.each([
    [{ message: "Forbidden" }],
    [{ message: "403: not allowed" }],
    [{ message: "Missing permission storage:logs:read" }],
    [{ message: "x", errorDetails: { code: 403 } }],
    [{ message: "x", response: { status: 403 } }],
  ])("detects %p", (e) => {
    expect(isPermissionError(e)).toBe(true);
  });
  it.each([[null], [undefined], [{ message: "Query timed out" }], ["string"]])("ignores %p", (e) => {
    expect(isPermissionError(e)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("reads message from errors and objects", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "x" })).toBe("x");
    expect(errorMessage(42)).toBe("Unknown error");
  });
});
