import express from "express";
import { config } from "dotenv";
import { recordVisit, redis, sendDailyVisits, sendHourlyVisits, sendServerStart, sendServerStop } from "./data";
config();

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK || "";

const app = express();
const port = 3000;

app.get("/", (_, res) => {
  res.send("issa smol analytics serva keeping track of visit counts\nhttps://github.com/0xstrobe/smol-analytics");
});

app.post("/visit/*", (req, res) => {
  const route = req.url.split("/visit/")[1];
  // process asynchronously and send response immediately
  recordVisit(route);
  res.status(200).send("ok");
});

const main = async () => {
  await redis.connect();

  setInterval(
    async () => {
      try {
        await sendHourlyVisits(DISCORD_WEBHOOK);

        const now = new Date();
        const isMidnight = now.getHours() === 0;
        if (isMidnight) {
          await sendDailyVisits(DISCORD_WEBHOOK);
        }
      } catch (err) {
        console.error("[ERR]", err);
      }
    },
    1000 * 60 * 60,
  );

  app.listen(port, () => {
    console.log(`server started at http://localhost:${port}`);
    sendServerStart(DISCORD_WEBHOOK);
  });
};

main();

// sendServerStop on exit
process.on("exit", () => {
  sendServerStop(DISCORD_WEBHOOK);
});
