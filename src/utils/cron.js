const cron = require('node-cron');
const processRequery = require("../jobs/requeryJob");
const processFailedRefunds = require("../jobs/processFailedRefund");

let isRunning = false;

cron.schedule("* * * * *", async () => {
  if (isRunning) {
    console.log("⏭️ Previous cron run still in progress, skipping this tick");
    return;
  }

  isRunning = true;

  try {
    console.log("⏳ Running VTpass requery job...");
    await processRequery();

    console.log("💰 Running failed refund job...");
    await processFailedRefunds();
  } finally {
    isRunning = false;
  }
});