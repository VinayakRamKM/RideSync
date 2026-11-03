const nodemailer = require('nodemailer');
const db = require('./db');

function transporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

function inviteHtml({ ride, inviter, joinUrl }) {
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#07111f;padding:32px;color:#e8eef8">
    <div style="max-width:520px;margin:auto;background:#0f1c30;border-radius:16px;padding:28px">
      <p style="color:#2ee6a6;font-weight:700;letter-spacing:.04em;margin:0">RIDESYNC</p>
      <h1 style="margin:12px 0 8px;font-size:22px;color:#fff">You're invited on ${ride.name}</h1>
      <p style="color:#b7c3d6;line-height:1.5">
        ${inviter.name} wants you on the group ride from <b style="color:#fff">${ride.startName}</b>
        to <b style="color:#fff">${ride.destName}</b>${ride.routeLabel ? ` via ${ride.routeLabel}` : ''}.
      </p>
      <a href="${joinUrl}" style="display:inline-block;margin:18px 0;background:#2ee6a6;color:#062018;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">
        Join the ride
      </a>
      <p style="font-size:13px;color:#8ea0b8">Or share this code: <b style="color:#2ee6a6">${ride.code}</b></p>
    </div>
  </div>`;
}

async function sendInvite({ to, ride, inviter, joinUrl }) {
  const mail = {
    from: process.env.SMTP_FROM || 'RideSync <noreply@ridesync.local>',
    to,
    subject: `Join ${ride.name} on RideSync`,
    text: `${inviter.name} invited you to ${ride.name} (${ride.startName} → ${ride.destName}). Join: ${joinUrl} Code: ${ride.code}`,
    html: inviteHtml({ ride, inviter, joinUrl }),
  };

  const transport = transporter();
  let delivered = false;
  let error = null;
  if (transport) {
    try {
      await transport.sendMail(mail);
      delivered = true;
    } catch (err) {
      error = err.message;
    }
  }

  db.update((store) => {
    store.outbox.push({
      id: crypto.randomUUID(),
      to,
      subject: mail.subject,
      text: mail.text,
      joinUrl,
      delivered,
      error,
      createdAt: new Date().toISOString(),
    });
  });

  return { delivered, error, joinUrl };
}

module.exports = { sendInvite };
