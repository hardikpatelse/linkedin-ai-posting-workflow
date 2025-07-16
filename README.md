
# 🤖 LinkedIn Auto Post Generator (GPT-4o + Telegram + Zapier)

This Google Apps Script automates the creation, approval, and posting of LinkedIn content using GPT‑4o, Telegram, and Google Sheets. It allows you to share article URLs, generate impactful posts with AI, get approvals via Telegram, and schedule posts to LinkedIn using Zapier.

---

## ✨ Features

- 🔗 Input an article URL in Google Sheets
- 💬 GPT‑4o generates summary + LinkedIn-style post with tone control
- 📲 Approval via Telegram with ✅ Approve / ❌ Reject buttons
- 🕓 Auto-scheduling to your LinkedIn **profile** using **Zapier**
- 🛡 Rate-limited, robust error handling, and retry logic

---

## 🧩 Architecture

```
Google Forms ─▶ Google Sheets ─▶ Apps Script ─▶ GPT‑4o (OpenAI)
                         │           │
                         │           └──▶ Telegram Bot (Approval)
                         │
                         └──▶ Zapier (Scheduled LinkedIn Post)
```

---

## 📝 Google Sheet Layout

| Column | Header           | Purpose                                     |
|--------|------------------|---------------------------------------------|
| A      | Timestamp        | Auto-generated                              |
| B      | URL              | Article link input                          |
| C      | Tone             | Witty, Professional, Casual, etc.           |
| D      | Summary          | Auto-generated                              |
| E      | Post             | AI-generated post                           |
| F      | Status           | Running, Pending, Sent, Approved, Rejected  |

---

## 🔧 Setup Instructions

### 1. Clone this repo and copy the code to Google Apps Script

- Open [script.new](https://script.new)
- Paste the contents of `linked_in_auto_post_gas.js`
- Link it to your Google Sheet (or create one using the column layout above)

---

### 2. Set Script Properties (Secrets)

Under **Apps Script > Project Settings > Script Properties**, add:

| Key                     | Value                       |
|-------------------------|-----------------------------|
| `OpenAPISecret`         | Your OpenAI API key         |
| `TelegramBotToken`      | From @BotFather             |
| `TelegramChatIDs`       | Comma-separated chat IDs    |
| `TelegramWebHookSecret` | Your custom shared secret   |

---

### 3. Deploy the Telegram Webhook [Within Google App Script]

1. **Deploy as Web App**:
   - Execute as: **Me**
   - Who has access: **Anyone**
2. Copy your deployment URL
3. Run this:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=<WEB_APP_URL>?tgSecret=<TelegramWebHookSecret>
   ```

---

### 4. Setup Zapier for Scheduled Auto Posting

#### 💡 Trigger:
- Google Sheets → **New or Updated Row**
- Filter: `Status = Approved`

#### 🔁 Action:
- LinkedIn → Create Share Update (Profile)
- Google Sheets → Update row: set `Status = Posted`

> Example Zapier flow included in `/assets/zapier-flow.png`

---

## ✅ Trigger Installation

Run this once to install both triggers:
```js
installTriggers()
```

- `onFormSubmit` → Runs when form is submitted
- `processPending` → Hourly sweep of missed rows

---

## 💡 Future Enhancements

- [ ] Post-edit suggestion via Telegram
- [ ] Analytics feedback loop from LinkedIn
- [ ] Tone scoring / performance tracking
- [ ] Slack notification integration

---

## 📄 License

MIT © 2025 Hardik Patel
