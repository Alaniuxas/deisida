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

type LaneTier = 1 | 2 | 3;

function laneTier(
  currentWidthMm: number,
  currentStorisMm: number,
  jobWidthMm: number,
  jobStorisMm: number,
): LaneTier {
  if (
    jobWidthMm === currentWidthMm &&
    jobStorisMm === currentStorisMm &&
    jobStorisMm > 0
  ) {
    return 1;
  }
  if (jobWidthMm === currentWidthMm) {
    return 2;
  }
  return 3;
}

/** P1 same width+storis, P2 same width, P3 deadline — greedy from current setup. */
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
      const leftTier = laneTier(
        currentWidthMm,
        currentStorisMm,
        getWidth(left),
        getStoris(left),
      );
      const rightTier = laneTier(
        currentWidthMm,
        currentStorisMm,
        getWidth(right),
        getStoris(right),
      );
      if (leftTier !== rightTier) {
        return leftTier - rightTier;
      }

      if (leftTier === 1) {
        return compareDeadlines(getDeadline(left), getDeadline(right));
      }

      if (leftTier === 2) {
        const leftStorisDelta = storisDelta(currentStorisMm, getStoris(left));
        const rightStorisDelta = storisDelta(currentStorisMm, getStoris(right));
        if (leftStorisDelta !== rightStorisDelta) {
          return leftStorisDelta - rightStorisDelta;
        }
        return compareDeadlines(getDeadline(left), getDeadline(right));
      }

      const deadlineGap = compareDeadlines(getDeadline(left), getDeadline(right));
      if (deadlineGap !== 0) {
        return deadlineGap;
      }

      const leftWidthDelta = widthDelta(currentWidthMm, getWidth(left));
      const rightWidthDelta = widthDelta(currentWidthMm, getWidth(right));
      if (leftWidthDelta !== rightWidthDelta) {
        return leftWidthDelta - rightWidthDelta;
      }

      return getWidth(left) - getWidth(right);
    });

    const next = remaining.shift();
    if (!next) break;
    ordered.push(next);
    currentWidthMm = getWidth(next);
    currentStorisMm = getStoris(next);
  }

  return ordered;
}
