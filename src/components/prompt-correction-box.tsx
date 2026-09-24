"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Pataisos pagal užklausą</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pataisymai taikomi vietoje, be debesies modelio. Galite naudoti komandas
          (pvz. „klientas: UAB Statyba“, „storis: 25“, „pakuoti tik neskilusi: taip“,
          „paslėpti storis“, „pridėti eilutę“) arba įrašyti laisvą tekstą kaip
          papildomą sąlygą.
        </p>
      </div>

      <Textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Pvz.: klientas: UAB Statyba · storis: 25 · pakuoti tik neskilusi: taip · Pridedame papildomą garantiją 12 mėn."
        rows={4}
      />

      <Button
        type="button"
        onClick={() => {
          onApply(prompt);
          setPrompt("");
        }}
        disabled={!prompt.trim()}
      >
        Taikyti pataisą ir atnaujinti PDF
      </Button>

      {messages.length > 0 ? (
        <Alert>
          <AlertTitle>Vietinis rezultatas</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-4">
              {messages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
