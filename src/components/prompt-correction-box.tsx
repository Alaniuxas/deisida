"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        <h2 className="text-lg font-semibold text-deisida-muted">Pataisos pagal užklausą</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pataisymai taikomi vietoje, be debesies modelio. Naudokite komandas
          („klientas: UAB Statyba“, „pakeisk klientą į UAB Kauno Statyba“,
          „storis: 25“) arba laisvą tekstą kaip papildomą sąlygą.
        </p>
      </div>

      <Label htmlFor="prompt-correction" className="sr-only">
        Pataisos tekstas
      </Label>
      <Textarea
        id="prompt-correction"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Pvz.: pakeisk klientą į UAB Kauno Statyba · storis: 25 · Pridedame papildomą garantiją 12 mėn."
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
        Taikyti pataisą ir atnaujinti PDF
      </Button>

      {messages.length > 0 ? (
        <Alert className="mt-4 border-stone-line bg-[#faf7f2]">
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
    </section>
  );
}
