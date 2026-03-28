import dotenv from 'dotenv';
dotenv.config();

const wpKey = process.env.WHATSAPP_API_KEY;
const wpPhoneId = process.env.WHATSAPP_PHONE_ID;
const wpEnabled = !!wpKey && !!wpPhoneId;

export const sendWhatsAppNotification = async (phoneNumber, templateId, language = 'pt_BR', components = []) => {
  if (!wpEnabled) return console.log(`[WhatsApp Mock] Message to ${phoneNumber} - Template: ${templateId}`);

  try {
    // Official WhatsApp Cloud API
    const response = await fetch(`https://graph.facebook.com/v17.0/${wpPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${wpKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'template',
        template: {
          name: templateId,
          language: { code: language },
          components,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('WhatsApp API error:', err);
    }
  } catch (error) {
    console.error('WhatsApp Service Error:', error);
  }
};

export const sendAIFinancialTip = async (phoneNumber, text) => {
  if (!wpEnabled) return console.log(`[WhatsApp AI Mock] Tip to ${phoneNumber}: ${text}`);
  // Logic to send text specifically from Lume AI assistant via WhatsApp
};
