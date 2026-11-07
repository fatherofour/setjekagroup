import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain paragraphs; the first is the greeting line. */
  paragraphs: string[];
  /** The button: where in the platform to act on it. */
  action?: { label: string; path: string };
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Email, for the alerts that must reach someone outside the platform: the
 * client's sign-offs above all (7 Nov 2026). Sent through any SMTP server
 * (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM). Until one is
 * configured, each email is written to the log instead, like the password
 * reset links, so nothing fails for want of a mail server. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.MAIL_FROM || 'Setjeka Group <no-reply@setjekagroup.co.za>';
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        })
      : null;
  }

  /** The platform's own address, for links in emails and on signed documents. */
  static appUrl(path = '') {
    return `${(process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/$/, '')}${path}`;
  }

  /** Never throws: a failed email is logged and the action it reports on
   * still stands (the in-app alert has been raised). */
  async send(m: MailMessage): Promise<void> {
    const url = m.action ? MailService.appUrl(m.action.path) : null;
    const text = [...m.paragraphs, ...(url ? [`${m.action!.label}: ${url}`] : []), '', 'Setjeka Group'].join('\n\n');
    if (!this.transport) {
      this.logger.log(`Email (no SMTP server configured) to ${m.to}: ${m.subject}${url ? ` - ${url}` : ''}`);
      return;
    }
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2a24;max-width:560px">
<div style="background:#0e3d2c;color:#fff;padding:14px 18px;font-weight:bold;letter-spacing:.5px">SETJEKA GROUP</div>
<div style="padding:18px">${m.paragraphs.map((p) => `<p style="margin:0 0 12px">${escape(p)}</p>`).join('')}
${url ? `<p style="margin:20px 0"><a href="${escape(url)}" style="background:#0e7a4f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">${escape(m.action!.label)}</a></p>` : ''}
<p style="margin:18px 0 0;color:#6b766f;font-size:12px">This is an automatic message from the Setjeka platform.</p></div></div>`;
    try {
      await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text, html });
    } catch (e) {
      this.logger.warn(`Email to ${m.to} failed: ${(e as Error).message}`);
    }
  }
}
