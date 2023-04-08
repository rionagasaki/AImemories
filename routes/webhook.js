"use strict";

/**
 * ライブラリのインポート
 */
const line = require("@line/bot-sdk");
const express = require("express");
const func = require("../lib/index");
const gcloudApi = require("../lib/gcloud-api");
const { Configuration, OpenAIApi } = require("openai");

/**
 * 初期化
 */
const router = express.Router();
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new line.Client(config);
const debounceTime = 5000;
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
let lastImageTimestamp = 0;

let images = [];
let mode = "";
/**
 * 本番用のルート
 */
router.post("/", line.middleware(config), async (req, res) => {
  Promise.all(req.body.events.map(handlerEvent))
    .then((result) => {
      console.log(result);
      res.status(200).end();
    })
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

/**
 * メイン関数
 */
const handlerEvent = async (event) => {
  // Webhookの検証
  if (event.replyToken && event.replyToken.match(/^(.)\1*$/)) {
    return "Webhookの検証";
  }

  const replyToken = event.replyToken;

  // イベントの処理
  switch (event.type) {
    case "message":
      const message = event.message;
      let text;
      switch (message.type) {
        case "text":
          if (message.text == "はい") {
            if (images.length == 0) {
              replyText(replyToken, "画像が一枚も選択されていません💦")
            } else {
              await requestChatgpt(replyToken, mode, images.join());
              images = [];
            }
          } else if (message.text == "要約") {
            mode = "要約";
            displayQuickReply(replyToken, mode);
          } else if (message.text == "問題") {
            mode = "問題";
            displayQuickReply(replyToken, mode);
          } else if (message.text == "このやり取りを終了する") {
            await replyButtonTemplete(replyToken);
          } else {
            replyText(replyToken, "予期せぬテキストです。")
          }
          return "成功";
        case "image":
          text = await imageToText(Number(message.id));
          images.push(text);
          replyConfirmationTemplete(replyToken, mode);
          return "画像を文字起こししました";
        default:
          text = "テキストを送信してください";
          await replyText(replyToken, text);
          return "その他";
      }
    default:
      return "その他";
  }
};

/**
 * テキストを返信する関数
 * @param {String} token
 * @param {String[] | String} texts
 */
const replyText = (token, texts) => {
  texts = Array.isArray(texts) ? texts : [texts];
  return client.replyMessage(
    token,
    texts.map((text) => ({ type: "text", text }))
  );
};

const replyButtonTemplete = async (token) => {
  return client.replyMessage(token, {
    type: "template",
    altText: "This is a buttons template",
    template: {
      type: "buttons",
      thumbnailImageUrl:
        "https://onwa-illust.com/wp-content/uploads/2022/06/toyo-04-360x360.png",
      imageAspectRatio: "rectangle",
      imageSize: "cover",
      imageBackgroundColor: "#FFFFFF",
      title: "画像から要約や問題を作成するよ。",
      text: "生成したいものを選択してね。",
      actions: [
        {
          type: "message",
          label: "要約",
          text: "要約",
        },
        {
          type: "message",
          label: "問題",
          text: "問題",
        },
      ],
    },
  });
};

const replyConfirmationTemplete = async (token, mode) => {
  const currentTimestamp = new Date().getTime();

  if (currentTimestamp - lastImageTimestamp < debounceTime) {
    return;
  }
  lastImageTimestamp = currentTimestamp;

  return client.replyMessage(token, {
    type: "template",
    altText: "this is a confirm template",
    template: {
      type: "confirm",
      text: `${mode}したい写真はこれで全てですか？`,
      actions: [
        {
          type: "message",
          label: "はい",
          text: "はい",
        },
        {
          type: "message",
          label: "いいえ",
          text: "いいえ",
        },
      ],
    },
  });
};

/**
 * 画像をテキストに変換する関数
 * @param {Number} messageId
 */
const imageToText = async (messageId) => {
  const buffer = await func.getContentBuffer(messageId);
  const text = await gcloudApi.cloudVisionText(buffer);
  const texts = await func.getTextArray(text);
  return texts;
};

const requestChatgpt = async (token, mode, imageText) => {
  const openai = new OpenAIApi(configuration);
  let completion;

  if (mode === "要約") {
    completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `下のテキストの要約を作成してください。 ${imageText}`,
        },
      ],
    });
    const res = completion.data.choices[0].message.content;
    return client.replyMessage(token, {
      type: "text",
      text: res,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: "このやり取りを終了する",
              text: "このやり取りを終了する",
            },
          },
        ],
      },
    });
  } else if (mode === "問題") {
    completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `下のテキストから問題を幾つか生成してください。 ${imageText}`,
        },
      ],
    });
    const res = completion.data.choices[0].message.content;
    return client.replyMessage(token, {
      type: "text",
      text: res,
      quickReply: {
        items: [
          {
            type: "action",
            action: {
              type: "message",
              label: "このやり取りを終了する",
              text: "このやり取りを終了する",
            },
          },
        ],
      },
    });
  } else {
    return client.replyMessage(token, {
      type: "text",
      text: "要約か問題作成を選択してください。",
    });
  }
};

const displayQuickReply = (token, mode) => {
  return client.replyMessage(token, {
    type: "text",
    text: `${mode}ですね！\n${mode}したい画像を送信してください。`,
  });
};

module.exports = router;
