const express = require("express");
const axios = require("axios");
const http = require("http");
const https = require("https");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ===== KEEP ALIVE (SPEED BOOST) ===== */
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

/* ===== HELPERS ===== */
const randStr = (l = 12) =>
  Math.random().toString(36).substring(2, 2 + l);
const randNum = (l = 12) =>
  Math.random().toString().replace(".", "").substring(0, l);

/* ===== URLS ===== */
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
  const r = await api.post(URL.auth, {
    device_id: randStr(16).toUpperCase()
  });
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
const placeOrder = (username, headers) =>
  api.post(URL.order, {
    service_id: 3,
    service_quantity_id: 16,
    url: `https://www.instagram.com/${username}`
  }, { headers }).catch(()=>{});

/* ===== SINGLE TASK ===== */
async function doTask(state, headers, username) {
  const t = await api.get(URL.tasks + state.ds, { headers });

  if (t.data.message?.includes("No more tasks")) {
    const n = await addAccount(headers);
    if (n) state.ds = n;
    return;
  }

  const id = t.data?.data?.tasks?.[0]?.id;
  if (!id) return;

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
}

/* ===== MASS PARALLEL RUNNER ===== */
async function runFast(username, total = 1000, batch = 20) {
  const headers = await auth();
  let ds = await addAccount(headers);
  let state = { ds };

  for (let i = 0; i < total; i += batch) {
    const jobs = [];
    for (let j = 0; j < batch; j++) {
      jobs.push(doTask(state, headers, username));
    }
    await Promise.all(jobs); // 🔥 20x–30x speed
  }
}

/* ===== ROUTE ===== */
app.post("/", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.send("username required");

  res.send("Started in background");
  runFast(username).catch(console.error);
});

/* ===== PORT ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));
