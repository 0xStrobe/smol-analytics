import { createClient } from "redis";
import { config } from "dotenv";
config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/";
const KEY_PREFIX = "visit:";

export const redis = createClient({ url: REDIS_URL });

redis.on("connect", () => {
  console.log("Redis client connected");
});

redis.on("error", (err) => {
  console.error("[ERR]", err);
});

export const recordVisit = async (route: string) => {
  const timestamp = Date.now();
  const hourId = Math.floor(timestamp / 1000 / 60 / 60);
  const hourly = KEY_PREFIX + `hourly:${hourId}:${route}`;
  const dayId = Math.floor(timestamp / 1000 / 60 / 60 / 24);
  const daily = KEY_PREFIX + `daily:${dayId}:${route}`;

  await redis.incr(hourly);
  await redis.incr(daily);
};

export const scanDailyVisits = async () => {
  const dayId = Math.floor(Date.now() / 1000 / 60 / 60 / 24);
  const daily = KEY_PREFIX + `daily:${dayId}:*`;

  return await scanVisits(daily);
};

export const scanHourlyVisits = async () => {
  const hourId = Math.floor(Date.now() / 1000 / 60 / 60);
  const hourly = KEY_PREFIX + `hourly:${hourId}:*`;

  return await scanVisits(hourly);
};

const scanVisits = async (prefix: string) => {
  const routes = await redis.keys(prefix);
  const results = await redis.mGet(routes);

  const visitsDict = routes.reduce(
    (acc, key, idx) => {
      const visits = parseInt(results[idx] || "0");
      const route = key.split(":")[2];
      acc[route] = visits;
      return acc;
    },
    {} as { [route: string]: number },
  );

  const visitsSorted = Object.entries(visitsDict).sort((a, b) => b[1] - a[1]);
  return visitsSorted;
};

const formatDiscordPayload = (mode: "hourly" | "daily", visits: [string, number][]) => {
  const top20 = visits.slice(0, 20);

  // use the block unicode character to make a bar chart
  const maxVisits = top20[0][1];
  const chart = top20
    .map(([route, visits]) => {
      const blocks = Math.floor((visits / maxVisits) * 10);
      return `${route.padEnd(20, " ")} ${"█".repeat(blocks)} ${visits}`;
    })
    .join("\n");

  const unit = `each █ is ${Math.floor(maxVisits / 10)} visits`;

  const content = `**${mode} visits**\n\`\`\`\n${chart}\n\n${unit}\n\`\`\``;

  return {
    content,
  };
};

export const sendHourlyVisits = async (webhookUrl: string) => {
  const visits = await scanHourlyVisits();
  const payload = formatDiscordPayload("hourly", visits);

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
};

export const sendDailyVisits = async (webhookUrl: string) => {
  const visits = await scanDailyVisits();
  const payload = formatDiscordPayload("daily", visits);

  await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
};
