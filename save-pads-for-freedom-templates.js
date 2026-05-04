import dotenv from 'dotenv';
dotenv.config();
import { connectMongo } from './src/db/mongo.js';
import { CampaignTemplate } from './src/models/CampaignTemplate.js';
await connectMongo();

const campaignName = 'Pads for Freedom';

const aboutUsBlock = `<p><strong>About KHUSHII:</strong><br>
KHUSHII (Kinship for Humanitarian Social and Holistic Intervention in India) is an independent, not-for-profit organization founded in 2003 by a group of dedicated philanthropists. With 21 years of on-ground experience, KHUSHII operates across 13 states in India, committed to driving positive change and ensuring that no child is left behind.<br>
Registration Number: S/47900/20034<br>
Unique Registration Number: AAATK6911AF20210<br>
FCRA Registration Number: 231660833<br>
Recognized by: Central Government, State Governments, Regulatory Bodies<br>
Website link: <a href="www.khushii.org">www.khushii.org</a><br>
Campaign page link: <a href="www.khushii.org/pads-for-freedom">www.khushii.org/pads-for-freedom</a><br>
Campaign Instagram link: <a href="www.instagram.com/pads4freedom">www.instagram.com/pads4freedom</a></p>`;

const templates = {
  1: `<p>Dear {recipientName},</p>
<p>Each year in India, nearly <strong>23 million girls</strong> leave school - not because they want to, but because they lack access to something as basic as sanitary pads.</p>
<p>When I first came across this, it stayed with me.</p>
<p>I volunteer with Pads for Freedom, an initiative working to ensure that no girl's education is disrupted by her period. Alongside providing safe, biodegradable sanitary pads, we also run counselling sessions that replace silence and stigma with awareness and confidence.</p>
<p>I'm reaching out because people like you - respected, thoughtful, and influential in your circles - can help shift this reality in a meaningful way.</p>
<p>Would you be open to exploring a role as a <strong>Pads for Freedom Cause Champion</strong>?</p>
<p>Warmly,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>
${aboutUsBlock}`,

  2: `<p>Dear {recipientName},</p>
<p>I just wanted to gently follow up on my previous message.</p>
<p>Movements like Pads for Freedom don't grow through noise - they grow through individuals who choose to care, and act in their own way.</p>
<p>Being a <strong>Cause Champion</strong> doesn't demand large commitments. Often, it simply begins with lending your voice and helping start the right conversations.</p>
<p>If this resonates even a little, I'd be happy to share more at a time convenient for you.</p>
<p>Warm regards,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  3: `<p>Hi {recipientName},</p>
<p>One thing volunteering here has made very clear to me: When a girl doesn't have access to sanitary pads, it often means missed school days, loss of confidence, and, over time, missed opportunities.</p>
<p>Pads for Freedom goes beyond distribution - we create safe spaces where girls can ask questions, understand their bodies, and feel comfortable with something entirely natural.</p>
<p>As a <strong>Cause Champion</strong>, you help normalise these conversations - in homes, workplaces, and communities.</p>
<p>Would you be open to a short conversation to explore this further?</p>
<p>With warmth,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  4: `<p>Hello {recipientName},</p>
<p>I wanted to share a small moment from the ground.</p>
<p>Recently, we conducted a menstrual health session with schoolgirls - what began with hesitation slowly turned into questions, smiles, and a visible sense of ease.</p>
<p>It's moments like these that remind us how much change is possible.</p>
<p>Support from <strong>Cause Champions</strong> is what enables these interactions to happen.</p>
<p>If this resonates with you, I'd love to share how you could be a part of creating more such moments.</p>
<p>Warmly,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  5: `<p>Dear {recipientName},</p>
<p>Becoming a <strong>Pads for Freedom Cause Champion</strong> is simple and flexible. It could mean:</p>
<p>• Speaking about the issue within your network<br>
• Starting a fundraiser - without any personal financial obligation<br>
• Helping more people understand why menstrual dignity matters</p>
<p>There's no fixed template - just your voice, your authenticity, and your belief in the cause.</p>
<p>If this feels like something you'd like to do, could we find a few minutes to discuss what it might look like for you?</p>
<p>Best,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  6: `<p>Dear {recipientName},</p>
<p>I hope you've been well. I wanted to reach out once more before pausing, and to thank you for taking the time to read my messages - I know how full days can get.</p>
<p>If Pads for Freedom is something you'd like to explore, even briefly, I'd truly value connecting.</p>
<p>And if now isn't the right time, I completely understand.</p>
<p>Thank you again for your time and consideration.</p>
<p>Warm wishes,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,

  7: `<p>Dear {recipientName},</p>
<p>Thank you once again for your time and attention. I'll step back after this, but the invitation remains open.</p>
<p>If at any point you'd like to support girls in continuing their education through Pads for Freedom - as a Cause Champion or in any other way - I'd be glad to reconnect.</p>
<p>Until then, thank you for all that you already do to make the world a little more equal.</p>
<p>With warm regards,<br>
<strong>{senderName}</strong><br>
Volunteer | Pads for Freedom<br>
KHUSHII NGO</p>`,
};

const subjectLines = {
  1: '23 million girls. One preventable reason.',
  2: 'Re: 23 million girls. One preventable reason.',
  3: 'Re: 23 million girls. One preventable reason.',
  4: 'Re: 23 million girls. One preventable reason.',
  5: 'Re: 23 million girls. One preventable reason.',
  6: 'Re: 23 million girls. One preventable reason.',
  7: 'Re: 23 million girls. One preventable reason.',
};

await CampaignTemplate.deleteMany({ campaignName });

await CampaignTemplate.create({
  campaignName,
  templates,
  subjectLines,
});

console.log(`✅ Saved "${campaignName}" campaign templates to database`);
console.log(`   - 7 touchpoint templates (replaced previous)`);
console.log(`   - Subject line touchpoint 1: ${subjectLines[1]}`);
console.log(`   - Placeholders: {recipientName}, {senderName}`);
process.exit(0);
