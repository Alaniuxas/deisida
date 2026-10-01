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
  const remaining = [...jobs];
  const ordered: T[] = [];
  let currentWidthMm = startWidthMm;

  while (remaining.length > 0) {
    remaining.sort((left, right) =>
      compareJobsForWidthOrder(
        left,
        right,
        currentWidthMm,
        getWidth,
        getDeadline,
      ),
    );

    const next = remaining.shift();
    if (!next) {
      break;
    }

    ordered.push(next);
    currentWidthMm = getWidth(next);
  }

  return ordered;
}
