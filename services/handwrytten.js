const axios = require('axios');

const HANDWRYTTEN_API_KEY = process.env.HANDWRYTTEN_API_KEY;
const HANDWRYTTEN_API_SECRET = process.env.HANDWRYTTEN_API_SECRET;

// Parse full address into Handwrytten format
function parseAddress(fullAddress) {
  const lines = fullAddress.split('\n').map(l => l.trim()).filter(l => l);
  
  if (lines.length < 2) {
    throw new Error('Invalid address format');
  }
  
  const name = lines[0];
  const address1 = lines[1] || '';
  const address2 = lines[2] || '';
  
  // Parse city, state, zip from last line
  let city = '';
  let state = '';
  let zip = '';
  
  const lastLine = lines[lines.length - 1];
  const match = lastLine.match(/^([^,]+),?\s*([A-Za-z]{2})?\s*(\d{5}(?:-\d{4})?)?$/);
  
  if (match) {
    city = match[1] || '';
    state = match[2] || '';
    zip = match[3] || '';
  }
  
  return {
    name,
    address1,
    address2,
    city,
    state,
    zip,
    country: 'US' // Default to US, could be expanded
  };
}

// Get available handwriting styles from Handwrytten
async function getHandwritingStyles() {
  try {
    const response = await axios.get('https://api.handwrytten.com/v1/cards/list', {
      params: {
        apiKey: HANDWRYTTEN_API_KEY,
        apiSecret: HANDWRYTTEN_API_SECRET
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching handwriting styles:', error);
    return [];
  }
}

// Send a letter via Handwrytten API
async function sendLetter(recipientData, message, options = {}) {
  if (!HANDWRYTTEN_API_KEY || !HANDWRYTTEN_API_SECRET) {
    throw new Error('Handwrytten API credentials not configured');
  }
  
  try {
    // Parse the full address
    const parsedAddress = parseAddress(recipientData.fanmail_address);
    
    // Map our handwriting styles to Handwrytten fonts
    const fontMap = {
      'casual': 'font_cursive',      // Casual handwriting
      'elegant': 'font_formal',      // Elegant/formal
      'playful': 'font_childish'     // Playful/fun
    };
    
    const font = fontMap[options.handwriting_style] || 'font_cursive';
    
    const payload = {
      apiKey: HANDWRYTTEN_API_KEY,
      apiSecret: HANDWRYTTEN_API_SECRET,
      card_id: options.card_id || '1', // Default card template
      font: font,
      message: message,
      recipient: {
        name: parsedAddress.name,
        address: parsedAddress.address1,
        address2: parsedAddress.address2,
        city: parsedAddress.city,
        state: parsedAddress.state,
        zip: parsedAddress.zip,
        country: parsedAddress.country
      },
      // Optional fields
      insert_address: options.return_address || null,
      sender_name: options.sender_name || 'A Fan',
      gift_message: options.gift_message || null
    };
    
    console.log('Sending letter to Handwrytten:', {
      recipient: payload.recipient.name,
      city: payload.recipient.city,
      state: payload.recipient.state
    });
    
    const response = await axios.post('https://api.handwrytten.com/v1/letters/send', payload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    return {
      success: true,
      order_id: response.data.id || response.data.order_id,
      status: response.data.status || 'sent',
      preview_url: response.data.preview_url || null,
      raw_response: response.data
    };
    
  } catch (error) {
    console.error('Error sending letter with Handwrytten:', error.response?.data || error.message);
    throw new Error(`Failed to send letter: ${error.response?.data?.message || error.message}`);
  }
}

// Check status of a sent letter
async function checkLetterStatus(orderId) {
  try {
    const response = await axios.get('https://api.handwrytten.com/v1/letters/status', {
      params: {
        apiKey: HANDWRYTTEN_API_KEY,
        apiSecret: HANDWRYTTEN_API_SECRET,
        id: orderId
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error checking letter status:', error);
    throw error;
  }
}

module.exports = { 
  sendLetter, 
  getHandwritingStyles, 
  checkLetterStatus,
  parseAddress 
};
