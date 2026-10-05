import { describe, expect, it } from "vitest";
import {
  changeoverHoursFromSetup,
  changeoverHoursFromStoredSetup,
  nextSetupWidthAfterJob,
  requiresWidthChangeoverFromSetup,
  isJobAssignableWithChangeover,
  isJobCompatibleWithStoredSetup,
  requiresWidthChangeoverFromStoredSetup,
  storedMachineWidth,
} from "./machine-width";

describe("machine width setup", () => {
  it("treats unset stored width as compatible with any job", () => {
    expect(isJobCompatibleWithStoredSetup(120, null)).toBe(true);
    expect(isJobCompatibleWithStoredSetup(120, 0)).toBe(true);
  });

  it("allows jobs within 5 mm of stored setup", () => {
    expect(isJobCompatibleWithStoredSetup(113, 113)).toBe(true);
    expect(isJobCompatibleWithStoredSetup(117, 113)).toBe(true);
    expect(isJobCompatibleWithStoredSetup(108, 113)).toBe(true);
  });

  it("rejects jobs that would require re-regulation", () => {
    expect(isJobCompatibleWithStoredSetup(120, 113)).toBe(false);
    expect(isJobCompatibleWithStoredSetup(90, 113)).toBe(false);
  });

  it("reads stored width only when positive", () => {
    expect(storedMachineWidth(113)).toBe(113);
    expect(storedMachineWidth(0)).toBeNull();
    expect(storedMachineWidth(null)).toBeNull();
  });

  it("does not require changeover within admin tolerance band", () => {
    expect(requiresWidthChangeoverFromStoredSetup(14, 16)).toBe(false);
    expect(requiresWidthChangeoverFromStoredSetup(14, 10)).toBe(false);
    expect(changeoverHoursFromStoredSetup(14, 16, 30)).toBe(0);
  });

  it("requires changeover only outside admin tolerance band", () => {
    expect(requiresWidthChangeoverFromStoredSetup(14, 20)).toBe(true);
    expect(changeoverHoursFromStoredSetup(14, 20, 30)).toBe(0.5);
  });

  it("allows last-resort assignment only in the 6–15 mm changeover band", () => {
    expect(isJobAssignableWithChangeover(108, 100)).toBe(true);
    expect(isJobAssignableWithChangeover(104, 100)).toBe(false);
    expect(isJobAssignableWithChangeover(51, 14)).toBe(false);
  });

  it("tracks sequential lane setup after changeover", () => {
    expect(requiresWidthChangeoverFromSetup(65, 60)).toBe(false);
    expect(requiresWidthChangeoverFromSetup(65, 55)).toBe(true);
    expect(nextSetupWidthAfterJob(65, 60)).toBe(65);
    expect(nextSetupWidthAfterJob(65, 55)).toBe(55);
    expect(requiresWidthChangeoverFromSetup(55, 52)).toBe(false);
    expect(requiresWidthChangeoverFromSetup(55, 51)).toBe(false);
    expect(changeoverHoursFromSetup(55, 52, 30)).toBe(0);
  });
});
