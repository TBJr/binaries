import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseOtpAuthSecret } from "@/lib/otpauth";

type TotpEnrollmentSetupProps = {
  totpUri: string;
  totpCode: string;
  onTotpCodeChange: (value: string) => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
  confirmBusy: boolean;
  idPrefix: string;
};

export function TotpEnrollmentSetup({
  totpUri,
  totpCode,
  onTotpCodeChange,
  onConfirm,
  confirmDisabled,
  confirmBusy,
  idPrefix,
}: TotpEnrollmentSetupProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const totpCodeId = `${idPrefix}-totp-code`;
  const secret = parseOtpAuthSecret(totpUri);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(null);

    if (!totpUri.startsWith("otpauth://")) {
      setQrError("Authenticator setup URI is invalid.");
      return;
    }

    QRCode.toDataURL(totpUri, { margin: 1, width: 200 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError("Could not generate the QR code. Use manual setup below.");
      });

    return () => {
      cancelled = true;
    };
  }, [totpUri]);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app.</p>
      <div className="flex justify-center">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR code for authenticator setup"
            width={200}
            height={200}
            className="rounded-md border border-border bg-white p-2"
          />
        ) : qrError ? null : (
          <p className="text-sm text-muted-foreground">Generating QR code…</p>
        )}
      </div>
      {qrError ? <p className="text-sm text-destructive" role="alert">{qrError}</p> : null}

      <details className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Manual setup</summary>
        <div className="mt-3 grid gap-2">
          {secret ? (
            <div className="grid gap-1">
              <span className="text-muted-foreground">Secret</span>
              <p className="break-all font-mono text-xs">{secret}</p>
            </div>
          ) : null}
          <div className="grid gap-1">
            <span className="text-muted-foreground">Setup URI</span>
            <p className="break-all font-mono text-xs">{totpUri}</p>
          </div>
        </div>
      </details>

      <div className="grid gap-2">
        <Label htmlFor={totpCodeId}>Verification code</Label>
        <Input
          id={totpCodeId}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={totpCode}
          onChange={(event) => onTotpCodeChange(event.target.value)}
        />
        <Button type="button" disabled={confirmDisabled} onClick={onConfirm}>
          {confirmBusy ? "Confirming…" : "Confirm enrollment"}
        </Button>
      </div>
    </div>
  );
}
