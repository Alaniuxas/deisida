import { importCuttingNorms, resolveCuttingNormsXlsxPath } from "../src/lib/queue/excel-norms";

const xlsxArg = process.argv[2];

importCuttingNorms(xlsxArg)
  .then((result) => {
    console.log(
      JSON.stringify(
        {
          ...result,
          xlsx: xlsxArg ?? resolveCuttingNormsXlsxPath(),
        },
        null,
        2,
      ),
    );
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
