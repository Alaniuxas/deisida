import { runFridayQueuePlan } from "../src/lib/queue/plan";

runFridayQueuePlan()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
