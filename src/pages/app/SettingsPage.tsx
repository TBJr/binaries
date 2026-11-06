import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextEditor } from "@/components/composer/RichTextEditor";
import { PageMeta } from "@/components/layout/PageMeta";
import { useAppNotice } from "@/components/notices/AppNotice";
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import { AppPageContainer } from "@/components/shared/AppPageContainer";
import { PageHeader } from "@/components/shared/PageHeader";
import { useAuthorization } from "@/lib/authorization";
import {
  fetchTestLists,
  getMailProviderSettings,
  getMailStatus,
  getTestSendContext,
  MailApiError,
  sendMailTest,
  sendMailTestList,
  submissionFromError,
  testMailConnection,
  updateMailProvider,
  type MailProvider,
  type MailProviderSettings,
  type ConnectionState,
  type MailStatus,
  type MailSubmission,
  type TestListOption,
  type TestListSummary,
} from "@/lib/mail-api";
import {
  canSubmitTestSend,
  destinationAfterTestSend,
  sentListRefreshState,
  singleTestSendFollowUp,
  testListFollowUp,
  testListResultHeading,
  testSendBusyLabel,
  thrownTestSendFollowUp,
} from "@/lib/test-send-follow-up";
import { EMPTY_TIPTAP_DOC, processDraftContent, type TiptapDoc } from "@/lib/message-content";

function formatWhen(value: string | null) {
  if (!value) return "Not tested yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not tested yet";
  return date.toLocaleString();
}

function connectionLabel(status: ConnectionState) {
  if (status === "connected") return "Connected";
  if (status === "failed") return "Failed";
  if (status === "not_configured") return "Not configured";
  return "Not tested";
}

function connectionVariant(status: ConnectionState): "default" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "failed") return "destructive";
  return "outline";
}

