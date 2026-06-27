import twilio from 'twilio'

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN env vars')
}

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

export const FROM = process.env.TWILIO_FROM_NUMBER
export const TO   = process.env.TWILIO_TO_NUMBER

export async function sendSMS(body, to = TO) {
  const msg = await twilioClient.messages.create({ body, from: FROM, to })
  console.log(`[twilio] SMS sent → ${to} (sid: ${msg.sid})`)
  return msg
}
