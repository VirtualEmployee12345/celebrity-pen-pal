
const axios = require('axios');
const HANDWRYTTEN_API_KEY = process.env.HANDWRYTTEN_API_KEY;
const HANDWRYTTEN_API_SECRET = process.env.HANDWRYTTEN_API_SECRET;

async function sendLetter(recipient, message) {
  try {
    const response = await axios.post('https://api.handwrytten.com/v1/letters/create', {
      apiKey: HANDWRYTTEN_API_KEY,
      apiSecret: HANDWRYTTEN_API_SECRET,
      recipient: {
        name: recipient.name,
        address1: recipient.address,
      },
      message: message,
      font: 'auto', // Let Handwrytten choose a font
    });
    return response.data;
  } catch (error) {
    console.error('Error sending letter with Handwrytten:', error);
    throw error;
  }
}

module.exports = { sendLetter };
