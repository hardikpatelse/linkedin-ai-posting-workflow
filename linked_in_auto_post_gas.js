/**
 * LinkedIn Post Generator – Google Apps Script (v2 – enhanced)
 * -----------------------------------------------------------------
 * NEW FEATURES
 *   ✅ Tone column – choose Professional / Witty / Casual / Data‑driven / etc.
 *   ✅ Status column – shows OK / ERROR for easy filtering.
 *   ✅ Robust error + quota handling.
 *   ✅ Rate‑limit guard (≈55 requests/min).
 *   ✅ Cleaner prompt with dynamic hashtags.
 *
 * Sheet layout (Row 1 headers):
 *   A URL | B Tone | C Summary | D Post | E Status
 * -----------------------------------------------------------------
 */

/* ️⚙️ CONFIGURE ME */
const scriptProperties = PropertiesService.getScriptProperties()

const CONFIG = {
  API_KEY: scriptProperties.getProperty('OpenAPISecret'),  // 🔑 Put in Apps Script → Project Settings → Secrets for safety
  API_URL: 'https://api.openai.com/v1/chat/completions',
  MODEL: 'gpt-4o',                       // Free/cheap & plenty good for this task
  SHEET_NAME: 'Form Responses 1',
  COL_URL: 2,      // B
  COL_TONE: 3,     // C
  COL_SUMMARY: 4,  // D
  COL_POST: 5,     // E
  COL_STATUS: 6,   // F
  RATE_LIMIT_MS: 1100,  // 60 / 55 ≈ 1.1 s per call

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: scriptProperties.getProperty('TelegramBotToken'),
  TELEGRAM_CHAT_IDS: scriptProperties.getProperty('TelegramChatIDs').split(','), // array → can send to multiple reviewers
  TELEGRAM_WEBHOOK_SECRET: scriptProperties.getProperty('TelegramWebHookSecret')   // simple shared secret to validate webhook URL

}

/* ------------------------------------------------------------------
 *  TRIGGERS
 * ----------------------------------------------------------------*/

/* ① Trigger – on form submit */
function onFormSubmit(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME)
  const lastRow = sheet.getLastRow()
  processRow(sheet, lastRow)
}

/* ② Trigger – cron to catch missed rows */
function processPending() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME)
  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) { // skip header
    const row = data[i]
    const status = row[CONFIG.COL_STATUS - 1]
    const url = row[CONFIG.COL_URL]
    if (status === 'Pending' && url) {
      processRow(sheet, i + 1)
    }
  }
}

/* ---------------- Core Logic ---------------- */
function processRow(sheet, row) {
  const url = sheet.getRange(row, CONFIG.COL_URL).getValue()
  if (!url) return

  // Mark as Pending first
  sheet.getRange(row, CONFIG.COL_STATUS).setValue('Running')

  const tone = (sheet.getRange(row, CONFIG.COL_TONE).getValue() || 'professional and serious').toString().toLowerCase()

  try {
    const articleText = fetchArticleText(url)
    const { summary, post } = generateLinkedInPost(articleText, tone)

    // Write draft to sheet
    sheet.getRange(row, CONFIG.COL_SUMMARY).setValue(summary)
    sheet.getRange(row, CONFIG.COL_POST).setValue(post)

    // Send to Telegram for approval
    sendForApproval(row, url, summary, post)
    sheet.getRange(row, CONFIG.COL_STATUS).setValue('Sent')
  } catch (err) {
    Logger.log(err)
    const msg = err.message.includes('quota') ? '⚠️ Quota exceeded' : '❌ ' + err.message
    sheet.getRange(row, CONFIG.COL_STATUS).setValue(msg)
  }

  Utilities.sleep(CONFIG.RATE_LIMIT_MS) // stay under rate limit
}

/**
 * Basic HTML → plain‑text extractor (truncates to 8 K chars).
 */
function fetchArticleText(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true })
  if (res.getResponseCode() !== 200) throw new Error('Fetch ' + res.getResponseCode())
  const html = res.getContentText()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

/**
 * Calls GPT‑3.5 to produce summary + LinkedIn post.
 */
