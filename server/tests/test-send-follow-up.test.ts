import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SENT_ROUTE,
  canSubmitTestSend,
  destinationAfterTestSend,
  readSentRefreshToken,
  sentListRefreshState,
  singleTestSendFollowUp,
  testListFollowUp,
  testListResultHeading,
  testSendBusyLabel,
  thrownTestSendFollowUp,
  type TestListOutcomeCounts,
} from "../../src/lib/test-send-follow-up.js";

function list(overrides: Partial<TestListOutcomeCounts> = {}): TestListOutcomeCounts {
  return {
    smtpAccepted: 0,
    failed: 0,
    suppressed: 0,
    skipped: 0,
    unknown: 0,
    notAttempted: 0,
    failureCategory: null,
    status: "completed",
    ...overrides,
  };
}

function expectNoDeliveryClaim(message: string) {
  expect(message.toLowerCase()).not.toContain("delivered");
  expect(message).not.toContain("@");
}

describe("single recipient test send", () => {
  it("shows a success notification and uses the Sent route after SMTP accepts", () => {
    const followUp = singleTestSendFollowUp(
      { smtpAccepted: true, status: "accepted", sentCopyStatus: "appended" },
      false,
    );
    expect(followUp.tone).toBe("success");
    expect(followUp.message).toBe("Test message sent successfully.");
    expect(followUp.navigateTo).toBe(SENT_ROUTE);
    expect(followUp.navigateTo).toBe("/app/sent/");
    expectNoDeliveryClaim(followUp.message);
  });

  it("does not navigate when SMTP rejects the message", () => {
    const followUp = singleTestSendFollowUp({ smtpAccepted: false, status: "rejected" }, false);
    expect(followUp.tone).toBe("error");
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).not.toBe("Test message sent successfully.");
  });

  it("does not navigate when the submission failed", () => {
    const followUp = singleTestSendFollowUp({ smtpAccepted: false, status: "failed" }, false);
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.tone).toBe("error");
  });

  it("warns against retrying when the outgoing server did not confirm acceptance", () => {
    const followUp = singleTestSendFollowUp({ smtpAccepted: false, status: "uncertain" }, false);
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.tone).toBe("warning");
    expect(followUp.message).toContain("Check the provider's delivery logs before retrying.");
  });

  it("keeps a duplicate replay from submitting again and still opens Sent when it was accepted", () => {
    const followUp = singleTestSendFollowUp({ smtpAccepted: true, status: "accepted" }, true);
    expect(followUp.navigateTo).toBe(SENT_ROUTE);
    expect(followUp.message).toContain("already submitted");
    expect(followUp.message).toContain("No additional message was sent.");
  });
});

describe("thrown test-send failures", () => {
  it("does not navigate on a database failure", () => {
    const followUp = thrownTestSendFollowUp({ code: "database_unavailable", status: 503 });
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.tone).toBe("error");
    expect(followUp.message).toContain("cannot reach the database");
    expect(followUp.message).toContain("not sent");
  });

  it("does not navigate on an SMTP authentication failure", () => {
    const followUp = thrownTestSendFollowUp({ code: "smtp_authentication_failed", status: 502 });
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).toBe(
      "Binaries.nl could not authenticate with the mail server. No further test messages were submitted.",
    );
  });

  it("does not navigate on an SMTP connection failure", () => {
    const followUp = thrownTestSendFollowUp({ code: "smtp_unavailable", status: 502 });
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).toContain("could not connect to the mail server");
  });

  it("does not navigate when the request never finishes", () => {
    const followUp = thrownTestSendFollowUp(null);
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).toContain("will not send a second message");
  });
});

