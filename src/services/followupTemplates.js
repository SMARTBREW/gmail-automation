/**
 * 5-Touchpoint Follow-up Email Templates
 * Each template is designed for a specific touchpoint in the sequence
 */

export const followupTemplates = {
  1: (campaign) => {
    // First follow-up - gentle reminder
    return {
      subject: `Re: ${campaign.subject}`,
      body: `<p>Hi there,</p>
<p>I hope this message finds you well. I wanted to gently follow up on my earlier message about ${campaign.subject}.</p>
<p>I'd love to hear your thoughts when you have a moment.</p>
<p>Warm regards,</p>`
    };
  },
  
  2: (campaign) => {
    // Second follow-up - add value
    return {
      subject: `Re: ${campaign.subject}`,
      body: `<p>Hi there,</p>
<p>I wanted to check in regarding my previous message. I believe this could be valuable for you, and I'd be happy to discuss how we might work together.</p>
<p>Would you be open to a brief conversation?</p>
<p>Warm regards,</p>`
    };
  },
  
  3: (campaign) => {
    // Third follow-up - social proof or urgency
    return {
      subject: `Following up on ${campaign.subject}`,
      body: `<p>Hi there,</p>
<p>I wanted to follow up one more time regarding my previous message. I understand you're busy, but I truly believe this could be beneficial.</p>
<p>If you have any questions or concerns, I'm here to help. Just reply to this email.</p>
<p>Warm regards,</p>`
    };
  },
  
  4: (campaign) => {
    // Fourth follow-up - final attempt with clear CTA
    return {
      subject: `One last check-in: ${campaign.subject}`,
      body: `<p>Hi there,</p>
<p>I know you're busy, but I wanted to make one final attempt to connect regarding my previous message.</p>
<p>If you're not interested, no worries at all—just let me know and I'll remove you from my list. Otherwise, I'd love to hear from you.</p>
<p>Warm regards,</p>`
    };
  },
  
  5: (campaign) => {
    // Fifth (final) follow-up - break-up email
    return {
      subject: `Closing the loop on ${campaign.subject}`,
      body: `<p>Hi there,</p>
<p>I've reached out several times about ${campaign.subject}, and I don't want to be a bother.</p>
<p>If you're interested in the future, feel free to reach out. Otherwise, I'll close this thread and respect your decision.</p>
<p>Thank you for your time, and best of luck with everything.</p>
<p>Warm regards,</p>`
    };
  },
};

/**
 * Get template for a specific touchpoint
 */
export function getTemplate(touchpoint) {
  if (touchpoint < 1 || touchpoint > 5) {
    throw new Error(`Touchpoint must be between 1 and 5, got ${touchpoint}`);
  }
  return followupTemplates[touchpoint];
}

