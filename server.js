const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir, { extensions: ["html"] }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((_req, res) => {
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Cotewall Mews handbook → http://localhost:${PORT}`);
});