function submissionLabel(submission: MailSubmission) {
  if (submission.smtpAccepted) return "Accepted by outgoing server";
  if (submission.status === "rejected") return "Rejected";
  if (submission.status === "uncertain") return "Delivery unconfirmed";
  if (submission.status === "pending") return "In progress";
  return "Not accepted";
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { notify } = useAppNotice();
  const { can, loaded: authLoaded } = useAuthorization();
  const canManageMailbox = can("mailbox.read");
  const canSendTest = can("mailbox.send_test");
  const testOnly = canSendTest && !canManageMailbox;

  const inFlight = useRef(false);
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [configured, setConfigured] = useState(false);
  const [testRecipients, setTestRecipients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [contentJson, setContentJson] = useState<TiptapDoc>({ ...EMPTY_TIPTAP_DOC });
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<MailSubmission | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [selectedTestRecipient, setSelectedTestRecipient] = useState("");
  const [recipientMode, setRecipientMode] = useState<"single" | "test_list">("single");
  const [testLists, setTestLists] = useState<TestListOption[]>([]);
  const [listLimit, setListLimit] = useState(8);
  const [selectedListId, setSelectedListId] = useState("");
  const [listSummary, setListSummary] = useState<TestListSummary | null>(null);
  const [providerSettings, setProviderSettings] = useState<MailProviderSettings | null>(null);
  const [providerSelection, setProviderSelection] = useState<MailProvider>("resend");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerSaving, setProviderSaving] = useState(false);

  useEffect(() => {
    if (!authLoaded) return;

    let cancelled = false;
    setLoading(true);
    setRestricted(false);
    setLoadError(null);

    async function loadTestLists() {
      try {
        const lists = await fetchTestLists();
        if (!cancelled) {
          setTestLists(lists.lists);
          setListLimit(lists.limit);
          setSelectedListId((current) =>
            current && lists.lists.some((list) => list.id === current) ? current : (lists.lists[0]?.id ?? ""),
          );
        }
      } catch {
        if (!cancelled) setTestLists([]);
      }
    }

    function applyTestRecipients(recipients: string[]) {
      setTestRecipients(recipients);
      if (recipients.length > 0) {
        setSelectedTestRecipient((current) =>
          current && recipients.includes(current) ? current : recipients[0]!,
        );
      }
    }

    if (canManageMailbox) {
      getMailStatus()
        .then(async (result) => {
          if (cancelled) return;
          setStatus(result);
          setConfigured(result.configured);
          applyTestRecipients(result.testRecipients);
          setSubmission(result.latestSubmission);
          try {
            const settings = await getMailProviderSettings();
            if (!cancelled) {
              setProviderSettings(settings);
              setProviderSelection(settings.provider);
            }
          } catch (error) {
            if (!cancelled) {
              setProviderError(error instanceof MailApiError ? error.message : "Could not load email provider settings.");
            }
          }
          if (canSendTest) {
            await loadTestLists();
          }
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof MailApiError && error.status === 403) {
            setRestricted(true);
          } else {
            setLoadError(error instanceof MailApiError ? error.message : "Could not load email settings.");
          }
          setLoading(false);
        });
    } else if (canSendTest) {
      getTestSendContext()
        .then(async (result) => {
          if (cancelled) return;
          setConfigured(result.configured);
          applyTestRecipients(result.testRecipients);
          await loadTestLists();
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof MailApiError && error.status === 403) {
            setRestricted(true);
          } else {
            setLoadError(error instanceof MailApiError ? error.message : "Could not load test message settings.");
          }
          setLoading(false);
        });
    } else {
      setRestricted(true);
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [authLoaded, canManageMailbox, canSendTest]);

  async function runConnectionTest() {
    setTesting(true);
    setTestError(null);
    try {
      const result = await testMailConnection();
      setStatus(result);
      setConfigured(result.configured);
      setTestRecipients(result.testRecipients);
    } catch (error) {
      setTestError(error instanceof MailApiError ? error.message : "Could not test the connection.");
    } finally {
      setTesting(false);
    }
  }

  async function saveProvider() {
    setProviderSaving(true);
    setProviderError(null);
    try {
      const updated = await updateMailProvider(providerSelection);
      setProviderSettings(updated);
      setProviderSelection(updated.provider);
      setStatus((current) =>
        current
          ? {
              ...current,
              provider: updated.provider,
              outgoing: { status: "unknown", error: null },
              lastCheckedAt: null,
            }
          : current,
      );
      notify({
        tone: "success",
        message: `Outbound email now uses ${updated.provider === "resend" ? "Resend" : "Spacemail"}.`,
        action: null,
      });
      try {
        const next = await testMailConnection();
        setStatus(next);
        setConfigured(next.configured);
        setTestRecipients(next.testRecipients);
      } catch (error) {
        setTestError(error instanceof MailApiError ? error.message : "The provider was saved, but its connection test failed.");
      }
    } catch (error) {
      setProviderError(error instanceof MailApiError ? error.message : "Could not update the email provider.");
    } finally {
      setProviderSaving(false);
    }
  }

  function openConfirm() {
    setIdempotencyKey((current) => current ?? crypto.randomUUID());
    setConfirmOpen(true);
  }

  async function submitTest() {
    if (!idempotencyKey || !canSubmitTestSend({ inFlight: inFlight.current, idempotencyKey })) return;
    const requestKey = idempotencyKey;
    inFlight.current = true;
    setSending(true);
    setSendError(null);
    setSubmission(null);
    setListSummary(null);
    setDuplicate(false);
    try {
      const message = processDraftContent(contentJson);
      const payload = {
        subject: subject.trim(),
        text: message.bodyText,
        html: message.bodyHtml,
        confirm: true as const,
        idempotencyKey: requestKey,
      };
      let followUp;
      if (recipientMode === "test_list") {
        const result = await sendMailTestList({ ...payload, testListId: selectedListId });
        setListSummary(result.summary);
        setDuplicate(result.duplicate);
        followUp = testListFollowUp(result.summary, result.duplicate);
      } else {
        const result = await sendMailTest({ ...payload, testRecipient: selectedTestRecipient });
        setSubmission(result.submission);
        setDuplicate(result.duplicate);
        followUp = singleTestSendFollowUp(result.submission, result.duplicate);
      }
      setIdempotencyKey(null);
      setAcknowledged(false);
      setConfirmOpen(false);
      notify(followUp);
      const destination = destinationAfterTestSend("settled", followUp);
      if (destination) {
        navigate(destination, { state: sentListRefreshState(crypto.randomUUID()) });
      }
    } catch (error) {
      const followUp =
        error instanceof MailApiError
          ? thrownTestSendFollowUp({ message: error.message, status: error.status, code: error.code })
          : thrownTestSendFollowUp(null);
      if (error instanceof MailApiError) {
        const recorded = submissionFromError(error);
        if (recorded) setSubmission(recorded);
        if (error.status !== 409) {
          setIdempotencyKey(null);
          setAcknowledged(false);
          setConfirmOpen(false);
        }
      }
      setSendError(followUp.message);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  const hasTestRecipients = Boolean(configured && testRecipients.length > 0);
  const selectedList = testLists.find((list) => list.id === selectedListId) ?? null;
  const listWithinLimit = Boolean(selectedList && selectedList.eligibleCount > 0 && selectedList.eligibleCount <= listLimit);
  const messagePreview = useMemo(() => processDraftContent(contentJson), [contentJson]);
  const recipientReady =
    recipientMode === "test_list" ? listWithinLimit : Boolean(hasTestRecipients && selectedTestRecipient);

  const canSend =
    configured &&
    canSendTest &&
    recipientReady &&
    acknowledged &&
    subject.trim().length > 0 &&
    messagePreview.bodyText.trim().length > 0 &&
    !sending;
  const busyLabel = testSendBusyLabel(
    recipientMode,
    recipientMode === "test_list" ? (selectedList?.eligibleCount ?? 0) : 1,
  );

  const showContent = !loading && !restricted && !loadError && (canManageMailbox ? Boolean(status) : canSendTest);
  const pageDescription = testOnly
    ? "Send a controlled test message to an allowlisted recipient or test list."
    : "Configure outbound email delivery and optional Spacemail inbox access.";

  function renderTestMessageCard() {
    return (
      <Card className={testOnly ? "lg:col-span-2" : undefined}>
        <CardHeader>
          <CardTitle>Test message</CardTitle>
          <CardDescription>
            Sends a separate message to one authorized recipient, or to each eligible member of a test list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configured ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSend) openConfirm();
              }}
            >
              {!testOnly ? (
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">From</p>
                  <p>{status?.senderEmail}</p>
                </div>
              ) : null}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Recipient</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="recipient-mode"
                    checked={recipientMode === "single"}
                    onChange={() => {
                      setRecipientMode("single");
                      setIdempotencyKey(null);
                    }}
                  />
                  Single recipient
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="recipient-mode"
                    checked={recipientMode === "test_list"}
                    onChange={() => {
                      setRecipientMode("test_list");
                      setIdempotencyKey(null);
                    }}
                  />
                  Test list
                </label>
              </fieldset>
              {recipientMode === "single" ? (
                <div className="space-y-2">
                  <Label htmlFor="test-recipient">Authorized test recipient</Label>
                  {hasTestRecipients ? (
                    <select
                      id="test-recipient"
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      value={selectedTestRecipient}
                      onChange={(event) => {
                        setSelectedTestRecipient(event.target.value);
                        setIdempotencyKey(null);
                      }}
                    >
                      {testRecipients.map((recipient) => (
                        <option key={recipient} value={recipient}>
                          {recipient}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-muted-foreground">No authorized single recipient is configured.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="test-list">Test list</Label>
                  {testLists.length > 0 ? (
                    <select
                      id="test-list"
                      className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                      value={selectedListId}
                      onChange={(event) => {
                        setSelectedListId(event.target.value);
                        setIdempotencyKey(null);
                      }}
                    >
                      {testLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No test lists are available yet. Mark a recipient list as a test list before sending.
                    </p>
                  )}
                  {selectedList && selectedList.eligibleCount === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      This test list does not currently contain any eligible recipients.
                    </p>
                  ) : null}
                  {selectedList && selectedList.eligibleCount > listLimit ? (
                    <p className="text-sm text-destructive">
                      This test list has {selectedList.eligibleCount} eligible recipients. Test sends are limited to {listLimit}.
                    </p>
                  ) : null}
                  {selectedList && selectedList.eligibleCount > 0 && selectedList.eligibleCount <= listLimit ? (
                    <p className="text-sm text-muted-foreground">
                      {selectedList.eligibleCount} eligible recipient{selectedList.eligibleCount === 1 ? "" : "s"}.
                    </p>
                  ) : null}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="test-subject">Subject</Label>
                <Input
                  id="test-subject"
                  value={subject}
                  maxLength={200}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    setIdempotencyKey(null);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="test-body">Message</Label>
                <RichTextEditor
                  variant="compact"
                  content={contentJson}
                  onChange={(doc) => {
                    setContentJson(doc);
                    setIdempotencyKey(null);
                  }}
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  {recipientMode === "test_list"
                    ? `I confirm this sends ${selectedList?.eligibleCount ?? 0} separate messages to “${selectedList?.name ?? "the test list"}” and does not start a campaign.`
                    : `I confirm this sends one message to ${selectedTestRecipient} and does not start a campaign.`}
                </span>
              </label>
              {sendError ? (
                <p className="text-sm text-destructive" role="alert">
                  {sendError}
                </p>
              ) : null}
              <Button type="submit" disabled={!canSend} aria-busy={sending}>
                {sending ? busyLabel : recipientMode === "test_list" ? "Send test messages" : "Review test message"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Email account is not configured on the server.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <PageMeta
        title="Mailbox | Binaries.nl"
        description={pageDescription}
        canonicalPath="/app/settings/"
      />
      <AppPageContainer>
        <PageHeader
          title="Mailbox"
          description={pageDescription}
          notice="Campaign queues stay simulation-only. This page does not send campaigns."
        />
        <SettingsSectionNav />

        {!authLoaded || loading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : restricted ? (
          <Card>
            <CardContent className="text-sm text-muted-foreground">
              Mailbox administration is limited to the super admin.
            </CardContent>
          </Card>
        ) : loadError ? (
          <Card>
            <CardContent className="text-sm text-destructive">{loadError}</CardContent>
          </Card>
        ) : showContent ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {canManageMailbox && status ? (
              <>
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Outbound email provider</CardTitle>
                    <CardDescription>
                      This setting applies to all system email, including sign-in verification, password resets, invitations, and mailbox sends. Spacemail inbox access remains separate.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {providerSettings ? (
                      <>
                        <fieldset className="grid gap-3 sm:grid-cols-2">
                          <legend className="sr-only">Choose outbound email provider</legend>
                          {(["resend", "spacemail"] as const).map((provider) => {
                            const providerConfigured = providerSettings.availability[provider];
                            return (
                              <label
                                key={provider}
                                className={`flex items-start gap-3 rounded-md border p-4 ${providerConfigured ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                              >
                                <input
                                  type="radio"
                                  name="outbound-provider"
                                  value={provider}
                                  checked={providerSelection === provider}
                                  disabled={!providerConfigured || providerSaving}
                                  onChange={() => setProviderSelection(provider)}
                                />
                                <span className="space-y-1">
                                  <span className="block font-medium">{provider === "resend" ? "Resend" : "Spacemail"}</span>
                                  <span className="block text-sm text-muted-foreground">
                                    {providerConfigured
                                      ? "Configured and available"
                                      : provider === "resend"
                                        ? "Configure RESEND_API_KEY and RESEND_FROM_EMAIL in Vercel"
                                        : "Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in Vercel"}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </fieldset>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm text-muted-foreground">
                            Active provider: <strong>{providerSettings.provider === "resend" ? "Resend" : "Spacemail"}</strong>
                          </p>
                          <Button
                            type="button"
                            onClick={() => void saveProvider()}
                            disabled={providerSaving || providerSelection === providerSettings.provider || !providerSettings.availability[providerSelection]}
                          >
                            {providerSaving ? "Saving…" : "Use selected provider"}
                          </Button>
                        </div>
                      </>
                    ) : null}
                    {providerError ? <p className="text-sm text-destructive" role="alert">{providerError}</p> : null}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Email account</CardTitle>
                    <CardDescription>Connection status for the configured mailbox.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Email account</p>
                      <p className="break-all">{status.accountEmail ?? "Not configured"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Resend sending address</p>
                      <p className="break-all">{status.senderEmail ?? "Not configured"}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="min-w-0 wrap-break-word">{status.provider === "resend" ? "Resend outgoing service" : "Spacemail outgoing service"}</p>
                      <Badge variant={connectionVariant(status.outgoing.status)}>
                        {connectionLabel(status.outgoing.status)}
                      </Badge>
                    </div>
                    {status.outgoing.error ? (
                      <p className="text-destructive">{status.outgoing.error}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="min-w-0 wrap-break-word">Incoming mail server</p>
                      <Badge variant={connectionVariant(status.incoming.status)}>
                        {connectionLabel(status.incoming.status)}
                      </Badge>
                    </div>
                    {status.incoming.error ? (
                      <p className="text-destructive">{status.incoming.error}</p>
                    ) : null}
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Last connection test</p>
                      <p>{formatWhen(status.lastCheckedAt)}</p>
                    </div>
                    {testError ? <p className="text-destructive">{testError}</p> : null}
                    <Button type="button" onClick={() => void runConnectionTest()} disabled={testing || !status.configured}>
                      {testing ? "Testing…" : "Test connection"}
                    </Button>
                  </CardContent>
                </Card>
              </>
            ) : null}

            {canSendTest ? renderTestMessageCard() : null}

            {listSummary ? (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>{testListResultHeading(listSummary)}</CardTitle>
                  <CardDescription>Test list: {listSummary.listName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm" role="status">
                  <p>{testListFollowUp(listSummary, duplicate).message}</p>
                  <p>Requested: {listSummary.requested}</p>
                  <p>Eligible: {listSummary.eligible}</p>
                  <p>Resend accepted: {listSummary.smtpAccepted}</p>
                  <p>Failed: {listSummary.failed}</p>
                  <p>Suppressed: {listSummary.suppressed}</p>
                  <p>Skipped: {listSummary.skipped}</p>
                  {listSummary.unknown > 0 ? <p>Unknown: {listSummary.unknown}</p> : null}
                  {listSummary.notAttempted > 0 ? <p>Not attempted: {listSummary.notAttempted}</p> : null}
                </CardContent>
              </Card>
            ) : null}

            {submission && recipientMode === "single" ? (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Last test submission</CardTitle>
                  <CardDescription>{formatWhen(submission.createdAt)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm" role="status">
                  <Badge variant={submission.smtpAccepted ? "default" : "destructive"}>
                    {submissionLabel(submission)}
                  </Badge>
                  {duplicate ? <p>This request was already submitted. No additional message was sent.</p> : null}
                  <p>{submission.note}</p>
                  <p>
                    {testOnly
                      ? `To ${submission.to}`
                      : `From ${submission.from} to ${submission.to}`}
                  </p>
                  <p>Subject: {submission.subject}</p>
                  {submission.messageId ? <p>Message ID: {submission.messageId}</p> : null}
                  {submission.errorMessage && !submission.smtpAccepted ? (
                    <p className="text-destructive">{submission.errorMessage}</p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </AppPageContainer>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (sending) return;
          setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {recipientMode === "test_list"
                ? `Send test message to “${selectedList?.name ?? "this test list"}”?`
                : "Send one test message?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recipientMode === "test_list"
                ? `You are about to send a real test message to ${selectedList?.eligibleCount ?? 0} recipients in “${selectedList?.name ?? "this test list"}”. Binaries.nl will submit one separate email through the configured system sender. Provider acceptance does not confirm inbox delivery.`
                : testOnly
                  ? `This sends a single plain-text and HTML message from the configured system sender to ${selectedTestRecipient}. Subject: ${subject.trim() || "(empty)"}. Provider acceptance does not confirm inbox delivery. Campaign queues are not used.`
                  : `This sends a single plain-text and HTML message from ${status?.senderEmail ?? "the configured sender"} to ${selectedTestRecipient}. Subject: ${subject.trim() || "(empty)"}. Provider acceptance does not confirm inbox delivery. Campaign queues are not used.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              aria-busy={sending}
              onClick={(event) => {
                event.preventDefault();
                void submitTest();
              }}
            >
              {sending
                ? busyLabel
                : recipientMode === "test_list"
                  ? `Send ${selectedList?.eligibleCount ?? 0} test messages`
                  : "Send one test message"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
