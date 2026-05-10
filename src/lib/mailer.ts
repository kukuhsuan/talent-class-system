import nodemailer from "nodemailer";

export function createTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export async function sendMail(to: string, subject: string, html: string) {
  const transporter = createTransport();
  await transporter.sendMail({
    from: `才藝課管理 <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });
}
