const express = require("express");
const axios = require("axios");
const http = require("http");
const https = require("https");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <form method="POST" action="/">
      <input name="username" placeholder="Instagram username" required />
      <button type="submit">Start</button>
    </form>
  `);
});

const agent = {
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
};

const api = axios.create({
  timeout: 15000,
  ...agent,
  headers: {
    "User-Agent": "okhttp/4.12.0",
    "Accept-Encoding": "gzip",
    "Content-Type": "application/json"
  }
});

const randStr = (l = 12) => Math.random().toString(36).substring(2, 2 + l);
const randNum = (l = 12) => Math.random().toString().replace(".", "").substring(0, l);

const URL = {
  auth: "https://api.flyfollowers.in/api/v5/auth",
  tasks: "https://api.flyfollowers.in/api/v5/tasks?ig_profile_key=",
  complete: "https://api.flyfollowers.in/api/v5/tasks/complete",
  add: "https://api.flyfollowers.in/api/v5/instagram-accounts",
  convert: "https://api.flyfollowers.in/api/v5/conversion/convert",
  details: "https://api.flyfollowers.in/api/v5/auth/details",
  order: "https://api.flyfollowers.in/api/v5/orders"
};

async function auth() {
  const r = await api.post(URL.auth, { device_id: randStr(16).toUpperCase() });
  return { Authorization: "Bearer " + r.data.data.token };
}

async function addAccount(headers) {
  const r = await api.post(URL.add, {
    cookies: `csrftoken=${randStr(16)}; datr=${randStr(16)}`,
    ds_user_id: randNum(12),
    username: randStr(8),
    password: randStr(10)
  }, { headers });
  return r.data?.data?.instagramAccount?.ds_user_id || null;
}

async function details(headers) {
  const r = await api.get(URL.details, { headers });
  const u = r.data.data.user;
  return { cash: +u.cash, coins: +u.coins };
}

const placeOrder = (username, headers) => api.post(URL.order, {
  service_id: 3,
  service_quantity_id: 16,
  url: `https://www.instagram.com/${username}`
}, { headers }).catch(() => {});

async function doTask(ds, headers, username) {
  try {
    const t = await api.get(URL.tasks + ds, { headers });

    if (t.data.message?.includes("No more tasks")) {
      const n = await addAccount(headers);
      return { status: "new account added", ds: n || ds };
    }

    const id = t.data?.data?.tasks?.[0]?.id;
    if (!id) return { status: "no task", ds };

    await api.post(URL.complete, { task_id: id, ig_profile_key: ds, follower_count: 618 }, { headers });

    let { cash } = await details(headers);

    while (cash >= 10) {
      const c = await api.post(URL.convert, { amount: 10 }, { headers });
      cash = c.data.data.user_balance.cash;
      await placeOrder(username, headers);
    }

    return { status: "task completed", ds };
  } catch {
    return { status: "error", ds };
  }
}

app.post("/", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.send("username required");

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Transfer-Encoding": "chunked"
  });
  res.write(`<b>Started for:</b> ${username}<br>`);

  const headers = await auth();
  let ds = await addAccount(headers);
  res.write(`<b>Starting DS USER ID:</b> ${ds}<br>`);

  const totalRequests = 10000;
  const batchSize = 5; // 5 requests per second
  let completed = 0;

  while (completed < totalRequests) {
    // fire batch
    const batch = Array.from({ length: batchSize }, () => doTask(ds, headers, username));
    const results = await Promise.all(batch);

    results.forEach(r => {
      ds = r.ds; // update DS if new account
      completed++;
      res.write(`<b>Request ${completed}:</b> ${r.status}<br>`);
    });

    // wait 1 second before next batch
    await new Promise(r => setTimeout(r, 1000));
  }

  res.end("<b>Finished 10000 Requests</b>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));
