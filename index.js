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

  let bal = await details(headers);
  res.write(`<b>Starting Balance:</b> ${bal.cash} | <b>Coins:</b> ${bal.coins}<hr>`);

  const totalRequests = 10000;
  const batchSize = 5; // 5 requests/sec
  let completed = 0;

  while (completed < totalRequests) {
    const batch = Array.from({ length: batchSize }, () => doTask(ds, headers, username));
    const results = await Promise.all(batch);

    for (let r of results) {
      ds = r.ds; // update DS if new account added

      // fetch latest balance after task
      let bal = await details(headers);
      let statusText = `${r.status} | Balance: ${bal.cash} | Coins: ${bal.coins}`;

      // if task completed and cash>=10, show conversion
      if (r.status === "task completed" && bal.cash < 10) {
        // do nothing, cash too low
      }

      completed++;
      res.write(`<b>Request ${completed}:</b> ${statusText}<br>`);
    }

    await new Promise(r => setTimeout(r, 1000)); // 5 req/sec
  }

  res.end("<hr><b>FINISHED 10000 REQUESTS</b>");
});
