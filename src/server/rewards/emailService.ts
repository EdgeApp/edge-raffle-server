import sgMail from '@sendgrid/mail'
import nodemailer from 'nodemailer'

import { config } from '../../config'

const ts = () => new Date().toISOString()

const useSendGrid = config.sendgridApiKey !== ''

if (useSendGrid) {
  sgMail.setApiKey(config.sendgridApiKey)
  console.log(ts(), 'Email service: SendGrid')
} else {
  console.log(ts(), 'Email service: Gmail SMTP')
}

// ---------- Gmail SMTP (fallback) ----------

let transporter: nodemailer.Transporter | null = null

const createTransporter = (): nodemailer.Transporter => {
  console.log(ts(), 'Creating new SMTP transporter')
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: config.gmailAddress,
      pass: config.gmailAppPassword
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  } as any)
}

const getTransporter = (): nodemailer.Transporter => {
  if (transporter == null) {
    transporter = createTransporter()
  }
  return transporter
}

const resetTransporter = (): void => {
  if (transporter != null) {
    console.log(ts(), 'Resetting SMTP transporter')
    transporter.close()
    transporter = null
  }
}

// ---------- Public API ----------

const getFromAddress = (): string => {
  return config.emailFromAddress !== ''
    ? config.emailFromAddress
    : config.gmailAddress
}

/**
 * Send a verification email containing both a 4-digit code and a
 * clickable verification link.
 */
export const sendVerificationEmail = async (params: {
  to: string
  verificationCode: string
  verificationToken: string
  baseUrl: string
}): Promise<void> => {
  const { to, verificationCode, verificationToken, baseUrl } = params
  const verifyUrl = `${baseUrl}/api/rewards/verify?token=${verificationToken}`
  const from = getFromAddress()

  const text = `Thanks for registering for Edge Rewards!

Your verification code is: ${verificationCode}

Enter this code on the verification page, or click the link below:

${verifyUrl}

This code and link expire in 10 minutes.`

  if (useSendGrid) {
    console.log(ts(), `SendGrid sending email to ${to} from ${from}`)
    await sgMail.send({
      to,
      from,
      subject: 'Verify your email for Edge Rewards',
      text
    })
    console.log(ts(), `SendGrid email sent to ${to}`)
  } else {
    console.log(ts(), `SMTP sendMail starting for ${to}`)
    try {
      await getTransporter().sendMail({
        from,
        to,
        subject: 'Verify your email for Edge Rewards',
        text
      })
      console.log(ts(), `SMTP sendMail complete for ${to}`)
    } catch (error) {
      resetTransporter()
      throw error
    }
  }
}
