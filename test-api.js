const axios = require('axios');

async function testAnalysisEngine() {
  const payload = {
    fileCode: "function authenticateUser(token) { if(!token) throw new Error('Unauthorized'); return true; }",
    inboundDeps: ["routes/auth.js"],
    outboundDeps: ["utils/jwt.js"],
    targetLanguage: "Spanish"
  };

  try {
    const response = await axios.post('http://localhost:3000/api/analyze-node', payload);
    console.log('Success! Response data:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error! Status:', error.response?.status);
    console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
  }
}

testAnalysisEngine();
