"use strict";

/**
 * ライブラリのインポート
 */
const express = require("express");

/**
 * 初期設定
 */
require("dotenv").config();
const app = express();
const routes = {
  webhookRouter: require("./routes/webhook.js"),
};

/**
 * APIルート作成
 */
app.use("/webhook", routes.webhookRouter);

/**
 * サーバの起動
 */
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`listening on ${port}`);
});
