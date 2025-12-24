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

/* ===== KEEP ALIVE AGENT ===== */
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
const randStr = (l = 12) => Math.random().toString(36).substring(2, 2 + l);
const randNum = (l = 12) => Math.random().toString().replace(".", "").substring(0, l);

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

/* ===== GET DETAILS ===== */
async function details(headers) {
  const r = await api.get(URL.details, { headers });
  const u = r.data.data.user;
  return { cash: +u.cash, coins: +u.coins };
}

/* ===== PLACE ORDER ===== */
const placeOrder = async (username, headers) => {
  try {
    const r = await api.post(URL.order, {
      service_id: 3,
      service_quantity_id: 16,
      url: `https://www.instagram.com/${username}?igsh=MWV2anJtYWdhaHlwYg==`
    }, { headers });
    if (r.data?.success) return "Order placed → 20 followers";
    return "Order failed";
  } catch {
    return "Order error";
  }
};

/* ===== COMPLETE TASK ===== */
async function doTask(ds, headers, username, res) {
  try {
    const t = await api.get(URL.tasks + ds, { headers });

    if (t.data.message?.includes("No more tasks")) {
      const n = await addAccount(headers);
      if (n) ds = n;
      res.write(`<b>New Instagram account added:</b> DS USER ID = ${ds}<br><hr>`);
      return ds;
    }

    const taskId = t.data?.data?.tasks?.[0]?.id;
    if (!taskId) return ds;

    await api.post(URL.complete, {
      task_id: taskId,
      ig_profile_key: ds,
      follower_count: 618
    }, { headers });

    let { cash, coins } = await details(headers);
    res.write(`<b>Task completed:</b> DS=${ds} | Balance: ${cash} | Coins: ${coins}<br>`);

    // Convert cash ≥ 10 to coins
    while (cash >= 10) {
      const conv = await api.post(URL.convert, { amount: 10 }, { headers });
      coins = conv.data.data.user_balance.coins;
      cash = conv.data.data.user_balance.cash;
      res.write(`<b>Converted 10 Cash → Coins:</b> Coins=${coins} | Remaining Cash=${cash}<br>`);

      const orderStatus = await placeOrder(username, headers);
      res.write(`<b>${orderStatus}</b><br>`);
    }

  } catch (e) {
    res.write(`<b>Error:</b> ${e.message}<br>`);
  }
  return ds;
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
  res.write(`<b>Token:</b> ${headers.Authorization}<hr>`);

  let ds = await addAccount(headers);
  res.write(`<b>Instagram Account created:</b> DS USER ID = ${ds}<br><hr>`);

  const bal = await details(headers);
  res.write(`<b>Starting Balance:</b> ${bal.cash} | <b>Coins:</b> ${bal.coins}<hr>`);

  const batchSize = 2; // 5 requests/sec
  let completed = 0;

  // Infinite loop until user closes connection
  while (true) {
    const batch = Array.from({ length: batchSize }, () => doTask(ds, headers, username, res));
    const results = await Promise.all(batch);
    ds = results[results.length - 1]; // update DS from last task

    completed += batchSize;
    res.write(`<b>Total requests processed:</b> ${completed}<br>`);

    // Wait 1 sec between batches
    await new Promise(r => setTimeout(r, 1000));

    // Stop if client disconnects
    if (res.finished) break;
  }

  res.end("<hr><b>Stopped by user</b>");
});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("RUNNING ON", PORT));
