import { importWorkNorms, resolveWorkNormsCsvPath } from "../src/lib/queue/work-norms";

const csvArg = process.argv[2];

importWorkNorms(csvArg)
  .then((count) => {
    console.log(
      JSON.stringify(
        { imported: count, csv: csvArg ?? resolveWorkNormsCsvPath() },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
