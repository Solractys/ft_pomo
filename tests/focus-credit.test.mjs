import test from "node:test"
import assert from "node:assert/strict"
import { captureAttendeeIds, shouldCompleteFocusSession } from "../worker/src/focus-credit.ts"

test("captures each signed-in participant once when focus starts", () => {
  assert.deepEqual(captureAttendeeIds(["alice", "bob", "alice", null, undefined]), ["alice", "bob"])
})

test("participants who arrive later are not added to the captured cohort", () => {
  const cohortAtStart = captureAttendeeIds(["alice"])
  captureAttendeeIds(["alice", "late-joiner"])
  assert.deepEqual(cohortAtStart, ["alice"])
})

test("only a naturally completed work phase with a session is creditable", () => {
  assert.equal(shouldCompleteFocusSession("work", "session-1"), true)
  assert.equal(shouldCompleteFocusSession("break", "session-1"), false)
  assert.equal(shouldCompleteFocusSession("work", null), false)
})
