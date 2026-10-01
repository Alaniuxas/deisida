function toDate(deadline: Date | string): Date {
  return deadline instanceof Date ? deadline : new Date(deadline);
}

function compareDeadlines(a: Date | string, b: Date | string): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function widthDelta(currentWidthMm: number, jobWidthMm: number): number {
  return Math.abs(currentWidthMm - jobWidthMm);
}

export function compareJobsForWidthOrder<T>(
  left: T,
  right: T,
  currentWidthMm: number,
  getWidth: (job: T) => number,
  getDeadline: (job: T) => Date | string,
): number {
  const leftWidth = getWidth(left);
  const rightWidth = getWidth(right);

  const leftExact = leftWidth === currentWidthMm ? 0 : 1;
  const rightExact = rightWidth === currentWidthMm ? 0 : 1;
  if (leftExact !== rightExact) {
    return leftExact - rightExact;
  }

  const leftDelta = widthDelta(currentWidthMm, leftWidth);
  const rightDelta = widthDelta(currentWidthMm, rightWidth);
  if (leftDelta !== rightDelta) {
    return leftDelta - rightDelta;
  }

  return compareDeadlines(getDeadline(left), getDeadline(right));
}

export function orderJobsByWidthCorrection<T>(
  jobs: T[],
  startWidthMm: number,
  getWidth: (job: T) => number,
  getDeadline: (job: T) => Date | string,
): T[] {
  return orderJobsByP1P2P3(
    jobs,
    startWidthMm,
    0,
    getWidth,
    () => 0,
    getDeadline,
  );
}

function storisDelta(currentStorisMm: number, jobStorisMm: number): number {
  if (currentStorisMm <= 0 || jobStorisMm <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(currentStorisMm - jobStorisMm);
}

/** P1 same width+storis, P2 same width, P3 deadline — nearest-neighbor from current setup. */
export function orderJobsByP1P2P3<T>(
  jobs: T[],
  startWidthMm: number,
  startStorisMm: number,
  getWidth: (job: T) => number,
  getStoris: (job: T) => number,
  getDeadline: (job: T) => Date | string,
): T[] {
  const remaining = [...jobs];
  const ordered: T[] = [];
  let currentWidthMm = startWidthMm;
  let currentStorisMm = startStorisMm;

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const leftWidth = getWidth(left);
      const rightWidth = getWidth(right);
      const leftExactWidth = leftWidth === currentWidthMm ? 0 : 1;
      const rightExactWidth = rightWidth === currentWidthMm ? 0 : 1;
      if (leftExactWidth !== rightExactWidth) {
        return leftExactWidth - rightExactWidth;
      }

      const leftWidthDelta = widthDelta(currentWidthMm, leftWidth);
      const rightWidthDelta = widthDelta(currentWidthMm, rightWidth);
      if (leftWidthDelta !== rightWidthDelta) {
        return leftWidthDelta - rightWidthDelta;
      }

      const leftStoris = getStoris(left);
      const rightStoris = getStoris(right);
      const leftExactStoris = leftStoris === currentStorisMm && currentStorisMm > 0 ? 0 : 1;
      const rightExactStoris = rightStoris === currentStorisMm && currentStorisMm > 0 ? 0 : 1;
      if (leftExactStoris !== rightExactStoris) {
        return leftExactStoris - rightExactStoris;
      }

      const leftStorisDelta = storisDelta(currentStorisMm, leftStoris);
      const rightStorisDelta = storisDelta(currentStorisMm, rightStoris);
      if (leftStorisDelta !== rightStorisDelta) {
        return leftStorisDelta - rightStorisDelta;
      }

      return compareDeadlines(getDeadline(left), getDeadline(right));
    });

    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    currentWidthMm = getWidth(next);
    currentStorisMm = getStoris(next);
  }

  return ordered;
}
