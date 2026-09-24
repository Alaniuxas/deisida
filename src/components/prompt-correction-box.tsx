"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PromptCorrectionBoxProps {
  onApply: (prompt: string) => void;
  messages: string[];
}

export function PromptCorrectionBox({
  onApply,
  messages,
}: PromptCorrectionBoxProps) {
  const [prompt, setPrompt] = useState("");

  return (
    <section id="pataisos" className="editor-panel scroll-mt-24 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-deisida-muted">Ką pakeisti?</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pvz.: pakeisk klientą į UAB Kauno Statyba.
        </p>
      </div>

      <Label htmlFor="prompt-correction" className="sr-only">
        Pakeitimo tekstas
      </Label>
      <Textarea
        id="prompt-correction"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Parašykite, ką norite pakeisti ar pridėti"
        rows={3}
        className="min-h-24 bg-paper"
      />

      <Button
        type="button"
        className="mt-3 bg-deisida text-deisida-foreground hover:bg-deisida/90"
        onClick={() => {
          onApply(prompt);
          setPrompt("");
        }}
        disabled={!prompt.trim()}
      >
        Pritaikyti
      </Button>

      {messages.length > 0 ? (
        <Alert className="mt-4 border-stone-line bg-[#f3f3f0]">
          <AlertTitle>Pakeitimai pritaikyti</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
