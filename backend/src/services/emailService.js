import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = 'Lume <onboarding@resend.dev>'; // Needs to be verified domain in production

export const sendWelcomeEmail = async (toEmail, name) => {
  if (!resend) return console.log('[Email Mock] Welcome email to:', toEmail);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: '☀️ Bem-vindo ao Lume!',
      html: `
        <div style="font-family: Arial, sans-serif; color: #1e2538; padding: 20px;">
          <h2>Olá, ${name}! 👋</h2>
          <p>Que bom ter você no Lume. Nossa missão é te dar clareza financeira absoluta.</p>
          <p>Para começar, acesse seu dashboard e termine de configurar seus objetivos.</p>
          <a href="${process.env.FRONTEND_URL}/login" style="background:#d4a843; color:#111; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold; display:inline-block; margin-top:10px;">
            Acessar o Lume
          </a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
};

export const sendPaymentFailedEmail = async (toEmail, name) => {
  if (!resend) return console.log('[Email Mock] Payment failed email to:', toEmail);

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: '⚠️ Problema no pagamento da sua assinatura Lume',
      html: `
        <div style="font-family: Arial, sans-serif; color: #1e2538; padding: 20px;">
          <h2>Olá, ${name}.</h2>
          <p>Não conseguimos processar o pagamento da sua assinatura. Seu plano premium foi pausado.</p>
          <p>Por favor, atualize seus dados de pagamento para reativar as funcionalidades.</p>
          <a href="${process.env.FRONTEND_URL}/checkout" style="background:#f43f5e; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px; font-weight:bold; display:inline-block; margin-top:10px;">
            Atualizar Pagamento
          </a>
        </div>
      `,
    });
  } catch (error) {
    console.error('Error sending payment failed email:', error);
  }
};

export const sendBillReminderEmail = async (toEmail, name, billName, amount, dueDay) => {
  if (!resend) return console.log('[Email Mock] Bill reminder email to:', toEmail);
  // Email template for recurring bills approaching due date
};