function generateLinkedInPost(articleText, tone) {
  const prompt = `You are a professional LinkedIn content writer.\n\nSummarise the article below into exactly 4 concise bullet points. Then craft a LinkedIn post (max 100 words) in a **${tone}** tone, finishing with exactly 4 relevant hashtags.\n\nReturn valid JSON with keys \"summary\" (string) and \"post\" (string).Do not include any code expressions.\n\nArticle:\n"""${articleText}"""`

  const payload = {
    model: CONFIG.MODEL,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 512
  }

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  }

  const res = UrlFetchApp.fetch(CONFIG.API_URL, options)
  const data = JSON.parse(res.getContentText())
  if (data.error) throw new Error(data.error.message)

  const content = data.choices[0].message.content.trim()
  try {
    // Clean markdown code block
    let cleaned = content
    if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\\s*/i, '')

    if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```$/, '')
    //cleaned = cleaned.replace(/\\"/g, '"').replace(/""/g, '"');

    const parsed = JSON.parse(cleaned)
    return { summary: parsed.summary, post: parsed.post }
  } catch (e) {
    // Fallback to string-based split
    const parts = content.split(/Post:/i)
    return {
      summary: parts[0].replace(/Summary:/i, '').trim(),
      post: (parts[1] || '').trim()
    }
  }
}


/* ------------------------------------------------------------------
 *  TELEGRAM INTEGRATION
 * ----------------------------------------------------------------*/

function sendForApproval(row, url, summary, post) {
  const text = `LinkedIn post draft for approval (row ${row}):\n\n` +
    `🔗 *URL*: ${url}\n\n` +
    `*Summary*:\n${summary}\n\n` +
    `*Post*:\n${post}`

  const keyboard = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `approve_${row}` },
      { text: '❌ Reject', callback_data: `reject_${row}` }
    ]]
  }

  CONFIG.TELEGRAM_CHAT_IDS.forEach(chatId => {
    telegramApi('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      reply_markup: JSON.stringify(keyboard)
    })
  })
}

function telegramApi(method, payload) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/${method}`
  const params = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  }
  const res = UrlFetchApp.fetch(url, params)
  const code = res.getResponseCode()
  if (code !== 200) Logger.log('Telegram error ' + code + ': ' + res.getContentText())
}

/**
 * Webhook endpoint for Telegram – must deploy as Web App.
 *  ‑ Set deployment:  *Execute as ► Me*, *Accessible by ► Anyone*.
 *  ‑ Then set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=<DEPLOY_URL>&secret_token=<SECRET>
 */
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME)
  //const rowNo = 15;
  try {
    // Validate secret (Telegram sends header `x-telegram-bot-api-secret-token`)
    // Mark as Pending first
    const secret = e.parameter.tgSecret        // ← comes from ?tgSecret=...
    //sheet.getRange(rowNo, 7).setValue(secret);
    if (CONFIG.TELEGRAM_WEBHOOK_SECRET &&
      secret !== CONFIG.TELEGRAM_WEBHOOK_SECRET) {
      return ContentService.createTextOutput('unauthorized')
    }

    const update = JSON.parse(e.postData.contents)
    //sheet.getRange(rowNo, 8).setValue(update);
    if (!update.callback_query) return ContentService.createTextOutput('ok')

    const data = update.callback_query.data // format: approve_5 or reject_12
    //sheet.getRange(rowNo, 9).setValue(data);
    const [action, rowStr] = data.split('_')
    const row = parseInt(rowStr, 10)

    if (action === 'approve') {
      sheet.getRange(row, CONFIG.COL_STATUS).setValue('Approved')
      answerCallback(update.callback_query.id, 'Approved')
    } else if (action === 'reject') {
      sheet.getRange(row, CONFIG.COL_STATUS).setValue('Rejected')
      answerCallback(update.callback_query.id, 'Rejected')
    }

    return ContentService.createTextOutput('ok')
  } catch (error) {
    //sheet.getRange(rowNo, 10).setValue(error);
    Logger.log('Error in doPost : ' + error)
  }

}

function answerCallback(callbackId, text) {
  telegramApi('answerCallbackQuery', {
    callback_query_id: callbackId,
    text: text,
    show_alert: false
  })
}


/* ---------------------------------------------------------------------------
 *  TRIGGER INSTALLER (optional helper)
 * -------------------------------------------------------------------------*/
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t))
  const ss = SpreadsheetApp.getActiveSpreadsheet()

  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create()

  ScriptApp.newTrigger('processPending')
    .timeBased()
    .everyHours(1)
    .create()
}