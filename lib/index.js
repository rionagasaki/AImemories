"use strict";

/**
 * ライブラリの読み込み
 */
const line = require("@line/bot-sdk");

/**
 * 初期設定
 */
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);

/**
 * 自作関数群
 */

/**
 * 2000文字を区切りテキストを分割し配列を返す関数
 * @param {String} text
 */
exports.getTextArray = (text) => {
  const texts = [];
  if (text.length > 2000) {
    while (text.length > 2000) {
      texts.push(text.substr(0, 2000));
      text = text.slice(2000, -1);
    }
  }
  texts.push(text);
  return texts;
};

/**
 * LINEサーバーからファイルをbufferでダウンロード
 * @param {Number} messageId
 */
exports.getContentBuffer = (messageId) => {
  return new Promise((resolve, reject) => {
    client.getMessageContent(messageId).then((stream) => {
      const content = [];
      stream
        .on("data", (chunk) => {
          content.push(Buffer.from(chunk));
        })
        .on("error", reject)
        .on("end", () => {
          resolve(Buffer.concat(content));
        });
    });
  });
};
