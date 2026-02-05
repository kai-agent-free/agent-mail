/**
 * Verify Moltbook API key and get agent info
 */
async function verifyMoltbookKey(apiKey) {
  try {
    const response = await fetch('https://www.moltbook.com/api/v1/agents/me', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (!data.success || !data.agent) {
      return null;
    }
    
    // Only allow verified agents
    if (!data.agent.is_claimed) {
      return null;
    }
    
    return {
      id: data.agent.id,
      name: data.agent.name,
      verified: data.agent.is_claimed
    };
  } catch (err) {
    console.error('Moltbook verification error:', err);
    return null;
  }
}

module.exports = { verifyMoltbookKey };
