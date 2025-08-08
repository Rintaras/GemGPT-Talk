# GemGPT Talk

ChatGPT と Google Gemini が現在のテーマに沿って 1 秒間隔で交互に会話し続ける最小構成の Electron アプリ。ユーザーはいつでも自分の発言を挿入できます。

## セットアップ

1. 依存関係のインストール

```bash
npm install
```

2. `.env` に API キーを設定

```
OPENAI_API_KEY=あなたのOpenAIキー
GEMINI_API_KEY=あなたのGeminiキー
```

3. アプリ起動

```bash
npm run dev
```

## 使い方
- 画面上部の「現在のテーマ」に話題を入力すると、以降の応答が自然にそのテーマへ切り替わります。
- 下部の「自分の発言」で送信すると、会話に割り込めます。
- 会話履歴は全て保持され、各応答時のコンテキストに渡されます。

## 技術要素
- Electron (メイン/レンダラ分離、`preload` による安全なAPIブリッジ)
- OpenAI API (`openai`)
- Google Gemini API (`@google/generative-ai`)
- dotenv による `.env` 読み込み
- JavaScript (ESM)

## 備考
- API 応答時間に依存するため、厳密な 1.0 秒間隔は保証できませんが、少なくとも 1 秒間隔で交互進行するよう制御しています。