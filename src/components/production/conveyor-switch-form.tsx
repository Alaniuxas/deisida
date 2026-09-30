import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MachineCode } from "@/lib/production-types";

interface ConveyorOption {
  id: string;
  code: MachineCode;
  name: string;
}

interface ConveyorSwitchFormProps {
  currentCode: MachineCode;
  currentName: string;
  machines: ConveyorOption[];
  switchedCode?: string;
  switchError?: string;
}

export function ConveyorSwitchForm({
  currentCode,
  currentName,
  machines,
  switchedCode,
  switchError,
}: ConveyorSwitchFormProps) {
  const switchedLabel = machines.find((machine) => machine.code === switchedCode)?.name;

  return (
    <Card className="rounded-2xl border-stone-line">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <RefreshCw className="size-4" />
          Keisti įrenginį
        </div>

        {switchedCode === "KONV" || switchedCode === "KNEW" ? (
          <p className="rounded-xl border border-deisida/30 bg-deisida/5 px-4 py-3 text-base font-medium text-deisida">
            Įrenginys pakeistas į {switchedCode}
            {switchedLabel ? ` (${switchedLabel})` : ""}.
          </p>
        ) : null}

        {switchError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-base text-destructive">
            Nepavyko pakeisti įrenginio. Bandykite dar kartą.
          </p>
        ) : null}

        <p className="text-base">
          Dabar dirbate:{" "}
          <span className="font-semibold text-ink">
            {currentCode} — {currentName}
          </span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {machines.map((machine) => {
            const active = currentCode === machine.code;
            if (active) {
              return (
                <button
                  key={machine.id}
                  type="button"
                  disabled
                  aria-current="true"
                  className="flex h-14 items-center justify-center rounded-xl bg-deisida px-4 text-base font-semibold text-deisida-foreground opacity-90"
                >
                  {machine.code}
                  <span className="ml-2 font-normal opacity-80">{machine.name}</span>
                </button>
              );
            }

            return (
              <form
                key={machine.id}
                method="post"
                action="/api/jobs/conveyor"
                className="contents"
              >
                <input type="hidden" name="machineCode" value={machine.code} />
                <button
                  type="submit"
                  className="flex h-14 w-full items-center justify-center rounded-xl border border-stone-line bg-paper px-4 text-base font-semibold text-ink hover:bg-muted/60"
                >
                  {machine.code}
                  <span className="ml-2 font-normal opacity-80">{machine.name}</span>
                </button>
              </form>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