describe("test list results", () => {
  it("reports every SMTP accept and navigates when the list fully succeeds", () => {
    const followUp = testListFollowUp(list({ smtpAccepted: 2 }), false);
    expect(followUp.tone).toBe("success");
    expect(followUp.message).toBe("2 test messages accepted by SMTP.");
    expect(followUp.navigateTo).toBe(SENT_ROUTE);
    expect(followUp.action).toBeNull();
    expectNoDeliveryClaim(followUp.message);
    expect(testListResultHeading(list({ smtpAccepted: 2 }))).toBe("Test send complete");
  });

  it("pluralizes a single accepted test-list message", () => {
    const followUp = testListFollowUp(list({ smtpAccepted: 1 }), false);
    expect(followUp.message).toBe("1 test message accepted by SMTP.");
    expect(followUp.navigateTo).toBe(SENT_ROUTE);
  });

  it("warns and stays on Settings when some recipients fail", () => {
    const summary = list({ smtpAccepted: 2, failed: 1 });
    const followUp = testListFollowUp(summary, false);
    expect(followUp.tone).toBe("warning");
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).toBe("2 messages were accepted by SMTP, but 1 failed.");
    expect(followUp.action).toEqual({ label: "View Sent", to: SENT_ROUTE });
    expect(testListResultHeading(summary)).toBe("Test send incomplete");
    expectNoDeliveryClaim(followUp.message);
  });

  it("uses singular partial copy", () => {
    const followUp = testListFollowUp(list({ smtpAccepted: 1, failed: 1 }), false);
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).toBe("1 message was accepted by SMTP. 1 failed.");
  });

  it("reports suppressed and skipped recipients without treating that as full success", () => {
    const followUp = testListFollowUp(list({ smtpAccepted: 2, suppressed: 1 }), false);
    expect(followUp.tone).toBe("warning");
    expect(followUp.navigateTo).toBeNull();
    expect(followUp.message).toBe("2 messages were accepted by SMTP. 1 recipient was skipped.");

    const both = testListFollowUp(list({ smtpAccepted: 2, suppressed: 1, skipped: 1 }), false);
    expect(both.navigateTo).toBeNull();
    expect(both.message).toBe("2 messages were accepted by SMTP. 2 recipients were skipped.");
  });

  it("does not claim success when a recipient is unknown or was not attempted", () => {
    const unknown = testListFollowUp(list({ smtpAccepted: 1, unknown: 1 }), false);
    expect(unknown.tone).not.toBe("success");
    expect(unknown.navigateTo).toBeNull();
    expect(unknown.message).toContain("unknown state");
    expect(unknown.message).not.toContain("sent successfully");

    const notAttempted = testListFollowUp(list({ smtpAccepted: 2, notAttempted: 1 }), false);
    expect(notAttempted.navigateTo).toBeNull();
    expect(notAttempted.tone).toBe("warning");
    expect(notAttempted.message).toContain("not attempted");

    const onlyUnknown = testListFollowUp(list({ unknown: 2, status: "failed" }), false);
    expect(onlyUnknown.tone).toBe("error");
    expect(onlyUnknown.navigateTo).toBeNull();
    expect(onlyUnknown.message).toContain("No messages were accepted by SMTP.");
    expect(onlyUnknown.action).toBeNull();
  });

  it("does not redirect when nothing was accepted", () => {
    const failed = testListFollowUp(list({ failed: 2, status: "failed" }), false);
    expect(failed.tone).toBe("error");
    expect(failed.navigateTo).toBeNull();
    expect(failed.message).toBe("No messages were accepted by SMTP. 2 failed.");
    expect(testListResultHeading(list({ failed: 2, status: "failed" }))).toBe("Test send stopped");
  });

  it("keeps an authentication failure on Settings", () => {
    const stopped = testListFollowUp(
      list({ smtpAccepted: 1, unknown: 1, notAttempted: 1, failureCategory: "authentication", status: "failed" }),
      false,
    );
    expect(stopped.navigateTo).toBeNull();
    expect(stopped.tone).toBe("warning");
    expect(stopped.message).toContain("could not authenticate with the mail server");
    expect(stopped.message).toContain("No further messages were submitted.");

    const none = testListFollowUp(list({ failureCategory: "connection", status: "failed" }), false);
    expect(none.navigateTo).toBeNull();
    expect(none.tone).toBe("error");
    expect(none.message).toBe("Binaries.nl could not connect to the mail server.");
  });
});

describe("navigation timing", () => {
  const success = singleTestSendFollowUp({ smtpAccepted: true, status: "accepted" }, false);

  it("uses the existing Sent route only after the request settles", () => {
    expect(destinationAfterTestSend("pending", success)).toBeNull();
    expect(destinationAfterTestSend("settled", success)).toBe("/app/sent/");
    expect(destinationAfterTestSend("settled", null)).toBeNull();
    expect(destinationAfterTestSend("settled", testListFollowUp(list({ smtpAccepted: 1, failed: 1 }), false))).toBeNull();
  });

  it("blocks a second submit while a request is in flight", () => {
    expect(canSubmitTestSend({ inFlight: false, idempotencyKey: "key" })).toBe(true);
    expect(canSubmitTestSend({ inFlight: true, idempotencyKey: "key" })).toBe(false);
    expect(canSubmitTestSend({ inFlight: false, idempotencyKey: null })).toBe(false);
  });

  it("labels the busy button without claiming the send has finished", () => {
    expect(testSendBusyLabel("single", 1)).toBe("Sending…");
    expect(testSendBusyLabel("test_list", 2)).toBe("Sending 2 test messages…");
    expect(testSendBusyLabel("test_list", 1)).toBe("Sending 1 test message…");
  });

  it("refreshes Sent from navigation state instead of a timer", () => {
    expect(readSentRefreshToken(sentListRefreshState("refresh-1"))).toBe("refresh-1");
    expect(readSentRefreshToken(null)).toBe("");
    expect(readSentRefreshToken({ refreshSent: "  " })).toBe("");
  });

  it("keeps the Settings handler on the router and off a second SMTP call", () => {
    const source = readFileSync(new URL("../../src/pages/app/SettingsPage.tsx", import.meta.url), "utf8");
    expect(source).toContain('destinationAfterTestSend("settled", followUp)');
    expect(source).toContain("useNavigate");
    expect(source).not.toContain("window.location");
    expect(source.match(/sendMailTest\(/g)).toHaveLength(1);
    expect(source.match(/sendMailTestList\(/g)).toHaveLength(1);
    expect(source).not.toContain("/app/history/");
  });
});
