import OpenAI from 'openai';

let client;
function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    client = new OpenAI({ apiKey });
  }
  return client;
}

function enforceGreetingAndSignature(html, recipientName, senderName) {
  const safeRecipient = recipientName && recipientName.trim() ? recipientName.trim() : '';
  const safeSender = senderName && senderName.trim() ? senderName.trim() : '';

  let body = html || '';
  const greeting = safeRecipient ? `<p>Hi ${safeRecipient},</p>` : `<p>Hello,</p>`;
  if (!/<p>\s*(Hi|Hello)\b/i.test(body)) {
    body = greeting + body;
  } else {
    body = body.replace(/<p>\s*(Hi|Hello)[\s\S]*?<\/p>/i, greeting);
  }
  if (safeSender) {
    const signature = `<p>With Hope & Gratitude,</p>\n<p><strong>${safeSender}</strong><br>\nCampaign Volunteer<br>\nJoint Women's Programme</p>`;
    if (!/With Hope & Gratitude|Warm regards/i.test(body)) {
      body = body + signature;
    } else {
      body = body.replace(/<p>\s*(With Hope & Gratitude|Warm regards)[\s\S]*?Joint Women's Programme<\/p>/i, signature);
      body = body.replace(/<p>\s*(With Hope & Gratitude|Warm regards)[\s\S]*?<\/p>/i, signature);
    }
  }
  return body;
}

function boldKeyDetails(html, extractedDetails) {
  if (!extractedDetails || !html) return html;
  let body = html;
  const keyTerms = [];
  const statMatches = extractedDetails.match(/Statistics:\s*([^\n]+)/);
  if (statMatches && statMatches[1] !== 'N/A') {
    statMatches[1].split(',').forEach(stat => {
      const cleaned = stat.trim();
      if (cleaned) keyTerms.push(cleaned);
    });
  }
  
  const campaignMatches = extractedDetails.match(/Campaign:\s*([^\n]+)/);
  if (campaignMatches && campaignMatches[1] !== 'N/A') {
    campaignMatches[1].split(',').forEach(name => {
      const cleaned = name.trim();
      if (cleaned) keyTerms.push(cleaned);
    });
  }
  
  const orgMatches = extractedDetails.match(/Organization:\s*([^\n]+)/);
  if (orgMatches && orgMatches[1] !== 'N/A') {
    orgMatches[1].split(',').forEach(org => {
      const cleaned = org.trim();
      if (cleaned) keyTerms.push(cleaned);
    });
  }
  
  const initiativeMatches = extractedDetails.match(/Initiatives:\s*([^\n]+)/);
  if (initiativeMatches && initiativeMatches[1] !== 'N/A') {
    initiativeMatches[1].split(',').forEach(init => {
      const cleaned = init.trim();
      if (cleaned) keyTerms.push(cleaned);
    });
  }
  
  const roleMatches = extractedDetails.match(/Role:\s*([^\n]+)/);
  if (roleMatches && roleMatches[1] !== 'N/A') {
    roleMatches[1].split(',').forEach(role => {
      const cleaned = role.trim();
      if (cleaned) keyTerms.push(cleaned);
    });
  }

  keyTerms.sort((a, b) => b.length - a.length);
  keyTerms.forEach(term => {
    if (term.length > 2) {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!<[^>]*)(${escapedTerm})(?![^<]*>)`, 'gi');
      body = body.replace(regex, '<strong>$1</strong>');
    }
  });
  return body;
}

export async function generateFollowUp({ subject, threadSummary, senderName, recipientName, campaignContext, firstEmailBody, touchpoint = 2 }) {
  const openai = getClient();
  let extractedRecipientName = recipientName;
  if (!extractedRecipientName && firstEmailBody) {
    const nameMatch = firstEmailBody.match(/(?:Dear|Hi|Hello)\s+([A-Za-z]+)/i);
    if (nameMatch && nameMatch[1]) {
      extractedRecipientName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
    }
  }
  const system = 'You write empathetic, emotionally resonant follow-up emails with CLEAR paragraph breaks. You MUST extract and explicitly include ALL key details from the original message. Tone: warm, human, respectful, genuinely caring, gently persuasive. Each paragraph should be SHORT (2-3 sentences max). Use plain HTML only. NEVER invent or swap names. Always sign off with the provided sender name when available.';
  const safeRecipient = extractedRecipientName || '';
  const safeSender = senderName || '';
  const greeting = safeRecipient ? `Hi ${safeRecipient},` : 'Hello,';
  const campaign = campaignContext ? `\n\nCampaign context:\n${campaignContext}` : '';

  const touchpointVariations = {
    2: 'gentle reminder with statistics',
    3: 'personal appeal emphasizing impact',
    4: 'brief check-in with renewed urgency',
    5: 'final heartfelt appeal',
  };
  const variation = touchpointVariations[touchpoint] || 'follow-up';
  let extractedDetails = '';
  if (firstEmailBody) {
    const stats = (firstEmailBody.match(/\d+\s*million|million\s+\d+|1\s*out\s*of\s*\d+\s*girls|around\s*\d+\s*million/gi) || []).join(', ');
    const campaignNames = (firstEmailBody.match(/["'"]([^"'"]+(?:Hope|Wings)[^"'"]*)["'"]/gi) || []).map(m => m.replace(/["'"]/g, '')).join(', ');
    const orgNames = (firstEmailBody.match(/Joint\s+Women'?s?\s+Programme|JWP|Team\s+JWP/gi) || []).join(', ');
    const initiatives = (firstEmailBody.match(/(?:reusable|biodegradable|sustainable)\s+(?:cloth\s+)?pads|menstrual\s+(?:and\s+mental\s+)?health\s+(?:counselling|education)|safe\s+spaces\s+for\s+menstrual\s+health\s+education/gi) || []).join(', ');
    const roles = (firstEmailBody.match(/(?:campaign|cause)\s+ambassador|key\s+voice/gi) || []).join(', ');
    
    const emotionalPhrases = [];
    if (firstEmailBody.match(/close\s+to\s+(?:my|our)\s+heart/i)) emotionalPhrases.push('close to heart');
    if (firstEmailBody.match(/end\s+period\s+poverty/i)) emotionalPhrases.push('end period poverty');
    if (firstEmailBody.match(/no\s+girl\s+(?:has\s+to\s+|should\s+)?drop\s+out\s+of\s+school/i)) emotionalPhrases.push('no girl drops out');
    if (firstEmailBody.match(/(?:inspire|empower|amplify|support)/i)) emotionalPhrases.push('inspiring/empowering');
    if (firstEmailBody.match(/dream\s+(?:a\s+little\s+)?bigger|lasting\s+change|spark\s+(?:real\s+)?change/i)) emotionalPhrases.push('lasting change');
    if (firstEmailBody.match(/(?:Rural|rural)\s+India/i)) emotionalPhrases.push('Rural India');
    extractedDetails = `\n\n=== MUST INCLUDE THESE EXACT DETAILS ===\nStatistics: ${stats || 'N/A'}\nCampaign: ${campaignNames || 'N/A'}\nOrganization: ${orgNames || 'N/A'}\nInitiatives: ${initiatives || 'N/A'}\nRole: ${roles || 'N/A'}\nEmotional themes: ${emotionalPhrases.join(', ') || 'N/A'}`;
  }
  
  const user = `Recipient: ${safeRecipient}\nSender: ${safeSender}${campaign}${extractedDetails}\n\nOriginal campaign email (READ CAREFULLY - extract key details, tone, and structure from this):\n${firstEmailBody ? firstEmailBody.substring(0, 2500) : ''}\n\nTask: Write an emotionally resonant follow-up email with EXACTLY 5 paragraphs.\n\nIMPORTANT: This is touchpoint ${touchpoint}. Vary your approach: ${variation}.\n\nYou MUST write ALL 5 paragraphs in this EXACT order:\n\n=== PARAGRAPH 1 (ABSOLUTELY MANDATORY - WILL BE REJECTED IF MISSING - 3-4 sentences) ===\nMUST start EXACTLY with: "${greeting} I hope this message finds you well. I wanted to gently follow up on my earlier message."\n\nThen you MUST include the OPENING PARAGRAPH from the original email above. Look at the FIRST paragraph of the original email and copy its structure:\n- If it says "Did you know that each year, millions of girls in India are forced to abandon their education..." → USE THAT EXACT LANGUAGE\n- If it mentions statistics like "affecting around 23 million girls annually" → INCLUDE THAT\n- If it talks about "period poverty" or other issues → MENTION IT\n- Copy the emotional framing from the original's opening\n\nEXAMPLE: If original starts with "Did you know that each year, millions of girls in India are forced to abandon their education simply because they lack access to basic menstrual hygiene products and the awareness they need to manage their periods? This is the harsh reality of period poverty, affecting around 23 million girls annually."\n\nYour paragraph 1 MUST be: "${greeting} I hope this message finds you well. I wanted to gently follow up on my earlier message. Did you know that each year, millions of girls in India are forced to abandon their education simply because they lack access to basic menstrual hygiene products and the awareness they need to manage their periods? This is the harsh reality of period poverty, affecting around 23 million girls annually."\n\n=== PARAGRAPH 2 (REQUIRED - 2-3 sentences) ===\nMUST start with: "Through [Organization from extracted details]'s [Campaign Name from extracted details] campaign"\nMention the EXACT initiatives from the original email (extracted details above)\nUse the SAME emotional language as the original (e.g., if original says "end period poverty", use that; if it says "combat climate crisis", use that)\nExample structure: "Through [organization]'s [campaign] campaign, we're working to [mission] by providing [specific initiatives from original]. We're creating opportunities to [impact from original]."\n\n=== PARAGRAPH 3 (REQUIRED - 2-3 sentences) ===\nReference the EXACT role from extracted details (e.g., "campaign ambassador", "key voice", "partner", "supporter")\nMention the specific impact mentioned in the original email (e.g., "inspire others", "spreading awareness", "reach more communities", etc.)\nUse phrases directly from the original email about the impact\nExample structure: "Your voice as a [role from original] has the power to [impact from original]. Your [quality from original] could [specific action from original]."\n\n=== PARAGRAPH 4 (REQUIRED - 2-3 sentences) ===\nFocus on personal impact and hope using language from the original\nUse the specific impact phrases from the original email (e.g., "help girls dream bigger", "lasting change", "combat the crisis", etc.)\nBe heartfelt and mission-driven, mirroring the tone of the original\nExample structure: "Every bit of your support will [specific impact from original]. Together, we can [mission outcome from original]."\n\n=== PARAGRAPH 5 (REQUIRED - 1-2 sentences + signature) ===\nCTA: Extract the CTA style from the original (e.g., "connect for a brief conversation", "schedule a call", "discuss further")\nAdd emotional appeal if present in original (e.g., "spark real change", "make a difference", etc.)\nClose: "Looking forward to hearing from you."\nMUST end with signature in new paragraph: "<p>With Hope & Gratitude,</p><p><strong>${safeSender}</strong><br>Campaign Volunteer<br>Joint Women's Programme</p>"\nExample structure: "I'd truly love to [CTA from original]. [Optional emotional appeal from original]. Looking forward to hearing from you."\nThen add: "<p>With Hope & Gratitude,</p><p><strong>${safeSender}</strong><br>Campaign Volunteer<br>Joint Women's Programme</p>"\n\nCOMPLETE EXAMPLE FOR REFERENCE (adapt to YOUR campaign from original email above):\n\n<p>Hi ${safeRecipient}, I hope this message finds you well. I wanted to gently follow up on my earlier message. [EXTRACT AND USE THE OPENING PARAGRAPH CONTENT FROM THE ORIGINAL EMAIL - include the main issue, key statistics, and emotional hook exactly as presented in the original]</p>\n\n<p>[Extract organization and campaign name from original]. [Extract specific initiatives and mission from original]. [Extract impact statement from original].</p>\n\n<p>[Extract role from original] has the power to [extract impact from original]. [Extract qualities/actions from original].</p>\n\n<p>[Extract personal impact phrases from original]. Together, we can [extract outcome from original].</p>\n\n<p>I'd truly love to connect for a brief conversation—even a short discussion could spark real change. Looking forward to hearing from you.</p>\n\n<p>With Hope & Gratitude,</p><p><strong>${safeSender}</strong><br>Campaign Volunteer<br>Joint Women's Programme</p>\n\nCRITICAL INSTRUCTIONS:\n1. READ the original email above CAREFULLY\n2. PARAGRAPH 1 IS MANDATORY: "${greeting} I hope this message finds you well. I wanted to gently follow up on my earlier message." + [COPY THE FIRST PARAGRAPH FROM ORIGINAL EMAIL WITH STATISTICS]\n3. EXTRACT the exact language, phrases, statistics, campaign details, initiatives, and emotional tone from original\n4. MIRROR the structure and wording from the original\n5. DO NOT invent new phrases - use what's in the original\n6. MUST write ALL 5 paragraphs - PARAGRAPH 1 WITH STATISTICS IS NON-NEGOTIABLE\n7. MUST include sender name after "Warm regards,"\n\nIF YOU SKIP PARAGRAPH 1 WITH THE STATISTICS FROM THE ORIGINAL EMAIL, YOUR RESPONSE WILL BE REJECTED.\n\nNOW WRITE YOUR FOLLOW-UP. START WITH PARAGRAPH 1 THAT INCLUDES THE STATISTICS AND OPENING FROM THE ORIGINAL EMAIL.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  });

  let raw = resp.choices?.[0]?.message?.content?.trim() || '';
  const hasStatistic = /\d+\s*million|millions\s+of\s+girls|forced\s+to\s+abandon|lack\s+access|period\s+poverty/i.test(raw);
  if (!hasStatistic && firstEmailBody) {
    console.warn('AI skipped statistics in paragraph 1. Forcing inclusion...');
    const firstParagraphMatch = firstEmailBody.match(/<p>(?:Dear|Hi|Hello)[^<]*<\/p>\s*<p>([^<]+(?:<strong>[^<]+<\/strong>[^<]*)*)<\/p>/i);
    if (firstParagraphMatch) {
      const originalOpening = firstParagraphMatch[1].trim();
      const followupPhrase = 'I wanted to gently follow up on my earlier message.';
      const insertPoint = raw.indexOf(followupPhrase);
      if (insertPoint !== -1) {
        const insertEnd = insertPoint + followupPhrase.length;
        const before = raw.substring(0, insertEnd);
        const after = raw.substring(insertEnd);
        raw = before + ' ' + originalOpening + after;
      }
    }
  }

  let formatted = enforceGreetingAndSignature(raw, extractedRecipientName, senderName);
  formatted = boldKeyDetails(formatted, extractedDetails);
  return formatted;
}


