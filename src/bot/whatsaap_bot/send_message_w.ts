import axios from 'axios';

// Function to send a reply message using WhatsApp API
const sendMessageW = async (recipientId: string, message: string) => {
  const axios = require('axios');

  const url = `https://graph.facebook.com/v16.0/${process.env.WHATSAPP_NUM_ID}/messages`;
  const token = process.env.WHATSAPP_ACCESS_TOK; // Replace with your API token

  const data = {
    messaging_product: 'whatsapp',
    to: recipientId,
    text: { body: message },
  };

  axios
    .post(url, data, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
    .then((response: any) => {
      console.log('Message sent successfully:', response.data);
    })
    .catch((error: any) => {
      console.error('Error sending message:', error.response.data);
    });
};

export default sendMessageW;
