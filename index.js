const express = require("express");
const axios = require("axios");
const http = require("http");
const https = require("https");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ===== HOME PAGE ===== */
app.get("/", (req, res) => {
  res.send(`
    <form method="POST" action="/">
      <input name="username" placeholder="Instagram username" required />
      <button type="submit">Start</button>
    </form>
  `);
});

/* ===== KEEP ALIVE ===== */
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

/* ===== AUTH ===== */
async function auth() {
  const r = await api.post(URL.auth, { device_id: randStr(16).toUpperCase() });
  return { Authorization: "Bearer " + r.data.data.token };
}

/* ===== ADD ACCOUNT ===== */
async function addAccount(headers) {
  const r = await api.post(URL.add, {
    cookies: `csrftoken=${randStr(16)}; datr=${randStr(16)}`,
    ds_user_id: randNum(12),
    username: randStr(8),
    password: randStr(10)
  }, { headers });
  return r.data?.data?.instagramAccount?.ds_user_id || null;
}

/* ===== DETAILS ===== */
async function details(headers) {
  const r = await api.get(URL.details, { headers });
  const u = r.data.data.user;
  return { cash: +u.cash, coins: +u.coins };
}

/* ===== ORDER ===== */
const placeOrder = (username, headers) => api.post(URL.order, {
  service_id: 3,
  service_quantity_id: 16,
  url: `https://www.instagram.com/${username}`
}, { headers }).catch(() => {});

/* ===== SINGLE TASK ===== */
async function doTask(state, headers, username) {
  const t = await api.get(URL.tasks + state.ds, { headers });
  if (t.data.message?.includes("No more tasks")) {
    const n = await addAccount(headers);
    if (n) state.ds = n;
    return "new account added";
  }

  const id = t.data?.data?.tasks?.[0]?.id;
  if (!id) return "no task";

  await api.post(URL.complete, {
    task_id: id,
    ig_profile_key: state.ds,
    follower_count: 618
  }, { headers });

  let { cash } = await details(headers);

  while (cash >= 10) {
    const c = await api.post(URL.convert, { amount: 10 }, { headers });
    cash = c.data.data.user_balance.cash;
    await placeOrder(username, headers);
  }

  return "task completed";
}

/* ===== POST ROUTE ===== */
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
  let state = { ds };

  res.write(`<b>Starting DS USER ID:</b> ${ds}<br>`);

  const totalRequests = 1000;
  const batchSize = 10; // 10+ requests/sec
  let completed = 0;

  while (completed < totalRequests) {
    const batch = [];
    for (let i = 0; i < batchSize && completed + i < totalRequests; i++) {
      batch.push(doTask(state, headers, username));
    }
    const results = await Promise.all(batch);
    completed += batch.length;

    results.forEach((r, idx) => {
      res.write(`<b>Request ${completed - batch.length + idx + 1}:</b> ${r}<br>`);
    });

    await new Promise(r => setTimeout(r, 100)); // small delay to avoid server overload
  }

  res.end("<b>Finished 1000 Requests</b>");
});

/* ===== PORT ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));
