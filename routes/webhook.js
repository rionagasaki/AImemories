"use strict";
/**
 * ライブラリのインポート
 */
const line = require("@line/bot-sdk");
const express = require("express");
const func = require("../lib/index");
const gcloudApi = require("../lib/gcloud-api");
const { Configuration, OpenAIApi } = require("openai");
let tokens = [];

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
          if (tokens.length == 0) {
            if (message.text == "はい") {
              if (images.length == 0) {
                replyText(replyToken, "画像が一枚も選択されていません。");
              } else {
                await requestChatgpt(replyToken, mode, images.join());
                images = [];
              }
            } else if (message.text == "要約を作成") {
              mode = "要約を作成";
              displayQuickReply(replyToken, mode);
            } else if (message.text == "問題を作成") {
              mode = "問題を作成";
              displayQuickReply(replyToken, mode);
            } else if (message.text == "わかりやすく解説") {
              mode = "わかりやすく解説";
              displayQuickReply(replyToken, mode);
            } else if (message.text == "このやり取りを終了する") {
              tokens = [];
              await replyButtonTemplete(replyToken);
            } else {
              const messages = [
                {
                  type: "text",
                  text: "解説、要約、問題の何を作成しますか？",
                },
                {
                  type: "template",
                  altText: "解説、要約、問題出題等のサポートを行います！",
                  template: {
                    type: "buttons",
                    thumbnailImageUrl:
                      "https://onwa-illust.com/wp-content/uploads/2022/06/toyo-04-360x360.png",
                    imageAspectRatio: "rectangle",
                    imageSize: "cover",
                    imageBackgroundColor: "#FFFFFF",
                    title: "テキストを含む画像を送信してください。",
                    text: "送信された画像からテキストを抽出し、解説、要約、問題出題等のサポートを行います。",
                    actions: [
                      {
                        type: "message",
                        label: "わかりやすく解説",
                        text: "わかりやすく解説",
                      },
                      {
                        type: "message",
                        label: "要約を作成",
                        text: "要約を作成",
                      },
                      {
                        type: "message",
                        label: "問題を作成",
                        text: "問題を作成",
                      },
                    ],
                  },
                },
              ];
              await client.replyMessage(replyToken, messages);
            }
          } else {
            if (message.text == "このやり取りを終了する") {
              tokens = [];
              await replyButtonTemplete(replyToken);
              mode = "";
            } else if (message.text == "解答を作成") {
              tokens.push({
                role: "user",
                content: "この問題の解答を作成して。",
              });
              await freeTalkChatgpt(replyToken);
            } else if (message.text == "はい") {
              await requestChatgpt(replyToken, mode, images.join());
              images = [];
            } else {
              tokens.push({ role: "user", content: message.text });
              await freeTalkChatgpt(replyToken);
            }
          }
          return "成功";
        case "image":
          if (
            mode != "問題を作成" &&
            mode != "要約を作成" &&
            mode != "わかりやすく解説"
          ) {
            const messages = [
              {
                type: "text",
                text: "解説、要約、問題の何を作成しますか？",
              },
              {
                type: "template",
                altText: "解説、要約、問題出題等のサポートを行います！",
                template: {
                  type: "buttons",
                  thumbnailImageUrl:
                    "https://onwa-illust.com/wp-content/uploads/2022/06/toyo-04-360x360.png",
                  imageAspectRatio: "rectangle",
                  imageSize: "cover",
                  imageBackgroundColor: "#FFFFFF",
                  title: "テキストを含む画像を送信してください。",
                  text: "送信された画像からテキストを抽出し、解説、要約、問題出題等のサポートを行います。",
                  actions: [
                    {
                      type: "message",
                      label: "わかりやすく解説",
                      text: "わかりやすく解説",
                    },
                    {
                      type: "message",
                      label: "要約を作成",
                      text: "要約を作成",
                    },
                    {
                      type: "message",
                      label: "問題を作成",
                      text: "問題を作成",
                    },
                  ],
                },
              },
            ];
            return await client.replyMessage(replyToken, messages);
          }
          text = await imageToText(Number(message.id));
          images.push(text);
          await replyConfirmationTemplete(replyToken, mode);
          return "画像を文字起こししました";
        default:
          text = "テキストを送信してください";
          await replyText(replyToken, text);
          return "その他";
      }
    case "follow":
      const messages = [
        {
          type: "text",
          text: "友達追加ありがとうございます！話題のAI「ChatGPT」を画像入力で呼び出せる「Imageチャット!」です。\nテキストを含む写真を送るだけで、わからないことやテキスト理解のためのサポートをしてくれます。",
        },
        {
          type: "text",
          text: "早速試してみてください！！",
        },
        {
          type: "template",
          altText: "解説、要約、問題出題等のサポートを行います！",
          template: {
            type: "buttons",
            thumbnailImageUrl:
              "https://onwa-illust.com/wp-content/uploads/2022/06/toyo-04-360x360.png",
            imageAspectRatio: "rectangle",
            imageSize: "cover",
            imageBackgroundColor: "#FFFFFF",
            title: "テキストを含む画像を送信してください。",
            text: "送信された画像からテキストを抽出し、解説、要約、問題出題等のサポートを行います。",
            actions: [
              {
                type: "message",
                label: "わかりやすく解説",
                text: "わかりやすく解説",
              },
              {
                type: "message",
                label: "要約を作成",
                text: "要約を作成",
              },
              {
                type: "message",
                label: "問題を作成",
                text: "問題を作成",
              },
            ],
          },
        },
      ];
      await client.replyMessage(replyToken, messages);
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
    altText: "解説、要約、問題出題等のサポートを行います！",
    template: {
      type: "buttons",
      thumbnailImageUrl:
        "https://onwa-illust.com/wp-content/uploads/2022/06/toyo-04-360x360.png",
      imageAspectRatio: "rectangle",
      imageSize: "cover",
      imageBackgroundColor: "#FFFFFF",
      title: "テキストを含む画像を送信してください。",
      text: "送信された画像からテキストを抽出し、解説、要約、問題出題等のサポートを行います。",
      actions: [
        {
          type: "message",
          label: "わかりやすく解説",
          text: "わかりやすく解説",
        },
        {
          type: "message",
          label: "要約を作成",
          text: "要約を作成",
        },
        {
          type: "message",
          label: "問題を作成",
          text: "問題を作成",
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
    altText: "確認用のテンプレートです。",
    template: {
      type: "confirm",
      text: generateConfirmationReply(mode),
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
  const texts = func.getTextArray(text);
  return texts;
};

const freeTalkChatgpt = async (token) => {
  const openai = new OpenAIApi(configuration);
  let completion;

  completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: tokens,
  });

  const res = completion.data.choices[0].message.content;
  tokens.push({ role: "assistant", content: res });
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
};

const requestChatgpt = async (token, mode, imageText) => {
  const openai = new OpenAIApi(configuration);
  let completion;
  // 要約を作成したい場合
  if (imageText.length > 3000) {
    compression(token, imageText)
  } else {
    if (mode === "要約を作成") {
      tokens = [
        {
          role: "system",
          content: `あなたは日本語で回答するAIチャットボットです。`,
        },
        {
          role: "user",
          content: `下のテキストの要約を作成してください。 ${imageText}`,
        },
      ];
      completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: tokens,
      });

      const res = completion.data.choices[0].message.content;
      tokens.push({ role: "assistant", content: res });
      return client.replyMessage(token, {
        type: "text",
        text: `${res}\n\n●質問があれば、このまま質問文を送信してください\n●会話の内容をリセットするには「このやり取りを終了する」を押してください。`,
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
    }
    // 問題を作成したい場合
    else if (mode === "問題を作成") {
      tokens = [
        {
          role: "system",
          content: `あなたは送信されたテキスト内から日本語で回答するAIチャットボットです。`,
        },
        {
          role: "user",
          content: `送信されたテキスト内に答えがある問題(解答を聞かれた時に、答えられる問題)を幾つか生成してください。 ${imageText}`,
        },
      ];
      completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: tokens,
      });
      const res = completion.data.choices[0].message.content;
      tokens.push({ role: "assistant", content: res });
      return client.replyMessage(token, {
        type: "text",
        text: `${res}\n\n●質問があれば、このまま質問文を送信してください\n●会話の内容をリセットするには「このやり取りを終了する」を押してください。`,
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
            {
              type: "action",
              action: {
                type: "message",
                label: "解答",
                text: "解答を作成",
              },
            },
          ],
        },
      });
    } else if (mode === "わかりやすく解説") {
      tokens = [
        {
          role: "system",
          content: `あなたは日本語で回答するAIチャットボットです。`,
        },
        {
          role: "user",
          content: `生成されたテキスト内の内容を論理的に、小学生でもわかるように解説してください。 ${imageText}`,
        },
      ];

      completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: tokens,
      });
      const res = completion.data.choices[0].message.content;
      tokens.push({ role: "assistant", content: res });
      return client.replyMessage(token, {
        type: "text",
        text: `${res}\n\n●質問があれば、このまま質問文を送信してください\n●会話の内容をリセットするには「このやり取りを終了する」を押してください。`,
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
    }
  }
};

const displayQuickReply = (token, mode) => {
  return client.replyMessage(token, {
    type: "text",
    text: generateQuickReply(mode),
  });
};

const generateQuickReply = (mode) => {
  if (mode == "要約を作成") {
    return "要約の作成ですね！要約して欲しい画像を送信してください。";
  } else if (mode == "問題を作成") {
    return "問題の作成ですね！画像の内容を定着させるための問題を作成します！問題を作成して欲しい画像を送信してください。";
  } else if (mode == "わかりやすく解説") {
    return "送信された画像の内容をわかりやすく解説します！解説の欲しい画像を送信してください";
  }
};

const generateConfirmationReply = (mode) => {
  if (mode == "要約を作成") {
    return "要約したい画像がこれで全てであれば、「はい」を押してください。";
  } else if (mode == "問題を作成") {
    return "問題作成したい画像がこれで全てであれば、「はい」を押してください。";
  } else if (mode == "わかりやすく解説") {
    return "解説して欲しい画像がこれで全てであれば、「はい」を押してください。";
  }
};

module.exports = router;
