const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

/* ===== AXIOS INSTANCE (FAST) ===== */
const api = axios.create({
  timeout: 15000,
  headers: {
    "Accept-Encoding": "gzip",
    "User-Agent": "okhttp/4.12.0",
    "Content-Type": "application/json"
  }
});

/* ===== HELPERS ===== */
const randStr = (l = 12) =>
  Math.random().toString(36).substring(2, 2 + l);

const randNum = (l = 12) =>
  Math.random().toString().replace(".", "").substring(0, l);

/* ===== URLS ===== */
const authUrl = "https://api.flyfollowers.in/api/v5/auth";
const taskUrlBase = "https://api.flyfollowers.in/api/v5/tasks?ig_profile_key=";
const completeUrl = "https://api.flyfollowers.in/api/v5/tasks/complete";
const addAccountUrl = "https://api.flyfollowers.in/api/v5/instagram-accounts";
const convertUrl = "https://api.flyfollowers.in/api/v5/conversion/convert";
const detailsUrl = "https://api.flyfollowers.in/api/v5/auth/details";
const orderUrl = "https://api.flyfollowers.in/api/v5/orders";

/* ===== AUTH ===== */
async function auth() {
  const res = await api.post(authUrl, {
    device_id: randStr(16).toUpperCase()
  });
  return "Bearer " + res.data.data.token;
}

/* ===== ADD INSTAGRAM ACCOUNT ===== */
async function addInstagram(headers) {
  const res = await api.post(
    addAccountUrl,
    {
      cookies: `csrftoken=${randStr(16)}; datr=${randStr(16)}`,
      ds_user_id: randNum(12),
      username: randStr(8),
      password: randStr(10)
    },
    { headers }
  );

  return res.data?.data?.instagramAccount?.ds_user_id || null;
}

/* ===== USER DETAILS ===== */
async function getDetails(headers) {
  const res = await api.get(detailsUrl, { headers });
  const u = res.data.data.user;
  return { cash: +u.cash, coins: +u.coins };
}

/* ===== PLACE ORDER ===== */
async function placeOrder(username, headers) {
  try {
    await api.post(
      orderUrl,
      {
        service_id: 3,
        service_quantity_id: 16,
        url: `https://www.instagram.com/${username}`
      },
      { headers }
    );
    console.log("Order placed →", username);
  } catch {
    console.log("Order failed →", username);
  }
}

/* ===== COMPLETE TASK ===== */
async function completeTask(state, headers, username) {
  const taskRes = await api.get(taskUrlBase + state.dsUserId, { headers });

  if (taskRes.data.message?.includes("No more tasks")) {
    const newId = await addInstagram(headers);
    if (newId) state.dsUserId = newId;
    return;
  }

  const taskId = taskRes.data?.data?.tasks?.[0]?.id;
  if (!taskId) return;

  await api.post(
    completeUrl,
    {
      task_id: taskId,
      ig_profile_key: state.dsUserId,
      follower_count: 618
    },
    { headers }
  );

  let { cash, coins } = await getDetails(headers);
  console.log("Balance:", cash, coins);

  while (cash >= 10) {
    const conv = await api.post(
      convertUrl,
      { amount: 10.0 },
      { headers }
    );

    cash = conv.data.data.user_balance.cash;
    coins = conv.data.data.user_balance.coins;

    console.log("Converted 10 Cash → Coins:", coins);
    await placeOrder(username, headers);
  }
}

/* ===== SERVER ===== */
app.post("/", async (req, res) => {
  const username = req.body.username;
  if (!username) return res.send("Username required");

  const token = await auth();
  const headers = { Authorization: token };

  let dsUserId = await addInstagram(headers);
  let state = { dsUserId };

  console.log("Starting DS USER:", dsUserId);

  for (let i = 1; i <= 1000; i++) {
    console.log("Request", i);
    await completeTask(state, headers, username);
    await new Promise(r => setTimeout(r, 200)); // 5 req/sec
  }

  res.send("FINISHED 1000 REQUESTS");
});

app.listen(3000, () => console.log("Server running on 3000"));
